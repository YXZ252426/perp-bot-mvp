// ai-worker/index.js
const express = require("express");
const app = express(); app.use(express.json());

app.post("/announce", (req,res)=>{
  const st = req.body?.state || {};
  const z = st.z30 ?? 0;
  let stance = "NEUTRAL", text = "Sideways";
  if (z >  0.8) { stance="BULL";  text="Momentum building"; }
  if (z < -0.8) { stance="BEAR";  text="Reversal risk"; }
  res.json({ announce: { text, stance }, tick: st.tick, telemetry:{latency_ms:5} });
});

app.listen(9933, ()=>console.log("ai-worker on :9933"));
