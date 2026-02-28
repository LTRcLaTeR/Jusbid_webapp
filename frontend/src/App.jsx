
import React,{useEffect,useState} from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'

const socket = io("http://localhost:5000")

export default function App(){
  const [auctions,setAuctions]=useState([])

  useEffect(()=>{
    fetchAuctions()
    socket.on("new_bid",fetchAuctions)
  },[])

  const fetchAuctions=async()=>{
    const res=await axios.get("http://localhost:5000/auction")
    setAuctions(res.data)
  }

  return (
    <div style={{padding:"20px",fontFamily:"Arial"}}>
      <h1>🔥 JusBid Full Pro</h1>
      {auctions.map(a=>(
        <div key={a.id} style={{border:"1px solid #ddd",padding:"10px",margin:"10px"}}>
          <h3>{a.title}</h3>
          {a.image_url && <img src={"http://localhost:5000"+a.image_url} width="200"/>}
          <p>Price: {a.current_price}</p>
          <p>Status: {a.status}</p>
        </div>
      ))}
    </div>
  )
}
