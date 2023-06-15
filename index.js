const express = require('express');
require('dotenv').config();
const cors = require ('cors');
const jwt = require('jsonwebtoken');
const app = express();

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware
app.use(cors ());
app.use (express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


// Mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@nowshinkhan.c8ljhxf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

      const studentCollection = client.db("summerCamp").collection("student");
      const cartCollection = client.db("summerCamp").collection("carts");
      const usersCollection = client.db("summerCamp").collection("users");
      const paymentCollection = client.db("summerCamp").collection("payments");

      app.post('/jwt', (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
  
        res.send({ token })
      })

      // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }


      // users related apis
    // app.get('/instructor', async (req, res) => {
    //   const result = await usersCollection.find().toArray();
    //   res.send(result);
    // });
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // security layer: verifyJWT
    // email same
    // check admin
    app.get('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })
    // app.patch('/users/instructor/:id', async (req, res) => {
    //   const id = req.params.id;
    //   console.log(id);
    //   const filter = { _id: new ObjectId(id) };
    //   const updateDoc = {
    //     $set: {
    //       role: 'instructor'
    //     },
    //   };

    //   const result = await usersCollection.updateOne(filter, updateDoc);
    //   res.send(result);

    // })

      // all classes related apis
      app.get('/student', async(req, res) =>{
        const result = await studentCollection.find().toArray();
        res.send(result);
      })

      app.post('/student', verifyJWT, verifyAdmin, async (req, res) => {
        const newClass = req.body;
        const result = await studentCollection.insertOne(newClass)
        res.send(result);
      })
  
      app.delete('/student/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await studentCollection.deleteOne(query);
        res.send(result);
      })

      // cart collection api
      app.get('/carts', verifyJWT, async(req, res) =>{
        const email = req.query.email;
        
        if(!email){
          res.send([]);
        }

        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res.status(403).send({ error: true, message: 'forbidden access' })
        }


        const query = { email: email };
        const result = await cartCollection.find(query).toArray();
        res.send(result);
      });

      app.post('/carts', async(req, res) =>{
        const item = req.body;
        console.log(item);
        const result = await cartCollection.insertOne(item);
        res.send(result);
      })

      app.get('/carts/:id', async (req, res) =>{
        const id= req.params.id
        const query ={_id: new ObjectId(id)};
        const result = await cartCollection.findOne(query)
        res.send(result)
      })

      app.delete('/carts/:id', async (req, res) => {
        const id = req.params.id;
        console.log(id);
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      })

      // create payment intent
      app.post('/create-payment-intent',verifyJWT, async(req, res) => {
        const {price} = req.body;
        const amount = price*100;
        const  paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        })
      })

      // payment api
      app.post('/payments', verifyJWT, async(req, res) => {
        const payment = req.body;
        const insertResult = await paymentCollection.insertOne(payment);


        const query = {_id: {$in: payment.cartItems.map(id => new ObjectId(id))}}
        const deleteResult = await cartCollection.deleteMany(query)

        res.send({insertResult, deleteResult});
      })

    
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) =>{
    res.send ('summer camp is Running')
})

app.listen(port, () =>{
    console.log(`Summer camp is running on port, ${port}`)
})