const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { query } = require('express');
const app = express();
const prot = process.env.PORT || 5000;

// middle wares
app.use(cors());
app.use(express.json());

// console.log(process.env.DB_USER)
// console.log(process.env.DB_PASSWORD)

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.uxk5wr6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    const authHeaders = req.headers.authorization;
    if (!authHeaders) {
        return res.status(401).send({message: 'unauthorized access'})
    }
    const token = authHeaders.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded){
        if (err) {
            return res.status(401).send({message: 'unauthorized access'});
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const serviceCollection = client.db('geniusCar').collection('services');
        const orderCollection = client.db('geniusCar').collection('orders');

        app.post('/jwt', (req, res)=> {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'} );
            res.send({token})
        })

        app.get('/services', async(req, res)=> {
            const query  = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })
        app.get('/services/:id', async(req, res)=> {
            const id = req.params.id;
            const query = {_id: ObjectId(id)}
            const service = await serviceCollection.findOne(query);
            res.send(service);
        })

        // orders api
        app.post('/orders', verifyJWT, async(req, res)=> {
            const order = req.body;
            const results = await orderCollection.insertOne(order);
            res.send(results);
        })

        app.get('/orders', verifyJWT, async(req, res)=> {
            const decoded = req.decoded;
            if (decoded.email !== req.query.email) {
                res.status(403).send({message : 'unauthorized access'})
            }
            let query = {};
            if (req.query.email) {
                query = {email: req.query.email}
            }
            const cursor = orderCollection.find(query);
            const orders = await cursor.toArray()
            res.send(orders)
        });

        app.delete('/orders/:id', verifyJWT, async(req, res)=> {
            const query = {_id: ObjectId(req.params.id)};
            const results = await orderCollection.deleteOne(query);
            res.send(results);
        })
        app.patch('/orders/:id', verifyJWT, async(req, res)=> {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
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