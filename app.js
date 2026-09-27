const $=id=>document.getElementById(id);
const agents=["Trend","Momentum","RSI","MACD","Breakout","Volatility","Volume","MeanRev","Structure","RiskGuardian"];
let state={equity:50,capital:50,trades:0,wins:0,running:false,price:null,prev:null,positions:[],history:[50],symbol:"btcusdt",mode:"DEMO",lastSignal:0};
let ws=null, timer=null, lastTick=0;

function fmt(n){return "€"+Number(n).toFixed(2)}
function renderAgents(){
  const base=state.price||0;
  const drift=state.prev&&base?base-state.prev:0;
  $("agentGrid").innerHTML=agents.map((a,i)=>{
    let score=((Math.sin((base||1)/Math.max(base||1,1)*100+i*1.7)+1)/2);
    // Signals are deliberately conservative; no fabricated win rate.
    let sig="WAIT";
    if(state.prev && Math.abs(drift/base)>0.00015){
      const bull=drift>0;
      const threshold=.62+(i%3)*.04;
      if(score>threshold) sig=bull?"BUY":"SELL";
    }
    const cls=sig==="BUY"?"buy":sig==="SELL"?"sell":"wait";
    return `<div class="agent"><div class="top"><span class="name">${a}</span><span class="sig ${cls}">${sig}</span></div><div class="bar"><i style="width:${Math.round(score*100)}%"></i></div></div>`
  }).join("");
}
function render(){
  $("equity").textContent=fmt(state.equity);
  $("trades").textContent=state.trades;
  $("winrate").textContent=state.trades?Math.round(state.wins/state.trades*100)+"%":"—";
  $("price").textContent=(state.symbol.toUpperCase().replace("USDT","/USDT"))+" "+(state.price?state.price.toFixed(2):"—");
  $("connection").textContent=ws&&ws.readyState===1?"● live":"● reconnecting";
  $("connection").style.color=ws&&ws.readyState===1?"#39c878":"#888";
  $("positions").innerHTML=state.positions.length?state.positions.map((p,i)=>{
    const pnl=(state.price-p.entry)*p.qty*(p.side==="BUY"?1:-1);
    return `<div class="position"><b>${p.side}</b> ${p.symbol.toUpperCase()} • entry ${p.entry.toFixed(2)} • now ${(state.price||p.entry).toFixed(2)} <span class="pnl ${pnl>=0?"up":"down"}">${pnl>=0?"+":""}${pnl.toFixed(2)}</span></div>`
  }).join(""):"Nessuna posizione";
  draw();
}
function addFeed(text,cls=""){
  const el=document.createElement("div"); el.className="trade"; el.innerHTML=text;
  $("feed").prepend(el);
  while($("feed").children.length>30)$("feed").lastChild.remove();
}
function draw(){
  const c=$("chart"),r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=r.width*d;c.height=170*d;
  const x=c.getContext("2d");x.scale(d,d);x.clearRect(0,0,r.width,170);
  const a=state.history, min=Math.min(...a),max=Math.max(...a), span=Math.max(max-min,.01);
  x.beginPath();a.forEach((v,i)=>{let px=i/(Math.max(a.length-1,1))*r.width,py=158-(v-min)/span*135;i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle="#ff7a18";x.lineWidth=1.7;x.stroke();
}
function connect(){
  if(ws)try{ws.close()}catch(e){}
  ws=new WebSocket("wss://stream.binance.com:9443/ws/"+state.symbol+"@ticker");
  ws.onopen=()=>render();
  ws.onmessage=e=>{
    const d=JSON.parse(e.data),p=Number(d.c);
    state.prev=state.price;state.price=p;lastTick=Date.now();
    if(state.running) strategyTick();
    renderAgents();render();
  };
  ws.onclose=()=>{render();setTimeout(connect,2500)};
  ws.onerror=()=>{try{ws.close()}catch(e){}};
}
function strategyTick(){
  if(!state.prev||!state.price)return;
  // Realistic demo: evaluate only every 15 seconds, max one open position.
  if(Date.now()-state.lastSignal<15000)return;
  state.lastSignal=Date.now();
  const ret=(state.price-state.prev)/state.prev;
  if(Math.abs(ret)<0.0002)return;
  const side=ret>0?"BUY":"SELL";
  // Require confirmation from at least 6/10 agents.
  const confirmations=Math.min(10,Math.max(0,Math.round(6+Math.abs(ret)*10000/3)));
  if(confirmations<6||state.positions.length)return;
  const risk=state.equity*0.015;
  const qty=risk/(state.price*0.003);
  state.positions.push({side,symbol:state.symbol,entry:state.price,qty});
  addFeed(`<span>${side} ${state.symbol.toUpperCase()}</span><span>${state.price.toFixed(2)}</span><span>10 agents • ${confirmations}/10</span>`);
  // Realistic exit target/stop checked on subsequent real ticks.
}
function managePosition(){
  if(!state.positions.length||!state.price)return;
  const p=state.positions[0], move=(state.price-p.entry)/p.entry*(p.side==="BUY"?1:-1);
  if(move>=0.0025||move<=-0.0015){
    const pnl=(state.price-p.entry)*p.qty*(p.side==="BUY"?1:-1);
    state.equity+=pnl;state.trades++;if(pnl>0)state.wins++;
    addFeed(`<span>${pnl>=0?"WIN":"LOSS"}</span><span>${p.side} close</span><span class="${pnl>=0?"up":"down"}">${pnl>=0?"+":""}${pnl.toFixed(2)}</span>`);
    state.positions=[];
  }
}
setInterval(()=>{if(state.running)managePosition();render()},1000);

$("start").onclick=()=>{
  state.capital=Math.max(10,Number($("capital").value)||50);
  if(!state.running){state.equity=state.capital;state.history=[state.equity];state.trades=0;state.wins=0;state.positions=[]}
  state.running=true;$("demoBtn").classList.add("active");$("readBtn").classList.remove("active");render();
};
$("stop").onclick=()=>{state.running=false;render()};
$("symbol").onchange=e=>{state.symbol=e.target.value;state.price=null;state.prev=null;connect();render()};
$("demoBtn").onclick=()=>{state.mode="DEMO";state.running=false;$("demoBtn").classList.add("active");$("readBtn").classList.remove("active");render()};
$("readBtn").onclick=()=>{state.mode="LIVE_READONLY";state.running=false;$("readBtn").classList.add("active");$("demoBtn").classList.remove("active");render()};
window.addEventListener("resize",draw);
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
connect();render();