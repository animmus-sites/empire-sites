/* QuoteForge shared library: storage, encoding, pricing math, validation, CSV. */
(function(){
"use strict";

var CONFIG_KEY = "quoteforge_config";
var LEADS_KEY  = "quoteforge_leads";

function uid(){ return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

/* ---------- storage (every read/write wrapped) ---------- */
function readJSON(key, fallback){
  try{
    var raw = localStorage.getItem(key);
    if(raw==null) return fallback;
    return JSON.parse(raw);
  }catch(e){ return fallback; }
}
function writeJSON(key, val){
  try{
    localStorage.setItem(key, JSON.stringify(val));
    return {ok:true};
  }catch(e){
    return {ok:false, error:"Your browser's storage is full or blocked. Free up space or allow site data, then try again."};
  }
}
function loadConfig(){ return readJSON(CONFIG_KEY, null); }
function saveConfig(cfg){ return writeJSON(CONFIG_KEY, cfg); }
function loadLeads(){ var l = readJSON(LEADS_KEY, []); return Array.isArray(l)?l:[]; }
function saveLeads(leads){ return writeJSON(LEADS_KEY, leads); }

/* ---------- config share encoding (#c=base64url JSON) ---------- */
function encodeConfig(cfg){
  var json = JSON.stringify(cfg);
  var b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decodeConfig(hash){
  try{
    var s = String(hash||"").replace(/^#/,"");
    var m = s.match(/(?:^|[?&#])c=([^&]*)/);
    if(!m) return {ok:false, error:"missing"};
    var b64 = m[1].replace(/-/g,"+").replace(/_/g,"/");
    while(b64.length % 4) b64 += "=";
    var json = decodeURIComponent(escape(atob(b64)));
    var cfg = JSON.parse(json);
    return validateConfig(cfg);
  }catch(e){
    return {ok:false, error:"corrupt"};
  }
}

/* ---------- validation ---------- */
function isNum(v){ return typeof v==="number" && isFinite(v); }
function validateConfig(cfg){
  if(!cfg || typeof cfg!=="object") return {ok:false, error:"corrupt"};
  if(!Array.isArray(cfg.services) || cfg.services.length===0)
    return {ok:false, error:"empty", message:"This quote link has no services configured yet."};
  for(var i=0;i<cfg.services.length;i++){
    var s = cfg.services[i];
    if(!s.name || !isNum(s.basePrice) || s.basePrice<0)
      return {ok:false, error:"invalid", message:"A service in this link has an invalid name or price."};
    if(!Array.isArray(s.modifiers)) s.modifiers = [];
  }
  return {ok:true, config:cfg};
}
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validEmail(v){ return EMAIL_RE.test(String(v||"").trim()); }
function validPhone(v){ var d = String(v||"").replace(/\D/g,""); return d.length>=7 && d.length<=15; }
function normPhone(v){ return String(v||"").replace(/\D/g,""); }

/* ---------- pricing math ---------- */
/* option kinds: add (fixed $), mult (x, e.g. 1.2 = +20% of base), unit ($ per unit x qty) */
function optionDelta(opt, base, qty){
  var v = Number(opt.value)||0;
  if(opt.kind==="mult") return base*(v-1);
  if(opt.kind==="unit") return v*(qty==null?1:qty);
  return v;
}
function modifierBounds(mod, base){
  if(mod.type==="quantity"){
    var pu = Number(mod.perUnit)||0, mn = Number(mod.min)||0, mx = Number(mod.max)||0;
    return {min: pu*mn, max: pu*mx, unitLabel: mod.unitLabel||"units"};
  }
  var min = Infinity, max = -Infinity;
  (mod.options||[]).forEach(function(o){
    var mq = Number(mod.maxQty)||50;
    var dMin = optionDelta(o, base, 1);
    var dMax = optionDelta(o, base, o.kind==="unit"?mq:1);
    if(dMin<min) min=dMin;
    if(dMax>max) max=dMax;
  });
  if(min===Infinity) min=0;
  if(max===-Infinity) max=0;
  return {min:min, max:max};
}
/* spec: low = base + min modifiers, high = base + max modifiers, rounded to nearest 10 */
function round10(v){ return Math.round(v/10)*10; }
function serviceRange(svc){
  var base = Number(svc.basePrice)||0, lo = base, hi = base;
  (svc.modifiers||[]).forEach(function(m){
    var b = modifierBounds(m, base);
    lo += b.min; hi += b.max;
  });
  lo = round10(lo); hi = round10(hi);
  if(hi<lo) hi=lo;
  return {low:lo, high:hi};
}
/* answers: {modifierId:{optionId, qty}} or {modifierId:{qty}} for quantity type */
function estimateFor(svc, answers){
  var base = Number(svc.basePrice)||0, total = base, detail = [];
  (svc.modifiers||[]).forEach(function(m){
    var a = answers[m.id]; if(!a) return;
    if(m.type==="quantity"){
      var q = Math.max(0, Number(a.qty)||0);
      var d = (Number(m.perUnit)||0)*q;
      total += d;
      detail.push({question:m.question, answer:q+" "+(m.unitLabel||"units"), delta:d});
    }else{
      var opt = (m.options||[]).filter(function(o){return o.id===a.optionId;})[0];
      if(!opt) return;
      var d2 = optionDelta(opt, base, a.qty);
      total += d2;
      var ans = opt.label + (opt.kind==="unit" ? " × "+(a.qty||1) : "");
      detail.push({question:m.question, answer:ans, delta:d2});
    }
  });
  return {total: total, rounded: round10(total), detail: detail};
}
function money(v){
  return "$" + Math.round(v).toLocaleString("en-US");
}
function fmtRange(r){
  if(r.low===r.high) return "About "+money(r.low);
  return money(r.low)+" – "+money(r.high);
}
function deltaLabel(opt, base){
  var v = Number(opt.value)||0;
  if(opt.kind==="mult"){
    var pct = Math.round((v-1)*100);
    return pct===0 ? "included" : (pct>0?"+":"")+pct+"%";
  }
  if(opt.kind==="unit") return "+"+money(v)+"/unit";
  return v===0 ? "included" : "+"+money(v);
}

/* ---------- CSV ---------- */
function csvCell(v){
  v = String(v==null?"":v);
  return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
}
function leadsToCSV(leads, config){
  var head = ["created","name","phone","email","business","service","answers","low_price","high_price","estimate","status"];
  var rows = [head.join(",")];
  var svcName = function(id){
    if(!config) return id;
    var s = (config.services||[]).filter(function(x){return x.id===id;})[0];
    return s ? s.name : id;
  };
  leads.forEach(function(l){
    var ans = (l.answerDetail||[]).map(function(d){return d.question+": "+d.answer;}).join(" | ");
    rows.push([
      csvCell(l.createdAt), csvCell(l.name), csvCell(l.phone), csvCell(l.email),
      csvCell(l.businessName||""), csvCell(svcName(l.serviceId)), csvCell(ans),
      csvCell(l.lowPrice), csvCell(l.highPrice), csvCell(l.estimate), csvCell(l.status)
    ].join(","));
  });
  return rows.join("\r\n");
}
function download(filename, text, mime){
  var blob = new Blob([text], {type: mime||"text/csv;charset=utf-8"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

/* ---------- toast ---------- */
var toastTimer=null;
function toast(msg){
  var t = document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 3200);
}

/* ---------- sample config (editable starter, not fake data) ---------- */
function sampleConfig(){
  return {
    businessName:"GreenEdge Lawn Co.",
    email:"quotes@greenedge.example",
    phone:"(555) 013-4471",
    services:[{
      id:"svc-lawn", name:"Lawn mowing — weekly", basePrice:45, unit:"per visit",
      modifiers:[
        {id:"m-yard", type:"choice", question:"Yard size", options:[
          {id:"o1",label:"Up to 1/4 acre",kind:"add",value:0},
          {id:"o2",label:"1/4 to 1/2 acre",kind:"add",value:20},
          {id:"o3",label:"Over 1/2 acre",kind:"add",value:45}]},
        {id:"m-slope", type:"choice", question:"Hills or steep slopes?", options:[
          {id:"o1",label:"Flat yard",kind:"add",value:0},
          {id:"o2",label:"Some slopes",kind:"mult",value:1.15},
          {id:"o3",label:"Very steep",kind:"mult",value:1.3}]},
        {id:"m-extras", type:"choice", question:"Extra services", options:[
          {id:"o1",label:"Mow only",kind:"add",value:0},
          {id:"o2",label:"Mow + edge",kind:"add",value:10},
          {id:"o3",label:"Mow + edge + hedges",kind:"add",value:30}]},
        {id:"m-cleanup", type:"quantity", question:"One-time cleanup add-on", unitLabel:"cubic yards of debris", perUnit:25, min:0, max:8}
      ]
    }]
  };
}

window.QF = {
  CONFIG_KEY:CONFIG_KEY, LEADS_KEY:LEADS_KEY,
  uid:uid, esc:esc,
  loadConfig:loadConfig, saveConfig:saveConfig,
  loadLeads:loadLeads, saveLeads:saveLeads,
  encodeConfig:encodeConfig, decodeConfig:decodeConfig, validateConfig:validateConfig,
  validEmail:validEmail, validPhone:validPhone, normPhone:normPhone,
  optionDelta:optionDelta, modifierBounds:modifierBounds, round10:round10,
  serviceRange:serviceRange, estimateFor:estimateFor,
  money:money, fmtRange:fmtRange, deltaLabel:deltaLabel,
  leadsToCSV:leadsToCSV, download:download, toast:toast,
  sampleConfig:sampleConfig
};
})();
