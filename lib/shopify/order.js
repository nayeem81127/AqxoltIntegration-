const express = require("express")
const app = express()
const { pool } = require("../../dbConfig");
const jsforce = require('jsforce')
const salesLogin = require('../routes');
const csv = require("csvtojson");
app.use(express.static('public'));
const Shopify = require('shopify-api-node');

module.exports = function (app) {

    (async () => {

        try {

            app.post('/shopifyOrderSync', salesLogin, async function (req, res, next) {
                var Email = req.user.email;
                const client = await pool.connect();
                await client.query('BEGIN');
                await JSON.stringify(client.query("SELECT * FROM shops WHERE email=$1", [Email], async function (err, result) {
                    if (err) { console.log(err); }

                    if (result.rows.length == 0) {
                        req.flash('error_msg', '• No Shops Found');
                        return res.redirect('/shopify')
                    }
                    else if (result.rows.length > 0) {
                        var oauth_token = req.user.oauth_token;
                        var instance_url = req.user.instance_url;
                        for (let z in result.rows) {
                            setTimeout(async function () {
                                if (Email == result.rows[z].email) {
                                    var Aqxolt_Customer;
                                    var Aqxolt_Order_Profile;
                                    var Aqxolt_Channel;
                                    var shopName = result.rows[z].shopify_domain;
                                    var accessToken = result.rows[z].shopify_token;

                                    if (result.rows[z].aqxolt_customer && result.rows[z].aqxolt_order_profile) {
                                        Aqxolt_Customer = result.rows[z].aqxolt_customer;
                                        Aqxolt_Order_Profile = result.rows[z].aqxolt_order_profile;
                                        Aqxolt_Channel = result.rows[z].aqxolt_channel;
                                    } else {
                                        Aqxolt_Customer = req.user.aqxolt_customer;
                                        Aqxolt_Order_Profile = req.user.aqxolt_order_profile;
                                        Aqxolt_Channel = req.user.aqxolt_channel;
                                    }

                                    if (!Aqxolt_Order_Profile && !Aqxolt_Customer && !Aqxolt_Channel && !accessToken || !shopName) {
                                        req.flash('error_msg', '• Order Profile, Customer, Channel And Shops Credentials are Missing');
                                        res.redirect('/shopify')
                                    }
                                    else if (!accessToken || !shopName) {
                                        req.flash('error_msg', '• Shops Credentials are Missing');
                                        res.redirect('/shopify')
                                    }
                                    else if (!Aqxolt_Order_Profile) {
                                        req.flash('error_msg', '• Order Profile is Empty in Aqxolt Info');
                                        res.redirect('/shopify')
                                    }
                                    else if (!Aqxolt_Customer) {
                                        req.flash('error_msg', '• Aqxolt Customer is Empty in Aqxolt Info');
                                        res.redirect('/shopify')
                                    }
                                    else if (!Aqxolt_Channel) {
                                        req.flash('error_msg', '• Aqxolt Channel is Empty in Aqxolt Info');
                                        res.redirect('/shopify')
                                    }
                                    else if (!Aqxolt_Customer && !Aqxolt_Order_Profile && !Aqxolt_Channel) {
                                        req.flash('error_msg', '• Aqxolt Customer, Channel And Order Profile is Empty');
                                        res.redirect('/shopify')
                                    }
                                    else if (Aqxolt_Customer && Aqxolt_Order_Profile && Aqxolt_Channel && accessToken && shopName) {

                                        const shopify = new Shopify({
                                            shopName: shopName,
                                            accessToken: accessToken
                                        });

                                        let params = { limit: 50 };
                                        let OrdersArray = [];

                                        do {
                                            const Orders = await shopify.order.list(params)
                                            OrdersArray = OrdersArray.concat(Orders);
                                            params = Orders.nextPageParameters;
                                        } while (params !== undefined);

                                        // console.log('OrdersArray ' + JSON.stringify(OrdersArray))

                                        let buyerEmailInfo = []
                                        let CustomerDetails = []
                                        let SkuId = [];
                                        let ProductDetails = [];

                                        for (let i in OrdersArray) {
                                            if (OrdersArray[i].customer.email != "" && OrdersArray[i].customer.email != null) {
                                                buyerEmailInfo.push(OrdersArray[i].customer.email)
                                            }
                                        }
                                        // console.log('buyerEmailInfo ' + JSON.stringify(buyerEmailInfo))

                                        for (let i in OrdersArray) {
                                            if (OrdersArray[i].customer.id != "" && OrdersArray[i].customer.id != null && OrdersArray[i].customer.email != "" && OrdersArray[i].customer.email != null) {
                                                if (OrdersArray[i].customer.last_name != "" && OrdersArray[i].customer.last_name != null || OrdersArray[i].customer.first_name != "" && OrdersArray[i].customer.first_name != null) {
                                                    var list = {
                                                        ERP7__Customer_External_Id__c: OrdersArray[i].customer.id,
                                                        Name: OrdersArray[i].customer.first_name + " " + OrdersArray[i].customer.last_name,
                                                        ERP7__Email__c: OrdersArray[i].customer.email,
                                                        ERP7__Account_Type__c: "Customer",
                                                        ERP7__Account_Profile__c: Aqxolt_Customer,
                                                        ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                        ERP7__Active__c: true
                                                    }
                                                    CustomerDetails.push(list)
                                                }
                                            }
                                        }
                                        const uniq = new Set(CustomerDetails.map(e => JSON.stringify(e)));
                                        CustomerDetails = Array.from(uniq).map(e => JSON.parse(e));

                                        const uniq1 = new Set(buyerEmailInfo.map(e => JSON.stringify(e)));
                                        buyerEmailInfo = Array.from(uniq1).map(e => JSON.parse(e));

                                        console.log('CustomerDetails ' + JSON.stringify(CustomerDetails.length) + 'buyerEmailInfo ' + JSON.stringify(buyerEmailInfo.length))

                                        for (let i in OrdersArray) {
                                            for (let j in OrdersArray[i].line_items) {
                                                if (OrdersArray[i].id != '' && OrdersArray[i].id != undefined && OrdersArray[i].line_items[j].sku != '' && OrdersArray[i].line_items[j].sku != undefined) {
                                                    var list = {
                                                        Name: OrdersArray[i].line_items[j].title,
                                                        ERP7__Manufacturer__c: OrdersArray[i].line_items[j].vendor,
                                                        StockKeepingUnit: OrdersArray[i].line_items[j].sku,
                                                        ERP7__SKU__c: OrdersArray[i].line_items[j].sku,
                                                        ERP7__Price_Entry_Amount__c: OrdersArray[i].line_items[j].price,
                                                        IsActive: true
                                                    }
                                                    ProductDetails.push(list)
                                                    SkuId.push(OrdersArray[i].line_items[j].sku)
                                                }
                                            }
                                        }
                                        // console.log('ProductDetails ' + JSON.stringify(ProductDetails), ProductDetails.length)

                                        var conn = new jsforce.Connection({
                                            accessToken: oauth_token,
                                            instanceUrl: instance_url
                                        });

                                        var pricebook_id;
                                        if (Aqxolt_Order_Profile != null) {
                                            setTimeout(async function () {
                                                conn.query(`SELECT Id, ERP7__Price_Book__c FROM ERP7__Profiling__c where Id='${Aqxolt_Order_Profile}'`, function (err, result) {
                                                    if (err) {
                                                        var error = JSON.stringify(err);
                                                        var obj = JSON.parse(error);
                                                        if (obj.name == 'INVALID_SESSION_ID') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/shopify')
                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                            res.redirect('/shopify')
                                                        } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                            req.flash('error_msg', '• Invalid Aqxolt Order Profile Id');
                                                            res.redirect('/shopify')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/shopify')
                                                        }
                                                    }

                                                    if (result.records.length == 0) {
                                                        req.flash('error_msg', '• Invalid Order Profile Id');
                                                        res.redirect('/shopify')
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
                                                                            res.redirect('/shopify')
                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                            res.redirect('/shopify')
                                                                        } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                                            req.flash('error_msg', '• Invalid Aqxolt Customer Id');
                                                                            res.redirect('/shopify')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/shopify')
                                                                        }
                                                                    }

                                                                    if (result.records.length == 0) {
                                                                        req.flash('error_msg', '• Invalid Customer Profile Id');
                                                                        res.redirect('/shopify')
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
                                                                                            res.redirect('/shopify')
                                                                                        } else if (obj.name == 'INVALID_FIELD') {
                                                                                            req.flash('error_msg', '• You have Connected to InValid Org. Please Connect to Valid Org');
                                                                                            res.redirect('/shopify')
                                                                                        } else if (obj.name == 'INVALID_QUERY_FILTER_OPERATOR') {
                                                                                            req.flash('error_msg', '• Invalid Aqxolt Channel Id');
                                                                                            res.redirect('/shopify')
                                                                                        }
                                                                                        else {
                                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                                            res.redirect('/shopify')
                                                                                        }
                                                                                    }

                                                                                    if (result.records.length == 0) {
                                                                                        req.flash('error_msg', '• Invalid Aqxolt Channel Id');
                                                                                        res.redirect('/shopify')
                                                                                    }
                                                                                    else if (result.records.length > 0) {
                                                                                        if (buyerEmailInfo.length > 0) {
                                                                                            setTimeout(async function () {
                                                                                                conn.bulk.pollInterval = 1000;
                                                                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                                                                let records = [];

                                                                                                const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__Email__c, ERP7__Order_Profile__c, ERP7__Account_Profile__c,ERP7__Account_Type__c, ERP7__Customer_External_Id__c FROM Account where ERP7__Email__c IN ('${buyerEmailInfo.join("','")}')`);
                                                                                                const readStream = recordStream.stream();
                                                                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                                                                readStream.pipe(csvToJsonParser);

                                                                                                csvToJsonParser.on("data", (data) => {
                                                                                                    records.push(JSON.parse(data.toString('utf8')));
                                                                                                });

                                                                                                new Promise((resolve, reject) => {
                                                                                                    recordStream.on("error", (error) => {
                                                                                                        var err = JSON.stringify(error);
                                                                                                        console.log(err)
                                                                                                        var obj = JSON.parse(err);
                                                                                                        if (obj.name == 'InvalidSessionId') {
                                                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                                                            res.redirect('/amazon')
                                                                                                        } else {
                                                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                                                            res.redirect('/amazon')
                                                                                                        }
                                                                                                    });

                                                                                                    csvToJsonParser.on("error", (error) => {
                                                                                                        console.error(error);
                                                                                                    });

                                                                                                    csvToJsonParser.on("done", async () => {
                                                                                                        resolve(records);
                                                                                                    });
                                                                                                }).then((accRecords) => {
                                                                                                    if (accRecords.length == 0) {
                                                                                                        res.redirect('/index');
                                                                                                        if (CustomerDetails != []) {
                                                                                                            conn.bulk.pollTimeout = 25000;
                                                                                                            conn.bulk.load("Account", "insert", CustomerDetails, function (err, rets) {
                                                                                                                if (err) { return console.error('err 1' + err); }
                                                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                                                    if (rets[i].success) {
                                                                                                                        console.log("#" + (i + 1) + " insert account successfully, id = " + rets[i].id);
                                                                                                                    } else {
                                                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                                    }
                                                                                                                }
                                                                                                                conInsertion();
                                                                                                            });
                                                                                                        }
                                                                                                    } else if (accRecords.length > 0) {
                                                                                                        res.redirect('/index');
                                                                                                        var accExist = [];
                                                                                                        var accExternalId = [];
                                                                                                        var accNotExist = [];
                                                                                                        for (let i in accRecords) {
                                                                                                            // console.log(`'${accRecords[i].Id}',`)
                                                                                                            for (let j in CustomerDetails) {
                                                                                                                if (accRecords[i].ERP7__Customer_External_Id__c == CustomerDetails[j].ERP7__Customer_External_Id__c) {
                                                                                                                    let list = {
                                                                                                                        Id: accRecords[i].Id,
                                                                                                                        ERP7__Email__c: CustomerDetails[j].ERP7__Email__c,
                                                                                                                        Name: CustomerDetails[j].Name,
                                                                                                                        ERP7__Order_Profile__c: CustomerDetails[j].ERP7__Order_Profile__c,
                                                                                                                        ERP7__Account_Profile__c: CustomerDetails[j].ERP7__Account_Profile__c,
                                                                                                                        ERP7__Account_Type__c: CustomerDetails[j].ERP7__Account_Type__c,
                                                                                                                        ERP7__Active__c: CustomerDetails[j].ERP7__Active__c,
                                                                                                                        ERP7__Customer_External_Id__c: CustomerDetails[j].ERP7__Customer_External_Id__c
                                                                                                                    }
                                                                                                                    accExist.push(list);
                                                                                                                    accExternalId.push(CustomerDetails[j].ERP7__Customer_External_Id__c)
                                                                                                                }
                                                                                                            }
                                                                                                        }

                                                                                                        const uniq = new Set(accExist.map(e => JSON.stringify(e)));
                                                                                                        accExist = Array.from(uniq).map(e => JSON.parse(e));

                                                                                                        const uniq1 = new Set(accExternalId.map(e => JSON.stringify(e)));
                                                                                                        accExternalId = Array.from(uniq1).map(e => JSON.parse(e));

                                                                                                        // console.log('Exist ' + accExternalId)
                                                                                                        for (let i in CustomerDetails) {
                                                                                                            if (!accExternalId.includes(CustomerDetails[i].ERP7__Customer_External_Id__c)) accNotExist.push(CustomerDetails[i])
                                                                                                        }
                                                                                                        // console.log('accExist' + JSON.stringify(accExist))
                                                                                                        // console.log('accNotExist' + JSON.stringify(accNotExist))

                                                                                                        if (accNotExist != []) {
                                                                                                            conn.bulk.pollTimeout = 25000;
                                                                                                            conn.bulk.load("Account", "insert", accNotExist, function (err, rets) {
                                                                                                                if (err) { return console.error('err 1' + err); }
                                                                                                                for (var i = 0; i < rets.length; i++) {
                                                                                                                    if (rets[i].success) {
                                                                                                                        console.log("#" + (i + 1) + " insert account successfully, id = " + rets[i].id);
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
                                                                                                                        console.log("#" + (i + 1) + " update account successfully, id = " + rets[i].id);
                                                                                                                    } else {
                                                                                                                        console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                                                                    }
                                                                                                                }
                                                                                                                conInsertion();
                                                                                                            });
                                                                                                        }
                                                                                                    }
                                                                                                });
                                                                                            }, 3000 * z);
                                                                                        }
                                                                                        else {
                                                                                            req.flash('error_msg', `• Customer's Not Found`);
                                                                                            return res.redirect('/shopify');
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

                                        var accIdExist = [];
                                        var contactDetails = [];
                                        function conInsertion() {

                                            var conExist = [];
                                            var conEmailExist = [];
                                            var conNotExist = [];
                                            setTimeout(async function () {
                                                conn.bulk.pollInterval = 1000;
                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                let records = [];

                                                const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__Email__c, ERP7__Order_Profile__c, ERP7__Account_Profile__c,ERP7__Account_Type__c, ERP7__Customer_External_Id__c FROM Account where ERP7__Email__c IN ('${buyerEmailInfo.join("','")}')`);
                                                const readStream = recordStream.stream();
                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                readStream.pipe(csvToJsonParser);

                                                csvToJsonParser.on("data", (data) => {
                                                    records.push(JSON.parse(data.toString('utf8')));
                                                });

                                                new Promise((resolve, reject) => {
                                                    recordStream.on("error", (error) => {
                                                        var err = JSON.stringify(error);
                                                        console.log(err)
                                                        var obj = JSON.parse(err);
                                                        if (obj.name == 'InvalidSessionId') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/amazon')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/amazon')
                                                        }
                                                    });

                                                    csvToJsonParser.on("error", (error) => {
                                                        console.error(error);
                                                    });

                                                    csvToJsonParser.on("done", async () => {
                                                        resolve(records);
                                                    });
                                                }).then((acc2Records) => {
                                                    if (acc2Records.length > 0) {
                                                        for (let i in acc2Records) {
                                                            for (let j in OrdersArray) {
                                                                if (OrdersArray[j].customer.id == acc2Records[i].ERP7__Customer_External_Id__c) {
                                                                    let acclist = {
                                                                        AccountId: acc2Records[i].Id,
                                                                        Email: acc2Records[i].ERP7__Email__c,
                                                                        FirstName: OrdersArray[j].customer.last_name == null ? '' : OrdersArray[j].customer.first_name,
                                                                        LastName: OrdersArray[j].customer.last_name == null ? OrdersArray[j].customer.first_name : OrdersArray[j].customer.last_name,
                                                                        Phone: OrdersArray[j].customer.phone,
                                                                        ERP7__Contact_External_Id__c: OrdersArray[j].customer.id
                                                                    }
                                                                    contactDetails.push(acclist);
                                                                    accIdExist.push(acc2Records[i].Id)
                                                                }
                                                            }
                                                        }

                                                        const uniq = new Set(contactDetails.map(e => JSON.stringify(e)));
                                                        contactDetails = Array.from(uniq).map(e => JSON.parse(e));

                                                        const uniq1 = new Set(accIdExist.map(e => JSON.stringify(e)));
                                                        accIdExist = Array.from(uniq1).map(e => JSON.parse(e));
                                                        console.log('cD ' + contactDetails.length, accIdExist.length)

                                                        conn.bulk.pollInterval = 1000;
                                                        conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                        let records = [];

                                                        const recordStream = conn.bulk.query(`SELECT Id, AccountId, LastName, Email, ERP7__Contact_External_Id__c FROM Contact WHERE AccountId IN ('${accIdExist.join("','")}')`);
                                                        const readStream = recordStream.stream();
                                                        const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                        readStream.pipe(csvToJsonParser);

                                                        csvToJsonParser.on("data", (data) => {
                                                            records.push(JSON.parse(data.toString('utf8')));
                                                        });

                                                        new Promise((resolve, reject) => {
                                                            recordStream.on("error", (error) => {
                                                                var err = JSON.stringify(error);
                                                                console.log(err)
                                                                var obj = JSON.parse(err);
                                                                if (obj.name == 'InvalidSessionId') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/amazon')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/amazon')
                                                                }
                                                            });

                                                            csvToJsonParser.on("error", (error) => {
                                                                console.error(error);
                                                            });

                                                            csvToJsonParser.on("done", async () => {
                                                                resolve(records);
                                                            });
                                                        }).then((conRecords) => {
                                                            if (conRecords.length == 0) {
                                                                if (contactDetails != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Contact", "insert", contactDetails, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert contact successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        addressInsertion()
                                                                    });
                                                                }
                                                            }
                                                            else if (conRecords.length > 0) {
                                                                for (let i in conRecords) {
                                                                    for (let j in contactDetails) {
                                                                        if (conRecords[i].ERP7__Contact_External_Id__c == contactDetails[j].ERP7__Contact_External_Id__c) {
                                                                            let list = {
                                                                                Id: conRecords[i].Id,
                                                                                AccountId: conRecords[i].AccountId,
                                                                                Email: contactDetails[j].Email,
                                                                                FirstName: contactDetails[j].FirstName,
                                                                                LastName: contactDetails[j].LastName,
                                                                                Phone: contactDetails[j].Phone,
                                                                                ERP7__Contact_External_Id__c: contactDetails[j].ERP7__Contact_External_Id__c
                                                                            }
                                                                            conExist.push(list);
                                                                            conEmailExist.push(contactDetails[j].ERP7__Contact_External_Id__c)
                                                                        }
                                                                    }
                                                                }

                                                                const uniq = new Set(conExist.map(e => JSON.stringify(e)));
                                                                conExist = Array.from(uniq).map(e => JSON.parse(e));

                                                                const uniq1 = new Set(conEmailExist.map(e => JSON.stringify(e)));
                                                                conEmailExist = Array.from(uniq1).map(e => JSON.parse(e));

                                                                // console.log(conExist.length, contactDetails.length, conEmailExist.length, conRecords.length)

                                                                for (let i in contactDetails) {
                                                                    if (!conEmailExist.includes(contactDetails[i].ERP7__Contact_External_Id__c)) conNotExist.push(contactDetails[i])
                                                                }
                                                                // console.log(conNotExist.length)

                                                                if (conNotExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Contact", "insert", conNotExist, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert contact successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + JSON.stringify(rets[i].errors));
                                                                            }
                                                                        }
                                                                    });
                                                                }

                                                                if (conExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Contact", "update", conExist, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " update contact successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        addressInsertion()
                                                                    });
                                                                }
                                                            }
                                                        });
                                                    }
                                                });
                                            }, 2000 * z);
                                        }


                                        function addressInsertion() {
                                            var Address = [];
                                            for (let i in OrdersArray) {
                                                if (OrdersArray[i].shipping_address.zip == OrdersArray[i].billing_address.zip && OrdersArray[i].shipping_address.address1 == OrdersArray[i].billing_address.address1) {
                                                    var list = {
                                                        id: OrdersArray[i].customer.id,
                                                        Name: OrdersArray[i].shipping_address.zip + ' ' + OrdersArray[i].shipping_address.address1,
                                                        address1: OrdersArray[i].shipping_address.address1,
                                                        address2: OrdersArray[i].shipping_address.address2,
                                                        city: OrdersArray[i].shipping_address.city,
                                                        country: OrdersArray[i].shipping_address.country,
                                                        zip: OrdersArray[i].shipping_address.zip,
                                                        province: OrdersArray[i].shipping_address.province,
                                                        ERP7__Is_Shipping_Address__c: true,
                                                        ERP7__Is_Billing_Address__c: true
                                                    }
                                                    Address.push(list)
                                                }
                                                else {
                                                    var list = {
                                                        id: OrdersArray[i].customer.id,
                                                        Name: OrdersArray[i].billing_address.zip + ' ' + OrdersArray[i].billing_address.address1,
                                                        address1: OrdersArray[i].billing_address.address1,
                                                        address2: OrdersArray[i].billing_address.address2,
                                                        city: OrdersArray[i].billing_address.city,
                                                        country: OrdersArray[i].billing_address.country,
                                                        zip: OrdersArray[i].billing_address.zip,
                                                        province: OrdersArray[i].billing_address.province,
                                                        ERP7__Is_Shipping_Address__c: false,
                                                        ERP7__Is_Billing_Address__c: true
                                                    }
                                                    Address.push(list)
                                                    var list1 = {
                                                        id: OrdersArray[i].customer.id,
                                                        Name: OrdersArray[i].shipping_address.zip + ' ' + OrdersArray[i].shipping_address.address1,
                                                        address1: OrdersArray[i].shipping_address.address1,
                                                        address2: OrdersArray[i].shipping_address.address2,
                                                        city: OrdersArray[i].shipping_address.city,
                                                        country: OrdersArray[i].shipping_address.country,
                                                        zip: OrdersArray[i].shipping_address.zip,
                                                        province: OrdersArray[i].shipping_address.province,
                                                        ERP7__Is_Shipping_Address__c: true,
                                                        ERP7__Is_Billing_Address__c: false
                                                    }
                                                    Address.push(list1)
                                                }
                                            }

                                            const uniq = new Set(Address.map(e => JSON.stringify(e)));
                                            Address = Array.from(uniq).map(e => JSON.parse(e));

                                            setTimeout(async function () {
                                                conn.bulk.pollInterval = 1000;
                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                let records = [];


                                                // We still need recordStream to listen for errors. We'll access the stream
                                                // directly though, bypassing jsforce's RecordStream.Parsable
                                                const recordStream = conn.bulk.query(`SELECT Id, Name, Email, AccountId, ERP7__Contact_External_Id__c FROM Contact WHERE AccountId IN ('${accIdExist.join("','")}')`);
                                                const readStream = recordStream.stream();
                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                readStream.pipe(csvToJsonParser);

                                                csvToJsonParser.on("data", (data) => {
                                                    records.push(JSON.parse(data.toString('utf8')));
                                                });

                                                new Promise((resolve, reject) => {
                                                    recordStream.on("error", (error) => {
                                                        var err = JSON.stringify(error);
                                                        console.log(err)
                                                        var obj = JSON.parse(err);
                                                        if (obj.name == 'InvalidSessionId') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/shopify')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/shopify')
                                                        }
                                                    });

                                                    csvToJsonParser.on("error", (error) => {
                                                        console.error(error);
                                                    });

                                                    csvToJsonParser.on("done", async () => {
                                                        resolve(records);
                                                    });
                                                }).then((con2Records) => {
                                                    const unique = new Set(con2Records.map(e => JSON.stringify(e)));
                                                    con2Records = Array.from(unique).map(e => JSON.parse(e));
                                                    var AddressDetails = [];
                                                    if (con2Records.length > 0) {
                                                        for (let i in con2Records) {
                                                            for (let j in Address) {
                                                                if (con2Records[i].ERP7__Contact_External_Id__c == Address[j].id) {
                                                                    var List = {
                                                                        Name: Address[j].Name,
                                                                        ERP7__Contact__c: con2Records[i].Id,
                                                                        ERP7__Customer__c: con2Records[i].AccountId,
                                                                        ERP7__Address_Line1__c: Address[j].address1,
                                                                        ERP7__Address_Line2__c: Address[j].address2,
                                                                        ERP7__City__c: Address[j].city,
                                                                        ERP7__Country__c: Address[j].country,
                                                                        ERP7__Postal_Code__c: Address[j].zip,
                                                                        ERP7__State__c: Address[j].province,
                                                                        ERP7__Is_Shipping_Address__c: Address[j].ERP7__Is_Shipping_Address__c,
                                                                        ERP7__Is_Billing_Address__c: Address[j].ERP7__Is_Billing_Address__c
                                                                    }
                                                                    AddressDetails.push(List)
                                                                }
                                                            }
                                                        }

                                                        const uniq = new Set(AddressDetails.map(e => JSON.stringify(e)));
                                                        AddressDetails = Array.from(uniq).map(e => JSON.parse(e));

                                                        var addIdExist = [];
                                                        var addNotExist = [];

                                                        conn.bulk.pollInterval = 1000;
                                                        conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                        let records = [];

                                                        const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__Customer__c, ERP7__Contact__c, ERP7__City__c, ERP7__Country__c, ERP7__Postal_Code__c, ERP7__State__c, ERP7__Is_Shipping_Address__c, ERP7__Is_Billing_Address__c, ERP7__Address_Line1__c FROM ERP7__Address__c WHERE ERP7__Customer__c IN ('${accIdExist.join("','")}')`);
                                                        const readStream = recordStream.stream();
                                                        const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                        readStream.pipe(csvToJsonParser);

                                                        csvToJsonParser.on("data", (data) => {
                                                            records.push(JSON.parse(data.toString('utf8')));
                                                        });

                                                        new Promise((resolve, reject) => {
                                                            recordStream.on("error", (error) => {
                                                                var err = JSON.stringify(error);
                                                                var obj = JSON.parse(err);
                                                                if (obj.name == 'InvalidSessionId') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/shopify')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/shopify')
                                                                }
                                                            });

                                                            csvToJsonParser.on("error", (error) => {
                                                                console.error(error);
                                                            });

                                                            csvToJsonParser.on("done", async () => {
                                                                resolve(records);
                                                            });
                                                        }).then((addRecords) => {
                                                            const unique = new Set(addRecords.map(e => JSON.stringify(e)));
                                                            addRecords = Array.from(unique).map(e => JSON.parse(e));
                                                            if (addRecords.length == 0) {
                                                                if (AddressDetails != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("ERP7__Address__c", "insert", AddressDetails, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert address successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + JSON.stringify(rets[i].errors));
                                                                            }
                                                                        }
                                                                        orderInsertion()
                                                                    });
                                                                }
                                                            }
                                                            else if (addRecords.length > 0) {
                                                                for (let i in addRecords) {
                                                                    // console.log(`'${addRecords[i].Id}',`)
                                                                    for (let j in AddressDetails) {
                                                                        if (addRecords[i].ERP7__Customer__c == AddressDetails[j].ERP7__Customer__c) {
                                                                            addIdExist.push(AddressDetails[j].ERP7__Customer__c)
                                                                        }
                                                                    }
                                                                }

                                                                for (let i in AddressDetails) {
                                                                    if (!addIdExist.includes(AddressDetails[i].ERP7__Customer__c)) addNotExist.push(AddressDetails[i])
                                                                }

                                                                if (addNotExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("ERP7__Address__c", "insert", addNotExist, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert address successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + JSON.stringify(rets[i].errors));
                                                                            }
                                                                        }
                                                                    });
                                                                }
                                                                setTimeout(orderInsertion, 4000)
                                                            }
                                                        });
                                                    }
                                                });
                                            }, 3000 * z);
                                        }

                                        var orderId = [];
                                        function orderInsertion() {
                                            setTimeout(async function () {
                                                conn.bulk.pollInterval = 1000;
                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                let records = [];
                                                var ShipZip = [];
                                                var ShipAddress = []
                                                var ShipCountry = []

                                                for (let i in OrdersArray) {
                                                    ShipAddress.push(OrdersArray[i].shipping_address.address1)
                                                    ShipCountry.push(OrdersArray[i].shipping_address.country)
                                                    ShipZip.push(OrdersArray[i].shipping_address.zip)
                                                }
                                                // We still need recordStream to listen for errors. We'll access the stream
                                                // directly though, bypassing jsforce's RecordStream.Parsable
                                                const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__Customer__c, ERP7__Contact__c, ERP7__City__c, ERP7__Country__c, ERP7__Postal_Code__c, ERP7__State__c, ERP7__Is_Shipping_Address__c, ERP7__Is_Billing_Address__c, ERP7__Address_Line1__c FROM ERP7__Address__c WHERE ERP7__Customer__c IN ('${accIdExist.join("','")}')`);
                                                const readStream = recordStream.stream();
                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                readStream.pipe(csvToJsonParser);

                                                csvToJsonParser.on("data", (data) => {
                                                    records.push(JSON.parse(data.toString('utf8')));
                                                });

                                                new Promise((resolve, reject) => {
                                                    recordStream.on("error", (error) => {
                                                        var err = JSON.stringify(error);
                                                        var obj = JSON.parse(err);
                                                        if (obj.name == 'InvalidSessionId') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/shopify')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/shopify')
                                                        }
                                                    });

                                                    csvToJsonParser.on("error", (error) => {
                                                        console.error(error);
                                                    });

                                                    csvToJsonParser.on("done", async () => {
                                                        resolve(records);
                                                    });
                                                }).then((add2Records) => {
                                                    const unique = new Set(add2Records.map(e => JSON.stringify(e)));
                                                    add2Records = Array.from(unique).map(e => JSON.parse(e));

                                                    if (add2Records.length > 0) {
                                                        var OrderDetails = [];
                                                        var ShipAddressId = [];
                                                        var BillingAddressId = [];
                                                        for (let j in add2Records) {
                                                            for (let k in OrdersArray) {
                                                                if (add2Records[j].ERP7__Postal_Code__c == OrdersArray[k].shipping_address.zip && add2Records[j].ERP7__Country__c == OrdersArray[k].shipping_address.country && add2Records[j].ERP7__Address_Line1__c == OrdersArray[k].shipping_address.address1) {
                                                                    var list = {
                                                                        ERP7__Customer__c: add2Records[j].ERP7__Customer__c,
                                                                        AddressId: add2Records[j].Id
                                                                    }
                                                                    ShipAddressId.push(list)
                                                                }
                                                                if (add2Records[j].ERP7__Postal_Code__c == OrdersArray[k].billing_address.zip && add2Records[j].ERP7__Country__c == OrdersArray[k].billing_address.country && add2Records[j].ERP7__Address_Line1__c == OrdersArray[k].billing_address.address1) {
                                                                    var list = {
                                                                        ERP7__Customer__c: add2Records[j].ERP7__Customer__c,
                                                                        AddressId: add2Records[j].Id
                                                                    }
                                                                    BillingAddressId.push(list)
                                                                }
                                                            }
                                                        }
                                                        for (let i in contactDetails) {
                                                            for (let j in add2Records) {
                                                                if (contactDetails[i].AccountId == add2Records[j].ERP7__Customer__c) {
                                                                    for (let k in OrdersArray) {
                                                                        if (contactDetails[i].ERP7__Contact_External_Id__c == OrdersArray[k].customer.id) {
                                                                            var ShipId;
                                                                            for (let n in ShipAddressId) {
                                                                                if (ShipAddressId[n].ERP7__Customer__c == add2Records[j].ERP7__Customer__c) {
                                                                                    ShipId = ShipAddressId[n].AddressId
                                                                                }
                                                                            }
                                                                            var BillId;
                                                                            for (let n in BillingAddressId) {
                                                                                if (BillingAddressId[n].ERP7__Customer__c == add2Records[j].ERP7__Customer__c) {
                                                                                    BillId = BillingAddressId[n].AddressId
                                                                                }
                                                                            }
                                                                            var shipCost = '';
                                                                            for (let l in OrdersArray[k].shipping_lines) {
                                                                                shipCost = OrdersArray[k].shipping_lines[l].discounted_price;
                                                                            }
                                                                            var taxPrice = '';
                                                                            for (let m in OrdersArray[k].tax_lines) {
                                                                                taxPrice = OrdersArray[k].tax_lines[m].price;
                                                                            }
                                                                            var order_status = "Draft"
                                                                            if (OrdersArray[k].fulfillment_status == 'fulfilled') {
                                                                                order_status = OrdersArray[k].financial_status == 'refunded' ? 'Cancelled' : 'Shipped'
                                                                            } else if (OrdersArray[k].fulfillment_status == "partial") {
                                                                                order_status = 'Partially Shipped'
                                                                            }
                                                                            var list = {
                                                                                ERP7__Contact__c: add2Records[j].ERP7__Contact__c,
                                                                                ERP7__Stage__c: 'Entered',
                                                                                Status: 'Draft',
                                                                                ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                                                ERP7__Channel__c: Aqxolt_Channel,
                                                                                ERP7__Active__c: true,
                                                                                OrderReferenceNumber: OrdersArray[k].id,
                                                                                ERP7__E_Order_Id__c: OrdersArray[k].id,
                                                                                Name: OrdersArray[k].id,
                                                                                AccountId: contactDetails[i].AccountId,
                                                                                ERP7__Sync_Status__c: order_status,
                                                                                EffectiveDate: OrdersArray[k].created_at,
                                                                                ERP7__Customer_Email__c: OrdersArray[k].customer.email,
                                                                                ERP7__Estimated_Shipping_Amount__c: parseFloat(OrdersArray[k].total_price) + parseFloat(taxPrice),
                                                                                ERP7__Amount__c: OrdersArray[k].total_price,
                                                                                Type: 'Shopify',
                                                                                Pricebook2Id: pricebook_id,
                                                                                ERP7__Bill_To_Address__c: BillId,
                                                                                ERP7__Ship_To_Address__c: ShipId,
                                                                                ERP7__Unique_Id__c: OrdersArray[k].checkout_id,
                                                                                ERP7__Sync_Total_Tax__c: taxPrice,
                                                                                ERP7__Total_Shipping_Amount__c: shipCost,
                                                                                ERP7__Order_Discount__c: OrdersArray[k].current_total_discounts,
                                                                            }
                                                                            OrderDetails.push(list)
                                                                            orderId.push(OrdersArray[k].id)
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        const uniq = new Set(OrderDetails.map(e => JSON.stringify(e)));
                                                        OrderDetails = Array.from(uniq).map(e => JSON.parse(e));

                                                        conn.bulk.pollInterval = 1000;
                                                        conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                        let records = [];


                                                        // We still need recordStream to listen for errors. We'll access the stream
                                                        // directly though, bypassing jsforce's RecordStream.Parsable
                                                        const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__E_Order_Id__c, ERP7__Sync_Status__c, OrderReferenceNumber, ERP7__Amount__c, ERP7__Customer_Email__c, ERP7__Estimated_Shipping_Amount__c, Status, Type, ERP7__Order_Profile__c, ERP7__Channel__c, ERP7__Contact__c, AccountId, ERP7__Ship_To_Address__c, ERP7__Bill_To_Address__c, Pricebook2Id FROM Order WHERE ERP7__E_Order_Id__c IN ('${orderId.join("','")}')`);
                                                        const readStream = recordStream.stream();
                                                        const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                        readStream.pipe(csvToJsonParser);

                                                        csvToJsonParser.on("data", (data) => {
                                                            records.push(JSON.parse(data.toString('utf8')));
                                                        });

                                                        new Promise((resolve, reject) => {
                                                            recordStream.on("error", (error) => {
                                                                var err = JSON.stringify(error);
                                                                var obj = JSON.parse(err);
                                                                if (obj.name == 'InvalidSessionId') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/shopify')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/shopify')
                                                                }
                                                            });

                                                            csvToJsonParser.on("error", (error) => {
                                                                console.error(error);
                                                            });

                                                            csvToJsonParser.on("done", async () => {
                                                                resolve(records);
                                                            });
                                                        }).then((orderRecords) => {
                                                            if (orderRecords.length == 0) {
                                                                if (OrderDetails != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Order", "insert", OrderDetails, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert order successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + JSON.stringify(rets[i].errors));
                                                                            }
                                                                        }
                                                                        productInsert();
                                                                    });
                                                                }
                                                            }
                                                            else if (orderRecords.length > 0) {
                                                                var OrderExist = []
                                                                var OrderIdExist = []
                                                                var OrderNotExist = []
                                                                for (let i in orderRecords) {
                                                                    console.log(`'${orderRecords[i].Id}',`)
                                                                    for (let j in OrderDetails) {
                                                                        if (orderRecords[i].ERP7__E_Order_Id__c == OrderDetails[j].ERP7__E_Order_Id__c) {
                                                                            var list = {
                                                                                Id: orderRecords[i].Id,
                                                                                ERP7__Contact__c: OrderDetails[j].ERP7__Contact__c,
                                                                                ERP7__Stage__c: OrderDetails[j].ERP7__Stage__c,
                                                                                ERP7__Order_Profile__c: Aqxolt_Order_Profile,
                                                                                ERP7__Channel__c: Aqxolt_Channel,
                                                                                ERP7__Active__c: OrderDetails[j].ERP7__Active__c,
                                                                                OrderReferenceNumber: OrderDetails[j].OrderReferenceNumber,
                                                                                ERP7__E_Order_Id__c: OrderDetails[j].ERP7__E_Order_Id__c,
                                                                                Name: OrderDetails[j].Name,
                                                                                AccountId: OrderDetails[j].AccountId,
                                                                                ERP7__Sync_Status__c: OrderDetails[j].ERP7__Sync_Status__c,
                                                                                EffectiveDate: OrderDetails[j].EffectiveDate,
                                                                                ERP7__Customer_Email__c: OrderDetails[j].ERP7__Customer_Email__c,
                                                                                ERP7__Estimated_Shipping_Amount__c: OrderDetails[j].ERP7__Estimated_Shipping_Amount__c,
                                                                                ERP7__Amount__c: OrderDetails[j].ERP7__Amount__c,
                                                                                Type: OrderDetails[j].Type,
                                                                                Pricebook2Id: OrderDetails[j].Pricebook2Id,
                                                                                ERP7__Bill_To_Address__c: OrderDetails[j].ERP7__Bill_To_Address__c,
                                                                                ERP7__Ship_To_Address__c: OrderDetails[j].ERP7__Ship_To_Address__c,
                                                                                ERP7__Sync_Total_Tax__c: OrderDetails[j].ERP7__Sync_Total_Tax__c,
                                                                                ERP7__Total_Shipping_Amount__c: OrderDetails[j].ERP7__Total_Shipping_Amount__c,
                                                                                ERP7__Order_Discount__c: OrderDetails[j].ERP7__Order_Discount__c
                                                                            }
                                                                            OrderExist.push(list)
                                                                            OrderIdExist.push(OrderDetails[j].ERP7__E_Order_Id__c)
                                                                        }
                                                                    }
                                                                }

                                                                const uniq = new Set(OrderExist.map(e => JSON.stringify(e)));
                                                                OrderExist = Array.from(uniq).map(e => JSON.parse(e));

                                                                const uniq1 = new Set(OrderIdExist.map(e => JSON.stringify(e)));
                                                                OrderIdExist = Array.from(uniq1).map(e => JSON.parse(e));

                                                                for (let i in OrderDetails) {
                                                                    if (!OrderIdExist.includes(OrderDetails[i].ERP7__E_Order_Id__c)) OrderNotExist.push(OrderDetails[i])
                                                                }

                                                                if (OrderNotExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Order", "insert", OrderNotExist, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert Order successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("err1 #" + (i + 1) + " error occurred, message = " + JSON.stringify(rets[i].errors));
                                                                            }
                                                                        }
                                                                    });
                                                                }

                                                                if (OrderExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("Order", "update", OrderExist, function (err, rets) {
                                                                        if (err) { return console.error('err 1' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " update Order successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("err #" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        productInsert();
                                                                    });
                                                                }
                                                            }
                                                        });
                                                    }
                                                })
                                            }, 2000 * z);
                                        }

                                        function productInsert() {
                                            var productExist = [];
                                            var productIdExist = [];
                                            var productNotExist = [];

                                            if (SkuId.length > 0) {
                                                setTimeout(async function () {
                                                    conn.bulk.pollInterval = 1000;
                                                    conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                    let records = [];
                                                    // We still need recordStream to listen for errors. We'll access the stream
                                                    // directly though, bypassing jsforce's RecordStream.Parsable
                                                    const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__SKU__c, ERP7__Manufacturer__c, ProductCode, StockKeepingUnit, ERP7__Price_Entry_Amount__c FROM Product2 WHERE StockKeepingUnit IN ('${SkuId.join("','")}')`);
                                                    const readStream = recordStream.stream();
                                                    const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                    readStream.pipe(csvToJsonParser);

                                                    csvToJsonParser.on("data", (data) => {
                                                        records.push(JSON.parse(data.toString('utf8')));
                                                    });

                                                    new Promise((resolve, reject) => {
                                                        recordStream.on("error", (error) => {
                                                            var err = JSON.stringify(error);
                                                            var obj = JSON.parse(err);
                                                            if (obj.name == 'InvalidSessionId') {
                                                                req.flash('error_msg', '• Session has Expired Please try again');
                                                                res.redirect('/shopify')
                                                            } else {
                                                                req.flash('error_msg', '• ' + obj.name);
                                                                res.redirect('/shopify')
                                                            }
                                                        });

                                                        csvToJsonParser.on("error", (error) => {
                                                            console.error(error);
                                                        });

                                                        csvToJsonParser.on("done", async () => {
                                                            resolve(records);
                                                        });
                                                    }).then((prodRecords) => {
                                                        const unique = new Set(prodRecords.map(e => JSON.stringify(e)));
                                                        prodRecords = Array.from(unique).map(e => JSON.parse(e));
                                                        const uniq = new Set(ProductDetails.map(e => JSON.stringify(e)));
                                                        ProductDetails = Array.from(uniq).map(e => JSON.parse(e));

                                                        if (prodRecords.length == 0) {
                                                            if (ProductDetails != []) {
                                                                conn.bulk.pollTimeout = 25000;
                                                                conn.bulk.load("Product2", "insert", ProductDetails, function (err, rets) {
                                                                    if (err) { return console.error('err ' + err); }
                                                                    for (var i = 0; i < rets.length; i++) {
                                                                        if (rets[i].success) {
                                                                            console.log("#" + (i + 1) + " insert Product successfully, id = " + rets[i].id);
                                                                        } else {
                                                                            console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                        }
                                                                    }
                                                                    priceBookEntryInsert();
                                                                });
                                                            }
                                                        }
                                                        else if (prodRecords.length > 0) {
                                                            for (let i in prodRecords) {
                                                                for (let j in ProductDetails) {
                                                                    if (prodRecords[i].StockKeepingUnit == ProductDetails[j].StockKeepingUnit) {
                                                                        var list = {
                                                                            Id: prodRecords[i].Id,
                                                                            Name: ProductDetails[j].Name,
                                                                            ERP7__Manufacturer__c: ProductDetails[j].ERP7__Manufacturer__c,
                                                                            StockKeepingUnit: ProductDetails[j].StockKeepingUnit,
                                                                            ERP7__SKU__c: ProductDetails[j].ERP7__SKU__c,
                                                                            ERP7__Price_Entry_Amount__c: ProductDetails[j].ERP7__Price_Entry_Amount__c,
                                                                            IsActive: true
                                                                        }
                                                                        productExist.push(list)
                                                                        productIdExist.push(ProductDetails[j].StockKeepingUnit)
                                                                    }
                                                                }
                                                            }
                                                            // console.log('productExist ' + productExist.length, 'prodRecords ' + prodRecords.length, 'ProductDetails ' + ProductDetails.length)

                                                            for (let i in ProductDetails) {
                                                                if (!productIdExist.includes(ProductDetails[i].StockKeepingUnit)) productNotExist.push(ProductDetails[i])
                                                            }

                                                            if (productNotExist != []) {
                                                                conn.bulk.pollTimeout = 25000;
                                                                conn.bulk.load("Product2", "insert", productNotExist, function (err, rets) {
                                                                    if (err) { return console.error('err 1' + err); }
                                                                    for (var i = 0; i < rets.length; i++) {
                                                                        if (rets[i].success) {
                                                                            console.log("#" + (i + 1) + " insert Product successfully, id = " + rets[i].id);
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
                                                                            console.log("#" + (i + 1) + " update Product successfully, id = " + rets[i].id);
                                                                        } else {
                                                                            console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                        }
                                                                    }
                                                                    priceBookEntryInsert();
                                                                });
                                                            }
                                                        }
                                                    });
                                                }, 3000 * z);
                                            }
                                        }

                                        var productList = [];
                                        var prodMainId = [];
                                        function priceBookEntryInsert() {
                                            setTimeout(async function () {
                                                conn.bulk.pollInterval = 1000;
                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                let records = [];


                                                // We still need recordStream to listen for errors. We'll access the stream
                                                // directly though, bypassing jsforce's RecordStream.Parsable
                                                const recordStream = conn.bulk.query(`SELECT Id, Name, ERP7__SKU__c, ERP7__Manufacturer__c, ProductCode, StockKeepingUnit, ERP7__Price_Entry_Amount__c FROM Product2 WHERE StockKeepingUnit IN ('${SkuId.join("','")}')`);
                                                const readStream = recordStream.stream();
                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                readStream.pipe(csvToJsonParser);

                                                csvToJsonParser.on("data", (data) => {
                                                    records.push(JSON.parse(data.toString('utf8')));
                                                });

                                                new Promise((resolve, reject) => {
                                                    recordStream.on("error", (error) => {
                                                        var err = JSON.stringify(error);
                                                        console.log(err)
                                                        var obj = JSON.parse(err);
                                                        if (obj.name == 'InvalidSessionId') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/shopify')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/shopify')
                                                        }
                                                    });

                                                    csvToJsonParser.on("error", (error) => {
                                                        console.error(error);
                                                    });

                                                    csvToJsonParser.on("done", async () => {
                                                        resolve(records);
                                                    });
                                                }).then((prod2Records) => {
                                                    if (prod2Records.length > 0) {
                                                        for (let i in prod2Records) {
                                                            prodMainId.push(prod2Records[i].Id)
                                                            productList.push(prod2Records[i])
                                                        }

                                                        var isActive = true;
                                                        var priceBookEntryAvail = [];
                                                        for (let i in productList) {
                                                            for (let j in ProductDetails) {
                                                                if (productList[i].StockKeepingUnit == ProductDetails[j].StockKeepingUnit) {
                                                                    var list = {
                                                                        IsActive: isActive,
                                                                        Pricebook2Id: pricebook_id,
                                                                        Product2Id: productList[i].Id,
                                                                        UnitPrice: ProductDetails[j].ERP7__Price_Entry_Amount__c
                                                                    }
                                                                    priceBookEntryAvail.push(list)
                                                                }
                                                            }
                                                        }
                                                        conn.bulk.pollInterval = 1000;
                                                        conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                        let records = [];


                                                        // We still need recordStream to listen for errors. We'll access the stream
                                                        // directly though, bypassing jsforce's RecordStream.Parsable
                                                        const recordStream = conn.bulk.query(`SELECT Id, Product2Id, Pricebook2Id FROM pricebookentry WHERE isactive = true AND Product2Id IN ('${prodMainId.join("','")}') ORDER BY lastmodifieddate`);
                                                        const readStream = recordStream.stream();
                                                        const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                        readStream.pipe(csvToJsonParser);

                                                        csvToJsonParser.on("data", (data) => {
                                                            records.push(JSON.parse(data.toString('utf8')));
                                                        });

                                                        new Promise((resolve, reject) => {
                                                            recordStream.on("error", (error) => {
                                                                var err = JSON.stringify(error);
                                                                console.log(err)
                                                                var obj = JSON.parse(err);
                                                                if (obj.name == 'InvalidSessionId') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/shopify')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/shopify')
                                                                }
                                                            });

                                                            csvToJsonParser.on("error", (error) => {
                                                                console.error(error);
                                                            });

                                                            csvToJsonParser.on("done", async () => {
                                                                resolve(records);
                                                            });
                                                        }).then((priceRecords) => {
                                                            if (priceRecords.length == 0) {
                                                                if (priceBookEntryAvail != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("pricebookentry", "insert", priceBookEntryAvail, function (err, rets) {
                                                                        if (err) { return console.error('err 2' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert PricebookEntry successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                        orderItemsInsert();
                                                                    });
                                                                }
                                                            }
                                                            else if (priceRecords.length > 0) {
                                                                var priceBookIdExist = [];
                                                                var priceNotExist = [];
                                                                for (let i in priceRecords) {
                                                                    for (let j in priceBookEntryAvail) {
                                                                        if (priceRecords[i].Product2Id == priceBookEntryAvail[j].Product2Id && priceRecords[i].Pricebook2Id == priceBookEntryAvail[j].Pricebook2Id) {
                                                                            var list2 = {
                                                                                Product2Id: priceRecords[i].Product2Id,
                                                                                Pricebook2Id: priceRecords[i].Pricebook2Id
                                                                            }
                                                                            priceBookIdExist.push(list2)
                                                                        }
                                                                    }
                                                                }

                                                                if (priceBookIdExist != []) {
                                                                    priceNotExist = priceBookEntryAvail.filter((Exist) => !priceBookIdExist.some((NotExist) => Exist.Product2Id == NotExist.Product2Id && Exist.Pricebook2Id == NotExist.Pricebook2Id))
                                                                }

                                                                if (priceNotExist != []) {
                                                                    conn.bulk.pollTimeout = 25000;
                                                                    conn.bulk.load("pricebookentry", "insert", priceNotExist, function (err, rets) {
                                                                        if (err) { return console.error('err 2' + err); }
                                                                        for (var i = 0; i < rets.length; i++) {
                                                                            if (rets[i].success) {
                                                                                console.log("#" + (i + 1) + " insert PricebookEntry successfully, id = " + rets[i].id);
                                                                            } else {
                                                                                console.log("#" + (i + 1) + " error occurred, message = " + rets[i].errors.join(', '));
                                                                            }
                                                                        }
                                                                    });
                                                                }
                                                                setTimeout(orderItemsInsert, 4000)
                                                            }
                                                        });
                                                    }
                                                });
                                            }, 2000 * z);
                                        }

                                        function orderItemsInsert() {
                                            var OrderIdAvailable = [];
                                            var OrderShopId = [];
                                            var pricebookIdExist = [];
                                            setTimeout(async function () {
                                                conn.bulk.pollInterval = 1000;
                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                let records = [];

                                                const recordStream = conn.bulk.query(`SELECT Id, Product2Id, Pricebook2Id FROM pricebookentry WHERE isactive = true AND Product2Id IN ('${prodMainId.join("','")}') ORDER BY lastmodifieddate`);
                                                const readStream = recordStream.stream();
                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                readStream.pipe(csvToJsonParser);

                                                csvToJsonParser.on("data", (data) => {
                                                    records.push(JSON.parse(data.toString('utf8')));
                                                });

                                                new Promise((resolve, reject) => {
                                                    recordStream.on("error", (error) => {
                                                        var err = JSON.stringify(error);
                                                        console.log(err)
                                                        var obj = JSON.parse(err);
                                                        if (obj.name == 'InvalidSessionId') {
                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                            res.redirect('/shopify')
                                                        } else {
                                                            req.flash('error_msg', '• ' + obj.name);
                                                            res.redirect('/shopify')
                                                        }
                                                    });

                                                    csvToJsonParser.on("error", (error) => {
                                                        console.error(error);
                                                    });

                                                    csvToJsonParser.on("done", async () => {
                                                        resolve(records);
                                                    });
                                                }).then((price2Records) => {
                                                    if (price2Records.length > 0) {
                                                        for (let i in price2Records) {
                                                            var list = {
                                                                PricebookEntryId: price2Records[i].Id,
                                                                Product2Id: price2Records[i].Product2Id
                                                            }
                                                            pricebookIdExist.push(list)
                                                        }

                                                        conn.bulk.pollInterval = 1000;
                                                        conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                        let records = [];


                                                        // We still need recordStream to listen for errors. We'll access the stream
                                                        // directly though, bypassing jsforce's RecordStream.Parsable
                                                        const recordStream = conn.bulk.query(`SELECT Id, ERP7__E_Order_Id__c, AccountId, Pricebook2Id FROM Order WHERE ERP7__E_Order_Id__c IN ('${orderId.join("','")}')`);
                                                        const readStream = recordStream.stream();
                                                        const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                        readStream.pipe(csvToJsonParser);

                                                        csvToJsonParser.on("data", (data) => {
                                                            records.push(JSON.parse(data.toString('utf8')));
                                                        });

                                                        new Promise((resolve, reject) => {
                                                            recordStream.on("error", (error) => {
                                                                var err = JSON.stringify(error);
                                                                console.log(err)
                                                                var obj = JSON.parse(err);
                                                                if (obj.name == 'InvalidSessionId') {
                                                                    req.flash('error_msg', '• Session has Expired Please try again');
                                                                    res.redirect('/shopify')
                                                                } else {
                                                                    req.flash('error_msg', '• ' + obj.name);
                                                                    res.redirect('/shopify')
                                                                }
                                                            });

                                                            csvToJsonParser.on("error", (error) => {
                                                                console.error(error);
                                                            });

                                                            csvToJsonParser.on("done", async () => {
                                                                resolve(records);
                                                            });
                                                        }).then((order2Records) => {
                                                            if (order2Records.length > 0) {
                                                                for (let i in order2Records) {
                                                                    var list = {
                                                                        OrderId: order2Records[i].Id,
                                                                        ShopifyOrderId: order2Records[i].ERP7__E_Order_Id__c,
                                                                        AccountId: order2Records[i].AccountId
                                                                    }
                                                                    OrderShopId.push(list)
                                                                    OrderIdAvailable.push(order2Records[i].Id)
                                                                }

                                                                var orderItemAvailable = [];
                                                                for (let i in OrdersArray) {
                                                                    for (let j in OrdersArray[i].line_items) {
                                                                        for (let k in productList) {
                                                                            if (OrdersArray[i].line_items[j].sku == productList[k].StockKeepingUnit) {
                                                                                for (let l in OrderShopId) {
                                                                                    if (OrderShopId[l].ShopifyOrderId == OrdersArray[i].id) {
                                                                                        for (let m in pricebookIdExist) {
                                                                                            for (let n in OrdersArray[i].line_items[j].tax_lines) {
                                                                                                if (pricebookIdExist[m].Product2Id == productList[k].Id) {
                                                                                                    // var tax_amount;
                                                                                                    // for (let n in OrdersArray[i].line_items[j].tax_lines) {
                                                                                                    //     tax_amount += OrdersArray[i].line_items[j].tax_lines[n].price;
                                                                                                    // }
                                                                                                    var list = {
                                                                                                        ERP7__Inventory_Tracked__c: true,
                                                                                                        ERP7__Active__c: true,
                                                                                                        OrderId: OrderShopId[l].OrderId,
                                                                                                        Account__c: OrderShopId[l].AccountId,
                                                                                                        ERP7__Order_Line_Status__c: 'In Progress',
                                                                                                        Quantity: OrdersArray[i].line_items[j].quantity,
                                                                                                        UnitPrice: OrdersArray[i].line_items[j].price,
                                                                                                        Product2Id: productList[k].Id,
                                                                                                        ERP7__Is_Back_Order__c: false,
                                                                                                        ERP7__Allocate_Stock__c: true,
                                                                                                        PricebookEntryId: pricebookIdExist[m].PricebookEntryId,
                                                                                                        ERP7__VAT_Amount__c: OrdersArray[i].line_items[j].tax_lines[n].price,
                                                                                                        ERP7__Total_Price__c: parseFloat(OrdersArray[i].line_items[j].quantity * OrdersArray[i].line_items[j].price) + parseFloat(OrdersArray[i].line_items[j].tax_lines[n].price),
                                                                                                        ERP7__Discount_Amount__c: OrdersArray[i].line_items[j].total_discount
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

                                                                conn.bulk.pollInterval = 1000;
                                                                conn.bulk.pollTimeout = Number.MAX_VALUE;
                                                                let records = [];


                                                                // We still need recordStream to listen for errors. We'll access the stream
                                                                // directly though, bypassing jsforce's RecordStream.Parsable
                                                                const recordStream = conn.bulk.query(`SELECT Id, ERP7__Inventory_Tracked__c, ERP7__Active__c, OrderId, ERP7__Order_Line_Status__c, Quantity, UnitPrice, Product2Id, ERP7__Is_Back_Order__c, ERP7__Allocate_Stock__c, PricebookEntryId, ERP7__VAT_Amount__c, ERP7__Total_Price__c FROM OrderItem WHERE OrderId IN ('${OrderIdAvailable.join("','")}') AND Product2Id IN ('${prodMainId.join("','")}')`);
                                                                const readStream = recordStream.stream();
                                                                const csvToJsonParser = csv({ flatKeys: false, checkType: true });
                                                                readStream.pipe(csvToJsonParser);

                                                                csvToJsonParser.on("data", (data) => {
                                                                    records.push(JSON.parse(data.toString('utf8')));
                                                                });

                                                                new Promise((resolve, reject) => {
                                                                    recordStream.on("error", (error) => {
                                                                        var err = JSON.stringify(error);
                                                                        console.log(err)
                                                                        var obj = JSON.parse(err);
                                                                        if (obj.name == 'InvalidSessionId') {
                                                                            req.flash('error_msg', '• Session has Expired Please try again');
                                                                            res.redirect('/shopify')
                                                                        } else {
                                                                            req.flash('error_msg', '• ' + obj.name);
                                                                            res.redirect('/shopify')
                                                                        }
                                                                    });

                                                                    csvToJsonParser.on("error", (error) => {
                                                                        console.error(error);
                                                                    });

                                                                    csvToJsonParser.on("done", async () => {
                                                                        resolve(records);
                                                                    });
                                                                }).then((orderitemRecords) => {
                                                                    if (orderitemRecords.length == 0) {
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
                                                                                pool.query('INSERT INTO jobs_log (email, updated_at, category, message, seller_id) VALUES ($1, $2, $3, $4, $5)', [Email, updatedDate, 'shopify', 'Order Sync', shopName]);                                                                                
                                                                            });
                                                                        }
                                                                    }
                                                                    else if (orderitemRecords.length > 0) {
                                                                        var orderItemExist = [];
                                                                        var orderItemIdExist = [];
                                                                        var orderItemNotExist = [];
                                                                        for (let i in orderitemRecords) {
                                                                            for (let j in orderItemAvailable) {
                                                                                if (orderitemRecords[i].OrderId == orderItemAvailable[j].OrderId && orderitemRecords[i].Product2Id == orderItemAvailable[j].Product2Id && orderitemRecords[i].PricebookEntryId == orderItemAvailable[j].PricebookEntryId) {
                                                                                    var list = {
                                                                                        Id: orderitemRecords[i].Id,
                                                                                        ERP7__Inventory_Tracked__c: orderItemAvailable[j].ERP7__Inventory_Tracked__c,
                                                                                        ERP7__Active__c: orderItemAvailable[j].ERP7__Active__c,
                                                                                        ERP7__Order_Line_Status__c: orderItemAvailable[j].ERP7__Order_Line_Status__c,
                                                                                        Quantity: orderItemAvailable[j].Quantity,
                                                                                        UnitPrice: orderItemAvailable[j].UnitPrice,
                                                                                        ERP7__VAT_Amount__c: orderItemAvailable[j].ERP7__VAT_Amount__c,
                                                                                        ERP7__Total_Price__c: orderItemAvailable[j].ERP7__Total_Price__c,
                                                                                        ERP7__Discount_Amount__c: orderItemAvailable[j].ERP7__Discount_Amount__c
                                                                                    }
                                                                                    var list2 = {
                                                                                        OrderId: orderitemRecords[i].OrderId,
                                                                                        Product2Id: orderitemRecords[i].Product2Id,
                                                                                        PricebookEntryId: orderitemRecords[i].PricebookEntryId
                                                                                    }
                                                                                    orderItemExist.push(list)
                                                                                    orderItemIdExist.push(list2)
                                                                                }
                                                                            }
                                                                        }

                                                                        if (orderItemIdExist != []) {
                                                                            orderItemNotExist = orderItemAvailable.filter((o1) => !orderItemIdExist.some((o2) => o1.OrderId == o2.OrderId && o1.Product2Id == o2.Product2Id && o1.PricebookEntryId == o2.PricebookEntryId));
                                                                        }
                                                                        console.log(orderItemNotExist.length)

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
                                                                                pool.query('INSERT INTO jobs_log (email, updated_at, category, message, seller_id) VALUES ($1, $2, $3, $4, $5)', [Email, updatedDate, 'shopify', 'Order Sync', shopName]);
                                                                            });
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            }, 2000 * z);
                                        }

                                    }
                                }
                            }, 2000 * z);
                        }
                    }
                }))
                client.release();
            });

        } catch (e) {
            console.log('Error-> ', e);
        }
    })();
}
