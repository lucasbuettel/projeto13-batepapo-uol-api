import express from "express";
import dotenv from "dotenv"
import { MongoClient } from "mongodb";
import cors from "cors";
import joi from "joi";
import dayjs from "dayjs";

const participantSchema = joi.object({
    name: joi.string().min(4).required()
})

const messageSchema = joi.object({
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.string().valid("message", "private_message").required()
})
    
let time = dayjs().locale("pt-br").format("HH:mm:ss");

const app = express();
dotenv.config();
app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);

try{
    await mongoClient.connect();
    console.log("MongoDB conected");
} catch (err) {
    console.log(err);
}
const db = mongoClient.db("batePapoUol");


app.post("/participants",  async (req, res) => {
    const {name} = req.body;
    
    const participants = {
        name
    }


    const validation = participantSchema.validate(participants, {abortEarly: false});

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        res.status(422).send(errors);
        return;
    }

    const userName = {
        name,
        lastStatus: Date.now()
    }
    
    const login =  {
        from: name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time
    }

    const messageFrom = await db.collection("participants").find().toArray();
    const userExists = messageFrom.find((e) => e.name === name);

    if (userExists) {
        res.status(409).send({ error: "Usuário já existe" });
        return;
    }

    try{
        await db.collection("participants").insertOne(userName);
        await db.collection("messages").insertOne(login);
        
        res.sendStatus(201)
    }
    catch (err){
        res.send(err);
        res.sendStatus(422);

    }    
})

app.get("/participants",  async (req, res) => {

    try{
        const users = await db.collection("participants").find().toArray();
        res.send(users);
    }
    catch (err){
        console.log(err);

    }    
})

app.post("/messages",  async (req, res) => {
    const {to, text, type} = req.body;
    const {user} = req.headers;

    const messages = {
        to,
        text,
        type   
    }
    
    
    const validation = messageSchema.validate(messages, { abortEarly: false });
    
    if (validation.error) {
        const erros = validation.error.details.map((detail) => detail.message);
        res.status(422).send(erros);
        return;
    }
    
    const messageFrom = await db.collection("participants").find().toArray();
    const userExists = messageFrom.find((f) => f.name === user);

    if (!userExists) {
        res.status(409).send({ error: "Usuário não existe" });
        return;
    }

    const verifMessage = {
        to,
        from: user,
        text,
        type,
        time
    }


    try{
        await db.collection("messages").insertOne(verifMessage);
        
        res.sendStatus(201)
    }
    catch (err){
      console.log(err);
      res.sendStatus(422);

    }    
})

app.get("/messages",  async (req, res) => {

    const limit = req.query.limit;
    const user = req.headers.user;

    try {
        const message = await db.collection("messages").find().toArray();
        let lastMessages = message.filter(m => 
            m.to === user || m.from === user || m.to === 'Todos');

        if (!limit) {
            lastMessages = lastMessages.slice(0, limit);
        }
        res.send(lastMessages);
    } catch (err) {
        console.log(err);
    }

})

app.post("/status",  async (req, res) => {
    const {user} = req.headers;

    const checkStatus = await db.collection("participants").find().toArray();
    const userExists = checkStatus.find((s) => s.name === user);

    if (!userExists) {
        res.sendStatus(404);
        return;
    }
    
    try{
        await db.collection("participants").updateOne(
            { name: user },
            { $set: { lastStatus: Date.now() } }
            );
     
        res.sendStatus(201);
    }
    catch (err){
        res.send(err);

    }    
})

async function removeUser() {
    const participants = await db.collection("participants").find().toArray()

    participants.forEach(async (user) => {
        let timer = new Date().toLocaleTimeString();
        

        if (((Date.now() / 1000)) - (user.lastStatus / 1000) > 10) {
            await db.collection("participants").deleteOne({ name: user.name })
            await db.collection("messages").insertOne({
                from: user.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: timer
            });
        };
    });
};

setInterval(removeUser, 15000);


app.listen(process.env.PORT,() => console.log(`Server running in port: ${process.env.PORT}`))