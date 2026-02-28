
require("dotenv").config()
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const multer = require("multer")
const cron = require("node-cron")
const { Pool } = require("pg")

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

async function initDB(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'buyer'
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS auctions(
    id SERIAL PRIMARY KEY,
    title TEXT,
    description TEXT,
    image_url TEXT,
    current_price INT,
    end_time TIMESTAMP,
    seller_id INT,
    status TEXT DEFAULT 'active'
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS bids(
    id SERIAL PRIMARY KEY,
    auction_id INT,
    user_id INT,
    amount INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
}

const PORT = process.env.PORT || 5000

initDB().then(()=>{
  server.listen(5000,()=>console.log("Backend running"))
})


function auth(req,res,next){
  const token = req.headers.authorization?.split(" ")[1]
  if(!token) return res.status(401).json({message:"No token"})
  try{
    req.user = jwt.verify(token,"secret")
    next()
  }catch{
    res.status(403).json({message:"Invalid token"})
  }
}

const storage = multer.diskStorage({
  destination:"uploads",
  filename:(req,file,cb)=>cb(null,Date.now()+"-"+file.originalname)
})
const upload = multer({storage})

app.post("/register", async(req,res)=>{
  const hash = await bcrypt.hash(req.body.password,10)
  await pool.query("INSERT INTO users(email,password) VALUES($1,$2)",
    [req.body.email,hash])
  res.json({message:"Registered"})
})

app.post("/login", async(req,res)=>{
  const user = await pool.query("SELECT * FROM users WHERE email=$1",[req.body.email])
  if(!user.rows.length) return res.status(400).json({message:"No user"})
  const valid = await bcrypt.compare(req.body.password,user.rows[0].password)
  if(!valid) return res.status(400).json({message:"Wrong password"})
  const token = jwt.sign({id:user.rows[0].id},"secret")
  res.json({token})
})

app.post("/auction", auth, upload.single("image"), async(req,res)=>{
  const end = new Date(Date.now() + req.body.minutes*60000)
  await pool.query(
    "INSERT INTO auctions(title,description,image_url,current_price,end_time,seller_id) VALUES($1,$2,$3,$4,$5,$6)",
    [req.body.title,req.body.description,
     req.file?"/uploads/"+req.file.filename:null,
     req.body.price,end,req.user.id])
  res.json({message:"Auction created"})
})

app.get("/auction", async(req,res)=>{
  const data = await pool.query("SELECT * FROM auctions ORDER BY id DESC")
  res.json(data.rows)
})

app.post("/bid/:id", auth, async(req,res)=>{
  const auction = await pool.query("SELECT * FROM auctions WHERE id=$1",[req.params.id])
  const a = auction.rows[0]
  if(!a || a.status!=="active") return res.status(400).json({message:"Ended"})
  if(req.body.amount <= a.current_price) return res.status(400).json({message:"Too low"})
  let endTime = new Date(a.end_time)
  if((endTime - new Date())/1000 < 60){
    endTime = new Date(endTime.getTime()+60000)
  }
  await pool.query("UPDATE auctions SET current_price=$1,end_time=$2 WHERE id=$3",
    [req.body.amount,endTime,req.params.id])
  await pool.query("INSERT INTO bids(auction_id,user_id,amount) VALUES($1,$2,$3)",
    [req.params.id,req.user.id,req.body.amount])
  io.emit("new_bid",req.params.id)
  res.json({message:"Bid placed"})
})

cron.schedule("*/10 * * * * *", async()=>{
  await pool.query("UPDATE auctions SET status='ended' WHERE end_time < NOW() AND status='active'")
})
