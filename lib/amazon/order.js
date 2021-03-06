const express = require("express")
const app = express();
const { pool } = require("../../dbConfig");
const jsforce = require('jsforce')
const salesLogin = require('../routes')
const SellingPartnerAPI = require('amazon-sp-api');
app.use(express.static('public'));

module.exports = function (app) {
    (async () => {

        try {

            app.post('/amazonOrderSync', salesLogin, async function (req, res, next) {

                const client = await pool.connect();
                await client.query('BEGIN');
                await JSON.stringify(client.query("SELECT * FROM amazon_credentials WHERE email=$1", [req.user.email], async function (err, result) {
                    if (err) { console.log(err); }

                    if (result.rows.length === 0) {
                        req.flash('error_msg', '• Amazon Credentials are Missing');
                        return res.redirect('/amazon')
                    }
                    else if (result.rows.length > 0) {
                        var Aqxolt_Customer = req.user.aqxolt_customer;
                        var Aqxolt_Channel = req.user.aqxolt_channel;
                        var Aqxolt_Order_Profile = req.user.aqxolt_order_profile;
                        var oauth_token = req.user.oauth_token;
                        var instance_url = req.user.instance_url;

                        for (let z in result.rows) {
                            setTimeout(async function () {
                                if (req.user.email === result.rows[z].email) {
                                    var Email = result.rows[z].email;
                                    var Region = 'eu';
                                    var RefreshToken = result.rows[z].refresh_token;;
                                    var ClientId = result.rows[z].amazon_app_client_id;
                                    var ClientSecret = result.rows[z].amazon_app_client_secret;
                                    var AWSAccessKey = result.rows[z].aws_access_key;
                                    var AWSSecretAccessKey = result.rows[z].aws_secret_access_key;
                                    var AWSSellingPartnerRole = result.rows[z].aws_selling_partner_role;
                                    var MarketplaceId = result.rows[z].marketplace_id;

                                    if (!Aqxolt_Channel && !Aqxolt_Order_Profile && !Aqxolt_Customer && !RefreshToken || !ClientId || !ClientSecret || !AWSAccessKey || !AWSSecretAccessKey || !AWSSellingPartnerRole) {
                                        req.flash('error_msg', '• Order Profile, Customer, Channel And Amazon Credentials are Missing');
                                        res.redirect('/amazon')
                                    }
                                    else if (!RefreshToken || !ClientId || !ClientSecret || !AWSAccessKey || !AWSSecretAccessKey || !AWSSellingPartnerRole) {
                                        req.flash('error_msg', '• Amazon Credentials are Missing');
                                        res.redirect('/amazon')
                                    }
                                    else if (!Aqxolt_Channel) {
                                        req.flash('error_msg', '• Aqxolt Channel is Empty in Aqxolt Info');
                                        res.redirect('/amazon')
                                    }
                                    else if (!Aqxolt_Order_Profile) {
                                        req.flash('error_msg', '• Order Profile is Empty in Aqxolt Info');
                                        res.redirect('/amazon')
                                    }
                                    else if (!Aqxolt_Customer) {
                                        req.flash('error_msg', '• Aqxolt Customer is Empty in Aqxolt Info');
                                        res.redirect('/amazon')
                                    }
                                    else if (!Aqxolt_Customer && !Aqxolt_Order_Profile && !Aqxolt_Channel) {
                                        req.flash('error_msg', '• Aqxolt Customer, Channel And Order Profile is Empty in Aqxolt Info');
                                        res.redirect('/amazon')
                                    }
                                    else if (Aqxolt_Customer && Aqxolt_Order_Profile && Aqxolt_Channel && RefreshToken && ClientId && ClientSecret && AWSAccessKey && AWSSecretAccessKey && AWSSellingPartnerRole) {

                                        // console.log('Region->' + Region);
                                        let sellingPartner = new SellingPartnerAPI({
                                            region: Region,
                                            refresh_token: RefreshToken,
                                            credentials: {
                                                SELLING_PARTNER_APP_CLIENT_ID: ClientId,
                                                SELLING_PARTNER_APP_CLIENT_SECRET: ClientSecret,
                                                AWS_ACCESS_KEY_ID: AWSAccessKey,
                                                AWS_SECRET_ACCESS_KEY: AWSSecretAccessKey,
                                                AWS_SELLING_PARTNER_ROLE: AWSSellingPartnerRole
                                            }
                                        });

                                        await sellingPartner.callAPI({
                                            operation: 'getOrders',
                                            endpoint: 'orders',
                                            query: {
                                                MarketplaceIds: MarketplaceId,
                                                LastUpdatedAfter: '2020-09-26'
                                            }
                                        })
                                            .then(result => {
                                                this.resS = result;
                                            })
                                            .catch(err => {
                                                var error = JSON.stringify(err);
                                                var obj = JSON.parse(error);
                                                if (obj.message == "The request has an invalid grant parameter : refresh_token") {
                                                    req.flash('error_msg', '• Invalid Amazon Refresh Token for this seller ' + ClientId);
                                                    res.redirect('/amazon')
                                                } else if (obj.message == "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method. Consult the service documentation for details.") {
                                                    req.flash('error_msg', '• Check your AWS Secret Access Key for this seller ' + ClientId);
                                                    res.redirect('/amazon')
                                                } else if (obj.message == "The security token included in the request is invalid.") {
                                                    req.flash('error_msg', '• Check your security token Key for this seller ' + ClientId);
                                                    res.redirect('/amazon')
                                                } else {
                                                    req.flash('error_msg', '• Invalid Amazon Credentials for this seller ' + ClientId);
                                                    res.redirect('/amazon')
                                                }
                                            })

                                        let resS = this.resS;

                                        if (resS) {

                                            var conn = new jsforce.Connection({
                                                accessToken: oauth_token,
                                                instanceUrl: instance_url
                                            });

                                            // console.log('Response ->', JSON.stringify(resS.Orders));
                                            var AmazonOrderIdList = [];
                                            for (let i in resS.Orders) {
                                                if (resS.Orders[i].AmazonOrderId != "") AmazonOrderIdList.push(resS.Orders[i].AmazonOrderId);
                                            }
                                            // console.log('Response AmazonOrderId ->', JSON.stringify(AmazonOrderIdList));

                                            var BuyerInfo = [];
                                            for (let i in AmazonOrderIdList) {
                                                var BuyerDetails = await sellingPartner.callAPI({
                                                    operation: 'getOrderBuyerInfo',

                                                    path: {
                                                        orderId: AmazonOrderIdList[i]
                                                    }
                                                });
                                                BuyerInfo.push(BuyerDetails);
                                                // console.log('Response BuyerInfo ->', JSON.stringify(BuyerDetails));
                                            }

                                            var AddressInfo = [];
                                            for (let i in AmazonOrderIdList) {
                                                var OrderAddress = await sellingPartner.callAPI({
                                                    operation: 'getOrderAddress',

                                                    path: {
                                                        orderId: AmazonOrderIdList[i]
                                                    }
                                                });
                                                AddressInfo.push(OrderAddress);
                                                // console.log('Response OrderAddress ->', JSON.stringify(OrderAddress));
                                            }

                                            var OrderItems = [];
                                            for (let i in AmazonOrderIdList) {
                                                var getOrderItems = await sellingPartner.callAPI({
                                                    operation: 'getOrderItems',

                                                    path: {
                                                        orderId: AmazonOrderIdList[i]
                                                    }
                                                });
                                                OrderItems.push(getOrderItems);
                                                // console.log('Response OrderItems ->', JSON.stringify(getOrderItems));
                                            }

                                            var OrderItemsList = [];
                                            if (OrderItems != []) {
                                                for (let i in OrderItems) {
                                                    for (let j in OrderItems[i].OrderItems) {
                                                        OrderItemsList.push(OrderItems[i].OrderItems[j]);
                                                    }
                                                }
                                            }

                                            var asinValue = [];
                                            if (OrderItemsList != []) {
                                                for (let i in OrderItemsList) {
                                                    if (OrderItemsList[i].ASIN != '') {
                                                        asinValue.push(OrderItemsList[i].ASIN)
                                                    }
                                                }
                                            }

                                            const uniqVal = (value, index, self) => {
                                                return self.indexOf(value) === index
                                            }

                                            const asinId = asinValue.filter(uniqVal)
                                            // console.log('asinId')
                                            // console.log(asinId)

                                            var prodBrand = [];
                                            for (let i in asinId) {
                                                var CatalogItem = await sellingPartner.callAPI({
                                                    operation: 'getCatalogItem',
                                                    path: {
                                                        asin: asinId[i]
                                                    },
                                                    query: {
                                                        MarketplaceId: MarketplaceId
                                                    }
                                                })
                                                prodBrand.push(CatalogItem);
                                                // console.log('Response CatalogItem ->', JSON.stringify(CatalogItem));
                                            }

                                            var Pricing = [];
                                            for (let i in asinId) {
                                                var prodPrice = await sellingPartner.callAPI({
                                                    operation: 'getPricing',
                                                    query: {
                                                        MarketplaceId: MarketplaceId,
                                                        ItemType: 'Asin',
                                                        Asins: asinId[i]
                                                    }
                                                })
                                                Pricing.push(prodPrice[0].Product);
                                                // console.log('Response Product Price ->', JSON.stringify(prodPrice));
                                            }

                                            var noBuyerEmail = [];
                                            var BuyerNameExist = [];
                                            if (BuyerInfo != []) {
                                                for (let i in BuyerInfo) {
                                                    if (BuyerInfo[i].AmazonOrderId != '' && BuyerInfo[i].BuyerName != undefined && BuyerInfo[i].BuyerName != '') {
                                                        var arlist = {
                                                            AmazonOrderId: BuyerInfo[i].AmazonOrderId,
                                                            BuyerName: BuyerInfo[i].BuyerName,
                                                            BuyerEmail: BuyerInfo[i].BuyerEmail
                                                        }
                                                        BuyerNameExist.push(arlist)
                                                    }
                                                }
                                                // console.log('BuyerNameExist ' + JSON.stringify(BuyerNameExist))
                                            }

                                            if (BuyerInfo != []) {
                                                for (let i in BuyerInfo) {
                                                    if (BuyerInfo[i].AmazonOrderId != '' && BuyerInfo[i].BuyerName == undefined && BuyerInfo[i].BuyerEmail != '' && BuyerInfo[i].BuyerEmail != undefined) {
                                                        var arlist = {
                                                            AmazonOrderId: BuyerInfo[i].AmazonOrderId,
                                                            BuyerEmail: BuyerInfo[i].BuyerEmail
                                                        }
                                                        noBuyerEmail.push(arlist)
                                                    }
                                                }
                                                // console.log('noBuyerEmail ' + JSON.stringify(noBuyerEmail))
                                            }

                                            var buyerEmailName = [];
                                            if (noBuyerEmail != []) {
                                                for (let i in noBuyerEmail) {
                                                    var emailChange = noBuyerEmail[i].BuyerEmail;
                                                    var byEmail = emailChange.split('@', 1);
                                                    byEmail = byEmail.toString().replace(/[]/g, '');
                                                    var buyerList = {
                                                        AmazonOrderId: noBuyerEmail[i].AmazonOrderId,
                                                        BuyerName: byEmail,
                                                        BuyerEmail: noBuyerEmail[i].BuyerEmail
                                                    }
                                                    buyerEmailName.push(buyerList);
                                                }
                                            }
                                            // console.log('buyerEmailName ' + JSON.stringify(buyerEmailName))

                                            var allBuyerDetails = [];

                                            if (buyerEmailName != []) {
                                                for (let i in buyerEmailName) {
                                                    var byList = {
                                                        Name: buyerEmailName[i].BuyerName,
                                                        ERP7__Email__c: buyerEmailName[i].BuyerEmail,
                                                        ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                        ERP7__Account_Profile__c: Aqxolt_Customer,
                                                        ERP7__Account_Type__c: "Customer"
                                                    }
                                                    allBuyerDetails.push(byList)
                                                }
                                            }

                                            if (BuyerNameExist != []) {
                                                for (let i in BuyerNameExist) {
                                                    var byList = {
                                                        Name: BuyerNameExist[i].BuyerName,
                                                        ERP7__Email__c: BuyerNameExist[i].BuyerEmail,
                                                        ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                        ERP7__Account_Profile__c: Aqxolt_Customer,
                                                        ERP7__Account_Type__c: "Customer"
                                                    }
                                                    allBuyerDetails.push(byList)
                                                }
                                            }

                                            // console.log('allBuyerDetails ' + JSON.stringify(allBuyerDetails))

                                            var buyerEmailInfo = [];
                                            var accIdExist = [];
                                            var accUpExist = [];

                                            for (let i in allBuyerDetails) {
                                                buyerEmailInfo.push(allBuyerDetails[i].ERP7__Email__c)
                                            }
                                            // console.log('email ' + email)
                                            var accExist = [];
                                            var accEmailExist = [];
                                            var accNotExist = [];

                                            allBuyerDetails = allBuyerDetails.filter(function ({ name, date, amt }) {
                                                var key = `${name}${date}${amt}`;
                                                return !this.has(key) && this.add(key);
                                            }, new Set);

                                            var pricebook_id;
                                            if (Aqxolt_Order_Profile != null) {
                                                setTimeout(async function () {
                                                    conn.query(`SELECT Id, ERP7__Price_Book__c FROM ERP7__Profiling__c where Id='${Aqxolt_Order_Profile}'`, function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                                req.flash('error_msg', '• Invalid Aqxolt Order Profile Id');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }

                                                        if (result.records.length == 0) {
                                                            req.flash('error_msg', '• Invalid Order Profile Id');
                                                            res.redirect('/amazon')
                                                        }
                                                        else if (result.records.length > 0) {
                                                            pricebook_id = result.records[0].ERP7__Price_Book__c;
                                                            if (Aqxolt_Customer != null) {
                                                                setTimeout(async function () {
                                                                    conn.query(`SELECT Id FROM ERP7__Profiling__c where Id='${Aqxolt_Customer}'`, function (err, result) {
                                                                        if (err) {
                                                                            var error = JSON.stringify(err);
                                                                            var obj = JSON.parse(error);
                                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                                res.redirect('/amazon')
                                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                                res.redirect('/amazon')
                                                                            } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                                                req.flash('error_msg', '• Invalid Aqxolt Customer Id');
                                                                                res.redirect('/amazon')
                                                                            } else {
                                                                                req.flash('error_msg', '• ' + obj.name);
                                                                                res.redirect('/amazon')
                                                                            }
                                                                        }

                                                                        if (result.records.length == 0) {
                                                                            req.flash('error_msg', '• Invalid Customer Profile Id');
                                                                            res.redirect('/amazon')
                                                                        }
                                                                        else if (result.records.length > 0) {
                                                                            if (Aqxolt_Channel != null) {
                                                                                setTimeout(async function () {
                                                                                    conn.query(`SELECT Id FROM ERP7__Channel__c where Id='${Aqxolt_Channel}'`, function (err, result) {
                                                                                        if (err) {
                                                                                            var error = JSON.stringify(err);
                                                                                            var obj = JSON.parse(error);
                                                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                                                res.redirect('/amazon')
                                                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                                                res.redirect('/amazon')
                                                                                            } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                                                                req.flash('error_msg', '• Invalid Aqxolt Channel Id');
                                                                                                res.redirect('/amazon')
                                                                                            }
                                                                                            else {
                                                                                                req.flash('error_msg', '• ' + obj.name);
                                                                                                res.redirect('/amazon')
                                                                                            }
                                                                                        }

                                                                                        if (result.records.length == 0) {
                                                                                            req.flash('error_msg', '• Invalid Aqxolt Channel Id');
                                                                                            res.redirect('/amazon')
                                                                                        }
                                                                                        else if (result.records.length > 0) {
                                                                                            if (buyerEmailInfo.length > 0) {
                                                                                                setTimeout(async function () {
                                                                                                    conn.query("SELECT Id, Name, ERP7__Email__c, ERP7__Order_Profile__c, ERP7__Account_Profile__c,ERP7__Account_Type__c FROM Account WHERE ERP7__Email__c IN ('" + buyerEmailInfo.join("','") + "')", function (err, result) {
                                                                                                        if (err) {
                                                                                                            var error = JSON.stringify(err);
                                                                                                            var obj = JSON.parse(error);
                                                                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                                                                res.redirect('/amazon')
                                                                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                                                                res.redirect('/amazon')
                                                                                                            } else {
                                                                                                                req.flash('error_msg', '• ' + obj.name);
                                                                                                                res.redirect('/amazon')
                                                                                                            }
                                                                                                        }

                                                                                                        if (result.records.length == 0) {
                                                                                                            res.redirect('/index');
                                                                                                            if (allBuyerDetails != []) {
                                                                                                                conn.bulk.pollTimeout = 25000;
                                                                                                                conn.bulk.load("Account", "insert", allBuyerDetails, function (err, rets) {
                                                                                                                    if (err) { return console.error('err 2' + err); }
                                                                                                                    for (var i = 0; i < rets.length; i++) {
                                                                                                                        if (rets[i].success) {
                                                                                                                            console.log("#" + (i + 1) + " insert Account successfully, id = " + rets[i].id);
                                                                                                                        } else {
                                                                                                                            console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                                        }
                                                                                                                    }
                                                                                                                    conInsertion();
                                                                                                                });
                                                                                                            }
                                                                                                        }
                                                                                                        else if (result.records.length > 0) {
                                                                                                            res.redirect('/index');
                                                                                                            for (let i in result.records) {
                                                                                                                for (let j in allBuyerDetails) {
                                                                                                                    if (result.records[i].ERP7__Email__c == allBuyerDetails[j].ERP7__Email__c) {
                                                                                                                        let acclist = {
                                                                                                                            Id: result.records[i].Id,
                                                                                                                            ERP7__Email__c: allBuyerDetails[j].ERP7__Email__c,
                                                                                                                            Name: allBuyerDetails[j].Name,
                                                                                                                            ERP7__Order_Profile__c: allBuyerDetails[j].ERP7__Order_Profile__c,
                                                                                                                            ERP7__Account_Profile__c: allBuyerDetails[j].ERP7__Account_Profile__c,
                                                                                                                            ERP7__Account_Type__c: allBuyerDetails[j].ERP7__Account_Type__c
                                                                                                                        }
                                                                                                                        accExist.push(acclist);
                                                                                                                        accEmailExist.push(allBuyerDetails[j].ERP7__Email__c)
                                                                                                                    }
                                                                                                                }
                                                                                                            }
                                                                                                            // console.log('Exist ' + accEmailExist)
                                                                                                            for (let i in allBuyerDetails) {
                                                                                                                if (!accEmailExist.includes(allBuyerDetails[i].ERP7__Email__c)) accNotExist.push(allBuyerDetails[i])
                                                                                                            }
                                                                                                            // console.log('accExist' + JSON.stringify(accExist))

                                                                                                            if (accNotExist != []) {
                                                                                                                conn.bulk.pollTimeout = 25000;
                                                                                                                conn.bulk.load("Account", "insert", accNotExist, function (err, rets) {
                                                                                                                    if (err) { return console.error('err 2' + err); }
                                                                                                                    for (var i = 0; i < rets.length; i++) {
                                                                                                                        if (rets[i].success) {
                                                                                                                            console.log("#" + (i + 1) + " insert Account successfully, id = " + rets[i].id);
                                                                                                                        } else {
                                                                                                                            console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                                        }
                                                                                                                    }
                                                                                                                });
                                                                                                            }

                                                                                                            if (accExist != []) {
                                                                                                                conn.bulk.pollTimeout = 25000;
                                                                                                                conn.bulk.load("Account", "update", accExist, function (err, rets) {
                                                                                                                    if (err) { return console.error('err 2' + err); }
                                                                                                                    for (var i = 0; i < rets.length; i++) {
                                                                                                                        if (rets[i].success) {
                                                                                                                            console.log("#" + (i + 1) + " update Account successfully, id = " + rets[i].id);
                                                                                                                        } else {
                                                                                                                            console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                                        }
                                                                                                                    }
                                                                                                                    conInsertion();
                                                                                                                });
                                                                                                            }
                                                                                                        }
                                                                                                    });
                                                                                                }, 2000 * z);
                                                                                            }
                                                                                            else {
                                                                                                req.flash('error_msg', `• Order's Not Found`);
                                                                                                return res.redirect('/amazon');
                                                                                            }
                                                                                        }
                                                                                    })
                                                                                }, 1000 * z);
                                                                            }
                                                                        }
                                                                    })
                                                                }, 1000 * z);
                                                            }
                                                        }
                                                    })
                                                }, 1000 * z);
                                            }

                                            function conInsertion() {
                                                var conExist = [];
                                                var conEmailExist = [];
                                                var conNotExist = [];
                                                setTimeout(async function () {
                                                    conn.query("SELECT Id, Name, ERP7__Email__c, ERP7__Order_Profile__c, ERP7__Account_Profile__c, ERP7__Account_Type__c FROM Account WHERE ERP7__Email__c IN ('" + buyerEmailInfo.join("','") + "')", function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }

                                                        if (result.records.length > 0) {
                                                            for (let i in result.records) {
                                                                let acclist = {
                                                                    AccountId: result.records[i].Id,
                                                                    Email: result.records[i].ERP7__Email__c,
                                                                    LastName: result.records[i].Name,
                                                                }
                                                                accUpExist.push(acclist);
                                                                accIdExist.push(result.records[i].Id)

                                                            }
                                                            // console.log('accUpExist' + JSON.stringify(accUpExist))

                                                            accUpExist = accUpExist.filter(function ({ name, date, amt }) {
                                                                var key = `${name}${date}${amt}`;
                                                                return !this.has(key) && this.add(key);
                                                            }, new Set);

                                                            setTimeout(async function () {
                                                                conn.query("SELECT Id, AccountId, LastName, Email FROM Contact WHERE AccountId IN ('" + accIdExist.join("','") + "')", function (err, result) {
                                                                    if (err) {
                                                                        var error = JSON.stringify(err);
                                                                        var obj = JSON.parse(error);
                                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/amazon')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/amazon')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/amazon')
                                                                        }
                                                                    }

                                                                    if (result.records.length == 0) {
                                                                        if (accUpExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Contact", "insert", accUpExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Contact successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                addressInsertion()
                                                                            });
                                                                        }
                                                                    }
                                                                    else if (result.records.length > 0) {
                                                                        for (let i in result.records) {
                                                                            for (let j in accUpExist) {
                                                                                if (result.records[i].Email == accUpExist[j].Email) {
                                                                                    let acclist = {
                                                                                        Id: result.records[i].Id,
                                                                                        AccountId: result.records[i].AccountId,
                                                                                        Email: accUpExist[j].Email,
                                                                                        LastName: accUpExist[j].LastName
                                                                                    }
                                                                                    conExist.push(acclist);
                                                                                    conEmailExist.push(accUpExist[j].Email)
                                                                                }
                                                                            }
                                                                        }
                                                                        // console.log('Exist ' + conExist)
                                                                        for (let i in accUpExist) {
                                                                            if (!conEmailExist.includes(accUpExist[i].Email)) conNotExist.push(accUpExist[i])
                                                                        }
                                                                        // console.log('conNotExist' + JSON.stringify(conNotExist))

                                                                        if (conNotExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Contact", "insert", conNotExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Contact successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                            });
                                                                        }

                                                                        if (conExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Contact", "update", conExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " update Contact successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                addressInsertion()
                                                                            });
                                                                        }

                                                                    }
                                                                    // console.log('Length' + result.records.length)
                                                                })
                                                            }, 2000 * z);
                                                        }
                                                    })
                                                }, 2000 * z);
                                            }

                                            var curContactExist = [];
                                            function addressInsertion() {
                                                var AddressAvailable = [];
                                                if (AddressInfo != []) {
                                                    for (let i in BuyerInfo) {
                                                        for (let j in AddressInfo) {
                                                            if (BuyerInfo[i].AmazonOrderId === AddressInfo[j].AmazonOrderId) {
                                                                if (AddressInfo[j].ShippingAddress != undefined) {
                                                                    if (BuyerInfo[i].BuyerEmail != undefined && BuyerInfo[i].BuyerEmail != '') {
                                                                        if (AddressInfo[j].ShippingAddress.PostalCode != '' && AddressInfo[j].ShippingAddress.City) {
                                                                            var addressList = {
                                                                                BuyerEmail: BuyerInfo[i].BuyerEmail,
                                                                                StateOrRegion: AddressInfo[j].ShippingAddress.StateOrRegion,
                                                                                PostalCode: AddressInfo[j].ShippingAddress.PostalCode,
                                                                                City: AddressInfo[j].ShippingAddress.City,
                                                                                CountryCode: AddressInfo[j].ShippingAddress.CountryCode
                                                                            }
                                                                            AddressAvailable.push(addressList)
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    // console.log('AddressAvailable ' + JSON.stringify(AddressAvailable))
                                                }

                                                setTimeout(async function () {
                                                    conn.query("SELECT Id, Name, Email, AccountId FROM Contact WHERE AccountId IN ('" + accIdExist.join("','") + "')", function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }

                                                        if (result.records.length > 0) {
                                                            for (let i in result.records) {
                                                                var conList = {
                                                                    Name: result.records[i].Name,
                                                                    ContactId: result.records[i].Id,
                                                                    AccountId: result.records[i].AccountId,
                                                                    Email: result.records[i].Email
                                                                }
                                                                curContactExist.push(conList)
                                                            }

                                                            var addInsert = [];
                                                            if (AddressAvailable != []) {
                                                                if (curContactExist != []) {
                                                                    for (let i in AddressAvailable) {
                                                                        for (let j in curContactExist) {
                                                                            if (AddressAvailable[i].BuyerEmail == curContactExist[j].Email) {
                                                                                var list = {
                                                                                    Name: AddressAvailable[i].PostalCode + ' ' + AddressAvailable[i].City,
                                                                                    ERP7__Contact__c: curContactExist[j].ContactId,
                                                                                    ERP7__Customer__c: curContactExist[j].AccountId,
                                                                                    ERP7__City__c: AddressAvailable[i].City,
                                                                                    ERP7__Country__c: AddressAvailable[i].CountryCode,
                                                                                    ERP7__Postal_Code__c: AddressAvailable[i].PostalCode,
                                                                                    ERP7__State__c: AddressAvailable[i].StateOrRegion,
                                                                                }
                                                                                addInsert.push(list)
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            addInsert = addInsert.filter(function ({ name, date, amt }) {
                                                                var key = `${name}${date}${amt}`;
                                                                return !this.has(key) && this.add(key);
                                                            }, new Set);

                                                            var addIdExist = [];
                                                            var addNotExist = [];
                                                            // console.log('addInsert ' + JSON.stringify(addInsert))
                                                            setTimeout(async function () {
                                                                conn.query("SELECT Id, Name, ERP7__Customer__c, ERP7__Contact__c, ERP7__City__c, ERP7__Country__c, ERP7__Postal_Code__c, ERP7__State__c FROM ERP7__Address__c WHERE ERP7__Customer__c IN ('" + accIdExist.join("','") + "')", function (err, result) {
                                                                    if (err) {
                                                                        var error = JSON.stringify(err);
                                                                        var obj = JSON.parse(error);
                                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/amazon')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/amazon')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/amazon')
                                                                        }
                                                                    }
                                                                    if (result.records.length == 0) {
                                                                        if (addInsert != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("ERP7__Address__c", "insert", addInsert, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Address successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                orderInsertion();
                                                                            });
                                                                        }
                                                                    }
                                                                    else if (result.records.length > 0) {
                                                                        var addExist = [];
                                                                        for (let i in result.records) {
                                                                            for (let j in addInsert) {
                                                                                if (result.records[i].ERP7__Contact__c == addInsert[j].ERP7__Contact__c) {
                                                                                    var list = {
                                                                                        Id: result.records[i].Id,
                                                                                        ERP7__Contact__c: addInsert[j].ERP7__Contact__c,
                                                                                        ERP7__City__c: addInsert[j].ERP7__City__c,
                                                                                        ERP7__Country__c: addInsert[j].ERP7__Country__c,
                                                                                        ERP7__Postal_Code__c: addInsert[j].ERP7__Postal_Code__c,
                                                                                        ERP7__State__c: addInsert[j].ERP7__State__c
                                                                                    }
                                                                                    addExist.push(list)
                                                                                    addIdExist.push(addInsert[j].ERP7__Customer__c)
                                                                                }
                                                                            }
                                                                        }

                                                                        for (let i in addInsert) {
                                                                            if (!addIdExist.includes(addInsert[i].ERP7__Customer__c)) addNotExist.push(addInsert[i])
                                                                        }

                                                                        if (addNotExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("ERP7__Address__c", "insert", addNotExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Address successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                            });
                                                                        }

                                                                        if (addExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("ERP7__Address__c", "update", addExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " update Address successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                orderInsertion();
                                                                            });
                                                                        }
                                                                    }
                                                                })
                                                            }, 2000 * z);
                                                        }
                                                    })
                                                }, 3000 * z);
                                            }


                                            var orderId = [];
                                            function orderInsertion() {
                                                setTimeout(async function () {
                                                    conn.query("SELECT Id, Name, ERP7__Customer__c, ERP7__Contact__c, ERP7__City__c, ERP7__Country__c, ERP7__Postal_Code__c, ERP7__State__c FROM ERP7__Address__c WHERE ERP7__Customer__c IN ('" + accIdExist.join("','") + "')", function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }

                                                        if (result.records.length > 0) {
                                                            var AddressIdCur = [];
                                                            for (let i in result.records) {
                                                                var list = {
                                                                    AddressId: result.records[i].Id,
                                                                    AccountId: result.records[i].ERP7__Customer__c
                                                                }
                                                                AddressIdCur.push(list)
                                                            }

                                                            var OrderAvailable = [];
                                                            if (curContactExist != [] && AddressIdCur != [] && resS.Orders != []) {
                                                                for (let i in resS.Orders) {
                                                                    if (resS.Orders[i].BuyerInfo.BuyerEmail != undefined && resS.Orders[i].BuyerInfo.BuyerEmail != '') {
                                                                        for (let l in curContactExist) {
                                                                            if (resS.Orders[i].BuyerInfo.BuyerEmail === curContactExist[l].Email) {
                                                                                for (let m in AddressIdCur) {
                                                                                    if (curContactExist[l].AccountId === AddressIdCur[m].AccountId) {
                                                                                        var List = {
                                                                                            ERP7__E_Order_Id__c: resS.Orders[i].AmazonOrderId,
                                                                                            Name: resS.Orders[i].AmazonOrderId,
                                                                                            ERP7__Amount__c: resS.Orders[i].OrderTotal.Amount,
                                                                                            ERP7__Customer_Email__c: resS.Orders[i].BuyerInfo.BuyerEmail,
                                                                                            ERP7__Customer_Purchase_Order_Date__c: resS.Orders[i].PurchaseDate,
                                                                                            Status: resS.Orders[i].OrderStatus,
                                                                                            ERP7__Active__c: true,
                                                                                            Type: 'Amazon',
                                                                                            ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                                                            ERP7__Channel__c: Aqxolt_Channel,
                                                                                            ERP7__Contact__c: curContactExist[l].ContactId,
                                                                                            AccountId: curContactExist[l].AccountId,
                                                                                            ERP7__Ship_To_Address__c: AddressIdCur[m].AddressId,
                                                                                            ERP7__Bill_To_Address__c: AddressIdCur[m].AddressId,
                                                                                            EffectiveDate: resS.Orders[i].PurchaseDate,
                                                                                            Pricebook2Id: pricebook_id
                                                                                        }
                                                                                        OrderAvailable.push(List)
                                                                                        orderId.push(resS.Orders[i].AmazonOrderId)
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            OrderAvailable = OrderAvailable.filter(function ({ name, date, amt }) {
                                                                var key = `${name}${date}${amt}`;
                                                                return !this.has(key) && this.add(key);
                                                            }, new Set);
                                                            // console.log('OrderAvailable ' + JSON.stringify(OrderAvailable))


                                                            var orderNotExist = [];
                                                            var orderExist = [];
                                                            var orderIdExist = [];
                                                            setTimeout(async function () {
                                                                conn.query("SELECT Id, Name, ERP7__E_Order_Id__c, ERP7__Amount__c, ERP7__Customer_Email__c, ERP7__Customer_Purchase_Order_Date__c, ERP7__Estimated_Shipping_Amount__c, Status, Type, ERP7__Order_Profile__c, ERP7__Channel__c, ERP7__Contact__c, AccountId, ERP7__Ship_To_Address__c, ERP7__Bill_To_Address__c, Pricebook2Id FROM Order WHERE ERP7__E_Order_Id__c IN ('" + orderId.join("','") + "')", (err, result) => {
                                                                    if (err) {
                                                                        var error = JSON.stringify(err);
                                                                        var obj = JSON.parse(error);
                                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/amazon')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/amazon')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/amazon')
                                                                        }
                                                                    }
                                                                    // console.log(result.records.length)
                                                                    if (result.records.length == 0) {
                                                                        if (OrderAvailable != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Order", "insert", OrderAvailable, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Order successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                productInsert();
                                                                            });
                                                                        }
                                                                    }
                                                                    else if (result.records.length > 0) {
                                                                        for (let i in result.records) {
                                                                            for (let j in OrderAvailable) {
                                                                                if (result.records[i].ERP7__E_Order_Id__c == OrderAvailable[j].ERP7__E_Order_Id__c) {
                                                                                    let list = {
                                                                                        Id: result.records[i].Id,
                                                                                        ERP7__E_Order_Id__c: result.records[i].ERP7__E_Order_Id__c,
                                                                                        Name: result.records[i].Name,
                                                                                        ERP7__Amount__c: OrderAvailable[j].ERP7__Amount__c,
                                                                                        ERP7__Customer_Email__c: OrderAvailable[j].ERP7__Customer_Email__c,
                                                                                        ERP7__Customer_Purchase_Order_Date__c: OrderAvailable[j].ERP7__Customer_Purchase_Order_Date__c,
                                                                                        Status: OrderAvailable[j].Status,
                                                                                        ERP7__Active__c: OrderAvailable[j].ERP7__Active__c,
                                                                                        Type: OrderAvailable[j].Type,
                                                                                        ERP7__Order_Profile__c: result.records[i].ERP7__Order_Profile__c,
                                                                                        ERP7__Channel__c: result.records[i].ERP7__Channel__c,
                                                                                        ERP7__Contact__c: result.records[i].ERP7__Contact__c,
                                                                                        AccountId: result.records[i].AccountId,
                                                                                        ERP7__Ship_To_Address__c: OrderAvailable[j].ERP7__Ship_To_Address__c,
                                                                                        ERP7__Bill_To_Address__c: OrderAvailable[j].ERP7__Bill_To_Address__c,
                                                                                        EffectiveDate: OrderAvailable[j].EffectiveDate,
                                                                                        Pricebook2Id: result.records[i].Pricebook2Id
                                                                                    }
                                                                                    orderExist.push(list);
                                                                                    orderIdExist.push(result.records[i].ERP7__E_Order_Id__c)
                                                                                }
                                                                            }
                                                                        }

                                                                        for (let i in OrderAvailable) {
                                                                            if (!orderIdExist.includes(OrderAvailable[i].ERP7__E_Order_Id__c)) orderNotExist.push(OrderAvailable[i])
                                                                        }
                                                                        // console.log('orderNotExist' + JSON.stringify(orderNotExist))

                                                                        if (orderNotExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Order", "insert", orderNotExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert Order successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                            });
                                                                        }

                                                                        if (orderExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("Order", "update", orderExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " update Order successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                productInsert();
                                                                            });
                                                                        }
                                                                    }
                                                                })
                                                            }, 3000 * z);
                                                        }
                                                    })
                                                }, 2000 * z);
                                            }

                                            var SellerSKUId = [];
                                            function productInsert() {

                                                var prodAvailable = [];
                                                var isActive = true;
                                                var trackInventory = true;
                                                if (OrderItemsList != [] && prodBrand != [] && Pricing != []) {
                                                    for (let i in OrderItemsList) {
                                                        for (let j in prodBrand) {
                                                            if (OrderItemsList[i].ASIN === prodBrand[j].Identifiers.MarketplaceASIN.ASIN) {
                                                                for (let k in Pricing) {
                                                                    if (OrderItemsList[i].ASIN === Pricing[k].Identifiers.MarketplaceASIN.ASIN) {
                                                                        for (let l in prodBrand[j].AttributeSets) {
                                                                            for (let m in Pricing[k].Offers) {
                                                                                if (OrderItemsList[i].SellerSKU === Pricing[k].Offers[m].SellerSKU) {
                                                                                    if (Pricing[k].Offers[m].BuyingPrice.ListingPrice.Amount != undefined) {
                                                                                        var list = {
                                                                                            StockKeepingUnit: OrderItemsList[i].SellerSKU,
                                                                                            ERP7__Submitted_to_Amazon__c: true,
                                                                                            Name: OrderItemsList[i].Title,
                                                                                            ERP7__SKU__c: OrderItemsList[i].SellerSKU,
                                                                                            ERP7__ASIN_Code__c: OrderItemsList[i].ASIN,
                                                                                            ERP7__Price_Entry_Amount__c: Pricing[k].Offers[m].BuyingPrice.ListingPrice.Amount,
                                                                                            ERP7__Brand__c: prodBrand[j].AttributeSets[l].Brand,
                                                                                            ERP7__Manufacturer__c: prodBrand[j].AttributeSets[l].Manufacturer,
                                                                                            Family: prodBrand[j].AttributeSets[l].ProductTypeName,
                                                                                            IsActive: isActive,
                                                                                            ERP7__Track_Inventory__c: trackInventory
                                                                                        }
                                                                                        prodAvailable.push(list)
                                                                                        SellerSKUId.push(OrderItemsList[i].SellerSKU)
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }

                                                    prodAvailable = Array.from(new Set(prodAvailable.map(JSON.stringify))).map(JSON.parse);

                                                    var productExist = [];
                                                    var productIdExist = [];
                                                    var productNotExist = [];
                                                    setTimeout(async function () {
                                                        conn.query("SELECT Id, Name, StockKeepingUnit, ERP7__SKU__c, ERP7__ASIN_Code__c, ERP7__Submitted_to_Amazon__c, ERP7__Price_Entry_Amount__c, ERP7__Brand__c, ERP7__Manufacturer__c, Family, IsActive, ERP7__Track_Inventory__c FROM Product2 WHERE StockKeepingUnit IN ('" + SellerSKUId.join("','") + "')", function (err, result) {
                                                            if (err) {
                                                                var error = JSON.stringify(err);
                                                                var obj = JSON.parse(error);
                                                                if (obj.name == 'INVALID_SESSION_ID') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/amazon')
                                                                } else if (obj.name == 'INVALID_FIELD') {
                                                                    req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                    res.redirect('/amazon')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/amazon')
                                                                }
                                                            }
                                                            // console.log('product ' + result.records.length)
                                                            if (result.records.length == 0) {
                                                                if (prodAvailable != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Product2", "insert", prodAvailable, function (err, rets) {
                                                                        if (err) { return console.error('err 2' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert Product2 successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        priceBookEntryInsert();
                                                                    });
                                                                }
                                                            }
                                                            else if (result.records.length > 0) {
                                                                for (let i in result.records) {
                                                                    for (let j in prodAvailable) {
                                                                        if (result.records[i].StockKeepingUnit == prodAvailable[j].StockKeepingUnit) {
                                                                            var list = {
                                                                                Id: result.records[i].Id,
                                                                                StockKeepingUnit: prodAvailable[j].StockKeepingUnit,
                                                                                Name: prodAvailable[j].Name,
                                                                                ERP7__SKU__c: prodAvailable[j].ERP7__SKU__c,
                                                                                ERP7__ASIN_Code__c: prodAvailable[j].ERP7__ASIN_Code__c,
                                                                                ERP7__Price_Entry_Amount__c: prodAvailable[j].ERP7__Price_Entry_Amount__c,
                                                                                ERP7__Brand__c: prodAvailable[j].ERP7__Brand__c,
                                                                                ERP7__Manufacturer__c: prodAvailable[j].ERP7__Manufacturer__c,
                                                                                Family: prodAvailable[j].Family,
                                                                                IsActive: prodAvailable[j].IsActive,
                                                                                ERP7__Track_Inventory__c: prodAvailable[j].ERP7__Track_Inventory__c,
                                                                                ERP7__Submitted_to_Amazon__c: prodAvailable[j].ERP7__Submitted_to_Amazon__c
                                                                            }
                                                                            productExist.push(list)
                                                                            productIdExist.push(result.records[i].StockKeepingUnit)
                                                                            // console.log(result.records[i].ERP7__Price_Entry_Amount__c)
                                                                        }
                                                                    }
                                                                }

                                                                for (let i in prodAvailable) {
                                                                    if (!productIdExist.includes(prodAvailable[i].StockKeepingUnit)) productNotExist.push(prodAvailable[i])
                                                                }

                                                                if (productNotExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Product2", "insert", productNotExist, function (err, rets) {
                                                                        if (err) { return console.error('err 2' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert Product2 successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                    });
                                                                }

                                                                if (productExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Product2", "update", productExist, function (err, rets) {
                                                                        if (err) { return console.error('err 2' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " update Product2 successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        priceBookEntryInsert();
                                                                    });
                                                                }
                                                            }
                                                        })
                                                    }, 2000 * z);
                                                }
                                            }

                                            var productList = [];
                                            var prodMainId = [];
                                            function priceBookEntryInsert() {
                                                setTimeout(async function () {
                                                    conn.query("SELECT Id, ERP7__ASIN_Code__c, StockKeepingUnit FROM Product2 WHERE StockKeepingUnit IN ('" + SellerSKUId.join("','") + "')", function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }
                                                        // console.log('product ' + result.records.length)
                                                        if (result.records.length > 0) {
                                                            for (let i in result.records) {
                                                                prodMainId.push(result.records[i].Id)
                                                                productList.push(result.records[i])
                                                            }
                                                            // console.log('prodMainId' + JSON.stringify(prodMainId))
                                                            // console.log('product list' + JSON.stringify(productList))

                                                            var isActive = true;
                                                            var priceBookEntryAvail = [];
                                                            for (let i in productList) {
                                                                for (let j in Pricing) {
                                                                    for (let k in Pricing[j].Offers) {
                                                                        if (productList[i].StockKeepingUnit === Pricing[j].Offers[k].SellerSKU) {
                                                                            if (Pricing[j].Offers[k].BuyingPrice.ListingPrice.Amount != undefined) {
                                                                                var list = {
                                                                                    IsActive: isActive,
                                                                                    Pricebook2Id: pricebook_id,
                                                                                    Product2Id: productList[i].Id,
                                                                                    UnitPrice: Pricing[j].Offers[k].BuyingPrice.ListingPrice.Amount
                                                                                }
                                                                                priceBookEntryAvail.push(list)
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            // console.log('priceBookEntryInsert ' + JSON.stringify(priceBookEntryAvail))

                                                            priceBookEntryAvail = Array.from(new Set(priceBookEntryAvail.map(JSON.stringify))).map(JSON.parse);
                                                            setTimeout(async function () {
                                                                conn.query("SELECT Id, Product2Id, Pricebook2Id FROM pricebookentry WHERE isactive = true AND Product2Id IN ('" + prodMainId.join("','") + "') ORDER BY lastmodifieddate", function (err, result) {
                                                                    if (err) {
                                                                        var error = JSON.stringify(err);
                                                                        var obj = JSON.parse(error);
                                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/amazon')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/amazon')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/amazon')
                                                                        }
                                                                    }

                                                                    // console.log('price ' + result.records.length)
                                                                    if (result.records.length == 0) {
                                                                        if (priceBookEntryAvail != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("pricebookentry", "insert", priceBookEntryAvail, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert pricebookentry successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                orderItemsInsert();
                                                                            });
                                                                        }
                                                                    }
                                                                    else if (result.records.length > 0) {
                                                                        var priceBookExist = [];
                                                                        var priceBookIdExist = [];
                                                                        var priceNotExist = [];
                                                                        for (let i in result.records) {
                                                                            for (let j in priceBookEntryAvail) {
                                                                                if (result.records[i].Product2Id == priceBookEntryAvail[j].Product2Id && result.records[i].Pricebook2Id == priceBookEntryAvail[j].Pricebook2Id) {
                                                                                    var list = {
                                                                                        Id: result.records[i].Id,
                                                                                        UnitPrice: priceBookEntryAvail[j].UnitPrice
                                                                                    }
                                                                                    priceBookExist.push(list)
                                                                                    var list2 = {
                                                                                        Product2Id: result.records[i].Product2Id,
                                                                                        Pricebook2Id: result.records[i].Pricebook2Id
                                                                                    }
                                                                                    priceBookIdExist.push(list2)
                                                                                }
                                                                            }
                                                                        }
                                                                        // console.log('priceBookExist ' + JSON.stringify(priceBookExist))

                                                                        if (priceBookIdExist != []) {
                                                                            priceNotExist = priceBookEntryAvail.filter((Exist) => !priceBookIdExist.some((NotExist) => Exist.Product2Id == NotExist.Product2Id && Exist.Pricebook2Id == NotExist.Pricebook2Id))
                                                                        }

                                                                        if (priceNotExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("pricebookentry", "insert", priceNotExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " insert pricebookentry successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                            });
                                                                        }
                                                                        priceBookExist = Array.from(new Set(priceBookExist.map(JSON.stringify))).map(JSON.parse);

                                                                        if (priceBookExist != []) {
                                                                            conn.bulk.pollTimeout = 25000;
                                                                            conn.bulk.load("pricebookentry", "update", priceBookExist, function (err, rets) {
                                                                                if (err) { return console.error('err 2' + err); }
                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                    if (rets[i].success) {
                                                                                        console.log("#" + (i + 1) + " update pricebookentry successfully, id = " + rets[i].id);
                                                                                    } else {
                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                    }
                                                                                }
                                                                                orderItemsInsert();
                                                                            });
                                                                        }
                                                                    }
                                                                })
                                                            }, 1000 * z);
                                                        }
                                                    })
                                                }, 2000 * z);
                                            }

                                            function orderItemsInsert() {
                                                var OrderIdAvailable = [];
                                                var OrderAmazId = [];
                                                var pricebookIdExist = [];
                                                setTimeout(async function () {
                                                    conn.query("SELECT Id, Product2Id, Pricebook2Id FROM pricebookentry WHERE isactive = true AND Product2Id IN ('" + prodMainId.join("','") + "') ORDER BY lastmodifieddate", function (err, result) {
                                                        if (err) {
                                                            var error = JSON.stringify(err);
                                                            var obj = JSON.parse(error);
                                                            if (obj.name == 'INVALID_SESSION_ID') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/amazon')
                                                            } else if (obj.name == 'INVALID_FIELD') {
                                                                req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                res.redirect('/amazon')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/amazon')
                                                            }
                                                        }

                                                        if (result.records.length > 0) {
                                                            for (let i in result.records) {
                                                                var list = {
                                                                    PricebookEntryId: result.records[i].Id,
                                                                    Product2Id: result.records[i].Product2Id
                                                                }
                                                                pricebookIdExist.push(list)
                                                            }

                                                            setTimeout(async function () {
                                                                conn.query("SELECT Id, ERP7__E_Order_Id__c, AccountId, Pricebook2Id FROM Order WHERE ERP7__E_Order_Id__c IN ('" + orderId.join("','") + "')", (err, result) => {
                                                                    if (err) {
                                                                        var error = JSON.stringify(err);
                                                                        var obj = JSON.parse(error);
                                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/amazon')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/amazon')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/amazon')
                                                                        }
                                                                    }
                                                                    // console.log('order ' + result.records.length)
                                                                    if (result.records.length > 0) {
                                                                        for (let i in result.records) {
                                                                            var list = {
                                                                                OrderId: result.records[i].Id,
                                                                                AmazonOrderId: result.records[i].ERP7__E_Order_Id__c,
                                                                                AccountId: result.records[i].AccountId
                                                                            }
                                                                            OrderAmazId.push(list)
                                                                            OrderIdAvailable.push(result.records[i].Id)
                                                                        }

                                                                        var orderItemAvailable = [];
                                                                        if (resS.Orders != [] && OrderAmazId != [] && OrderItems != [] && productList != []) {
                                                                            for (let i in resS.Orders) {
                                                                                for (let j in OrderAmazId) {
                                                                                    if (resS.Orders[i].AmazonOrderId === OrderAmazId[j].AmazonOrderId) {
                                                                                        for (let k in OrderItems) {
                                                                                            if (resS.Orders[i].AmazonOrderId === OrderItems[k].AmazonOrderId) {
                                                                                                for (let l in pricebookIdExist) {
                                                                                                    for (let m in productList) {
                                                                                                        if (pricebookIdExist[l].Product2Id === productList[m].Id) {
                                                                                                            for (let n in OrderItems[k].OrderItems) {
                                                                                                                if (OrderItems[k].OrderItems[n].SellerSKU === productList[m].StockKeepingUnit) {
                                                                                                                    var list = {
                                                                                                                        ERP7__Inventory_Tracked__c: true,
                                                                                                                        ERP7__Active__c: true,
                                                                                                                        OrderId: OrderAmazId[j].OrderId,
                                                                                                                        Account__c: OrderAmazId[j].AccountId,
                                                                                                                        ERP7__Order_Line_Status__c: (resS.Orders[i].OrderStatus == "Shipped" ? 'Fulfilled' : 'In Progress'),
                                                                                                                        Quantity: OrderItems[k].OrderItems[n].ProductInfo.NumberOfItems,
                                                                                                                        UnitPrice: OrderItems[k].OrderItems[n].ItemPrice.Amount,
                                                                                                                        Product2Id: productList[m].Id,
                                                                                                                        ERP7__Is_Back_Order__c: false,
                                                                                                                        ERP7__Allocate_Stock__c: true,
                                                                                                                        PricebookEntryId: pricebookIdExist[l].PricebookEntryId,
                                                                                                                        ERP7__VAT_Amount__c: (OrderItems[k].OrderItems[n].ItemTax.Amount),
                                                                                                                        ERP7__Total_Price__c: parseFloat(OrderItems[k].OrderItems[n].ItemPrice.Amount * OrderItems[k].OrderItems[n].ProductInfo.NumberOfItems) + parseFloat(OrderItems[k].OrderItems[n].ItemTax.Amount)
                                                                                                                    }
                                                                                                                    orderItemAvailable.push(list)
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }

                                                                        orderItemAvailable = Array.from(new Set(orderItemAvailable.map(JSON.stringify))).map(JSON.parse);
                                                                        setTimeout(async function () {
                                                                            conn.query("SELECT Id, ERP7__Inventory_Tracked__c, ERP7__Active__c, OrderId, ERP7__Order_Line_Status__c, Quantity, UnitPrice, Product2Id, ERP7__Is_Back_Order__c, ERP7__Allocate_Stock__c, PricebookEntryId, ERP7__VAT_Amount__c, ERP7__Total_Price__c FROM OrderItem WHERE OrderId IN ('" + OrderIdAvailable.join("','") + "') AND Product2Id IN ('" + prodMainId.join("','") + "')", function (err, result) {
                                                                                if (err) {
                                                                                    var error = JSON.stringify(err);
                                                                                    var obj = JSON.parse(error);
                                                                                    if (obj.name == 'INVALID_SESSION_ID') {
                                                                                        req.flash('error_msg', '• Session has Expired Please try again');
                                                                                        res.redirect('/amazon')
                                                                                    } else if (obj.name == 'INVALID_FIELD') {
                                                                                        req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                                        res.redirect('/amazon')
                                                                                    } else {
                                                                                        req.flash('error_msg', '• ' + obj.name);
                                                                                        res.redirect('/amazon')
                                                                                    }
                                                                                }
                                                                                // console.log(result.records.length)
                                                                                if (result.records.length == 0) {
                                                                                    if (orderItemAvailable != []) {
                                                                                        conn.bulk.pollTimeout = 25000;
                                                                                        conn.bulk.load("OrderItem", "insert", orderItemAvailable, function (err, rets) {
                                                                                            if (err) { return console.error('err 2' + err); }
                                                                                            for (var i = 0; i < rets.length; i++) {
                                                                                                if (rets[i].success) {
                                                                                                    console.log("#" + (i + 1) + " insert OrderItem successfully, id = " + rets[i].id);
                                                                                                } else {
                                                                                                    console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                }
                                                                                            }
                                                                                            var date = new Date();
                                                                                            var updatedDate = date.toLocaleString('en-US', { weekday: 'short', day: 'numeric', year: 'numeric', month: 'long', hour: 'numeric', minute: 'numeric', second: 'numeric' })
                                                                                            pool.query('INSERT INTO jobs_log (email, updated_at, category, message, seller_id) VALUES ($1, $2, $3, $4, $5)', [Email, updatedDate, 'amazon', 'Order Sync', ClientId]);
                                                                                            // var exeLen = parseInt(z) + 1;
                                                                                            // SuccessToGo(exeLen);
                                                                                        });
                                                                                    }
                                                                                }
                                                                                else if (result.records.length > 0) {
                                                                                    var orderItemExist = [];
                                                                                    var orderItemIdExist = [];
                                                                                    var orderItemNotExist = [];
                                                                                    for (let i in result.records) {
                                                                                        for (let j in orderItemAvailable) {
                                                                                            if (result.records[i].OrderId == orderItemAvailable[j].OrderId && result.records[i].Product2Id == orderItemAvailable[j].Product2Id && result.records[i].PricebookEntryId == orderItemAvailable[j].PricebookEntryId) {
                                                                                                var list = {
                                                                                                    Id: result.records[i].Id,
                                                                                                    ERP7__Inventory_Tracked__c: orderItemAvailable[j].ERP7__Inventory_Tracked__c,
                                                                                                    ERP7__Active__c: orderItemAvailable[j].ERP7__Active__c,
                                                                                                    ERP7__Order_Line_Status__c: orderItemAvailable[j].ERP7__Order_Line_Status__c,
                                                                                                    Account__c: orderItemAvailable[j].Account__c,
                                                                                                    Quantity: orderItemAvailable[j].Quantity,
                                                                                                    UnitPrice: orderItemAvailable[j].UnitPrice,
                                                                                                    ERP7__Is_Back_Order__c: orderItemAvailable[j].ERP7__Is_Back_Order__c,
                                                                                                    ERP7__Allocate_Stock__c: orderItemAvailable[j].ERP7__Allocate_Stock__c,
                                                                                                    ERP7__VAT_Amount__c: orderItemAvailable[j].ERP7__VAT_Amount__c,
                                                                                                    ERP7__Total_Price__c: orderItemAvailable[j].ERP7__Total_Price__c
                                                                                                }
                                                                                                var list2 = {
                                                                                                    OrderId: result.records[i].OrderId,
                                                                                                    Product2Id: result.records[i].Product2Id,
                                                                                                }
                                                                                                orderItemExist.push(list)
                                                                                                orderItemIdExist.push(list2)
                                                                                            }
                                                                                        }
                                                                                    }

                                                                                    for (let i in orderItemAvailable) {
                                                                                        orderItemNotExist.push(orderItemAvailable[i])
                                                                                    }

                                                                                    for (let i in orderItemAvailable) {
                                                                                        for (let j in orderItemIdExist) {
                                                                                            if (orderItemIdExist[j].OrderId === orderItemAvailable[i].OrderId && orderItemIdExist[j].Product2Id === orderItemAvailable[i].Product2Id) {
                                                                                                orderItemNotExist.pop(orderItemAvailable[i])
                                                                                            }
                                                                                        }
                                                                                    }

                                                                                    orderItemNotExist = Array.from(new Set(orderItemNotExist.map(JSON.stringify))).map(JSON.parse);

                                                                                    if (orderItemNotExist != []) {
                                                                                        conn.bulk.pollTimeout = 25000;
                                                                                        conn.bulk.load("OrderItem", "insert", orderItemNotExist, function (err, rets) {
                                                                                            if (err) { return console.error('err 2' + err); }
                                                                                            for (var i = 0; i < rets.length; i++) {
                                                                                                if (rets[i].success) {
                                                                                                    console.log("#" + (i + 1) + " insert OrderItem successfully, id = " + rets[i].id);
                                                                                                } else {
                                                                                                    console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                }
                                                                                            }
                                                                                        });
                                                                                    }

                                                                                    if (orderItemExist != []) {
                                                                                        conn.bulk.pollTimeout = 25000;
                                                                                        conn.bulk.load("OrderItem", "update", orderItemExist, function (err, rets) {
                                                                                            if (err) { return console.error('err 2' + err); }
                                                                                            for (var i = 0; i < rets.length; i++) {
                                                                                                if (rets[i].success) {
                                                                                                    console.log("#" + (i + 1) + " update OrderItem successfully, id = " + rets[i].id);
                                                                                                } else {
                                                                                                    console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                }
                                                                                            }
                                                                                            var date = new Date();
                                                                                            var updatedDate = date.toLocaleString('en-US', { weekday: 'short', day: 'numeric', year: 'numeric', month: 'long', hour: 'numeric', minute: 'numeric', second: 'numeric' })
                                                                                            pool.query('INSERT INTO jobs_log (email, updated_at, category, message, seller_id) VALUES ($1, $2, $3, $4, $5)', [Email, updatedDate, 'amazon', 'Order Sync', ClientId]);
                                                                                            // var exeLen = parseInt(z) + 1;
                                                                                            // SuccessToGo(exeLen);
                                                                                        });
                                                                                    }
                                                                                }
                                                                            })
                                                                        }, 3000 * z);
                                                                    }
                                                                })
                                                            }, 2000 * z);
                                                        }
                                                    })
                                                }, 1000 * z);
                                            }
                                        }
                                    }
                                }
                            }, 2000 * z);
                        }
                        // function SuccessToGo(exeLen) {
                        //     if (result.rows.length === exeLen) {
                        //         req.flash('success_msg', `• Order's Synced`);
                        //         return res.redirect('/amazon');
                        //     }
                        // }
                    }
                }))
                client.release();
            });
        } catch (e) {
            console.log('Error-> ', e);
        }
    })();
}