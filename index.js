const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const SSLCommerzPayment = require('sslcommerz-lts');
const { query } = require('express');
const app = express();
const prot = process.env.PORT || 5000;

// middle wares
app.use(cors());
app.use(express.json());

const store_id = process.env.SSL_STORE_ID;
const store_passwd = process.env.SSL_STORE_PASSWORD;
const is_live = false //true for live, false for sandbox

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.uxk5wr6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeaders = req.headers.authorization;
    if (!authHeaders) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeaders.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const serviceCollection = client.db('geniusCar').collection('services');
        const orderCollection = client.db('geniusCar').collection('orders');

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ token })
        })

        app.get('/services', async (req, res) => {
            const search = req.query.search;
            let query = {}
            if (search.length) {
                query = { $text: { $search: search } }
            };
            // comparison operator
            // const query  = {price: {$gt: 50, $lt: 250}};
            // const query  = {price: {$eq: 200}};
            // const query  = {price: {$ne: 200}};
            // const query  = {price: {$gte: 200}};
            // const query  = {price: {$lte: 200}};
            // const query  = {price: {$in: [20, 30, 200]}};
            // const query  = {price: {$nin: [20, 30, 200]}};
            // logical operator
            // const query  = {$and:  [{ price: {$gt: 20}}, {price: {$lt: 300}}]};            
            // const query  = {$and:  [{ price: {$gt: 20}}, {price: {$lt: 300}}]};            
            const order = req.query.order === 'asc' ? 1 : -1;
            const cursor = serviceCollection.find(query).sort({ price: order });
            const services = await cursor.toArray();
            res.send(services)
        })
        app.get('/services/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const service = await serviceCollection.findOne(query);
            res.send(service);
        })

        // orders api
        app.post('/orders', verifyJWT, async (req, res) => {
            const order = req.body;
            const { serviceId, currency, email, phone, customer, address } = order;
            if (!serviceId || !currency || !address) {
                return res.send({error: "please provide all the information"})
            }
            const orderService = await serviceCollection.findOne({ _id: ObjectId(serviceId) });
            const transactionId = new ObjectId().toString();
            const data = {
                total_amount: orderService.price,
                currency: currency,
                tran_id: transactionId, // use unique tran_id for each api call
                success_url: `http://localhost:5000/payment/success?transactionId=${transactionId}`,
                fail_url: `http://localhost:5000/payment/fail?transactionId=${transactionId}`,
                cancel_url: 'http://localhost:5000/payment/cancel',
                ipn_url: 'http://localhost:3030/ipn',
                shipping_method: 'Courier',
                product_name: 'Computer.',
                product_category: 'Electronic',
                product_profile: 'general',
                cus_name: customer,
                cus_email: email,
                cus_add1: address,
                cus_add2: 'Dhaka',
                cus_city: 'Dhaka',
                cus_state: 'Dhaka',
                cus_postcode: '1000',
                cus_country: 'Bangladesh',
                cus_phone: phone,
                cus_fax: '01711111111',
                ship_name: 'Customer Name',
                ship_add1: 'Dhaka',
                ship_add2: 'Dhaka',
                ship_city: address,
                ship_state: 'Dhaka',
                ship_postcode: 1000,
                ship_country: 'Bangladesh',
            };
            const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
            sslcz.init(data).then(apiResponse => {
                // Redirect the user to payment gateway
                let GatewayPageURL = apiResponse.GatewayPageURL;
                orderCollection.insertOne({
                    ...order,
                    price: orderService.price,
                    transactionId,
                    paid: false
                })
                res.send({ url: GatewayPageURL })
                // console.log('Redirecting to: ', GatewayPageURL)
            });
        })
        app.post('/payment/success', async (req, res) => {
            const { transactionId } = req.query;
            if (!transactionId) {
                return res.redirect(`http://localhost:3000/payment/fail?transactionId=${transactionId}`)
            }
            const results = await orderCollection.updateOne({ transactionId }, { $set: { paid: true, date: new Date() } })
            if (results.modifiedCount > 0) {
                res.redirect(`http://localhost:3000/payment/success?transactionId=${transactionId}`)
            }
            res.send()
        })
        app.post('/payment/fail', async (req, res)=> {
            const { transactionId } = req.query;
            const results = await orderCollection.deleteOne({ transactionId })
            if (results.deletedCount > 0) {
                res.redirect(`http://localhost:3000/payment/fail?transactionId=${transactionId}`)
            }
            res.send()
        })

        app.get('/order/by-transaction-id/:id', async (req, res) => {
            const { id } = req.params;
            const query = {transactionId: id};
            const order = await orderCollection.findOne(query);
            res.send(order);
        })

        app.get('/orders', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            if (decoded.email !== req.query.email) {
                res.status(403).send({ message: 'unauthorized access' })
            }
            let query = {};
            if (req.query.email) {
                query = { email: req.query.email }
            }
            const cursor = orderCollection.find(query);
            const orders = await cursor.toArray()
            res.send(orders)
        });

        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const query = { _id: ObjectId(req.params.id) };
            const results = await orderCollection.deleteOne(query);
            res.send(results);
        })
        app.patch('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const status = req.body.status;
            const updateDoc = {
                $set: { status }

            };
            const results = await orderCollection.updateOne(filter, updateDoc);
            res.send(results)
        })

    }
    finally {

    }
}
run().catch(err => console.log(err.message))


app.get('/', (req, res) => {
    res.send('this genius car sever site')
})

app.listen(prot, () => {
    console.log('genius car server port:', prot)
})