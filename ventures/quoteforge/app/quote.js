/* QuoteForge customer flow: service → questions → contact → instant range result. */
(function(){
"use strict";
var esc = QF.esc, toast = QF.toast;
var main = document.getElementById("main");

var decoded = QF.decodeConfig(location.hash);
if(!decoded.ok){
  var msg = "This quote link is missing or broken, so we can't load the price setup.";
  if(decoded.error==="empty") msg = decoded.message || msg;
  if(decoded.error==="invalid") msg = decoded.message || msg;
  main.innerHTML =
    '<div class="error-hero"><div class="big">🧰</div>'+
    "<h2>That quote link didn't work</h2>"+
    "<p>"+esc(msg)+" The business may have changed their link — try asking them for a fresh one, or set up your own in about ten minutes.</p>"+
    '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">'+
    '<a class="btn" href="setup.html">Set up my own quote link</a>'+
    '<a class="btn ghost" href="../index.html">Back to QuoteForge</a>'+
    "</div></div>";
  return;
}
var cfg = decoded.config;
var biz = cfg.businessName || "This business";

var state = { step:0, serviceId:null, answers:{} };
function svc(){ return cfg.services.filter(function(s){return s.id===state.serviceId;})[0]; }
function steps(){
  var s = svc();
  var n = s ? s.modifiers.length : 0;
  return ["service"].concat(s?Array.apply(null,{length:n}).map(function(_,i){return "q"+i;}):[]).concat(["contact","result"]);
}
function progressBar(cur, total, label){
  return '<p class="step-meta">'+esc(label)+'</p>'+
    '<div class="progress" role="progressbar" aria-valuenow="'+cur+'" aria-valuemax="'+total+'"><i style="width:'+Math.round(cur/total*100)+'%"></i></div>';
}

/* ---------- step: pick service ---------- */
function renderServiceStep(){
  state.stepName = "service";
  var cards = cfg.services.map(function(s){
    var r = QF.serviceRange(s);
    return '<div class="opt" data-svc="'+esc(s.id)+'" role="button" tabindex="0">'+
      '<span class="radio"></span>'+
      '<span class="lbl"><strong>'+esc(s.name)+'</strong><br><span class="hint">Base '+esc(QF.money(Number(s.basePrice)||0))+" "+esc(s.unit||"")+"</span></span>"+
      '<span class="delta">'+esc(QF.fmtRange(r))+"</span></div>";
  }).join("");
  main.innerHTML =
    '<h1 class="page-title">'+esc(biz)+'</h1>'+
    '<p class="page-sub">Pick a service, answer '+cfg.services[0].modifiers.length+' quick question(s), and get an honest price range instantly. No account, no app.</p>'+
    progressBar(1, steps().length+1, "Step 1 — choose a service")+
    '<div class="opt-list">'+cards+"</div>";
  main.querySelectorAll("[data-svc]").forEach(function(el){
    function pick(){
      state.serviceId = el.getAttribute("data-svc");
      state.answers = {};
      renderQuestionStep(0);
    }
    el.onclick = pick;
    el.onkeydown = function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(); } };
  });
}

/* ---------- step: questions ---------- */
function renderQuestionStep(qi){
  var s = svc();
  var mod = s.modifiers[qi];
  state.stepName = "q"+qi;
  var total = s.modifiers.length + 3; /* service + questions + contact + result */
  var body = "";
  if(mod.type==="quantity"){
    body = '<div class="field"><label class="f" for="qtyIn">How many '+(esc(mod.unitLabel||"units"))+'?</label>'+
      '<input type="number" id="qtyIn" min="'+esc(mod.min)+'" max="'+esc(mod.max)+'" step="1" value="'+esc(state.answers[mod.id]?state.answers[mod.id].qty:(mod.min||0))+'">'+
      '<p class="hint">Between '+esc(mod.min)+' and '+esc(mod.max)+' '+esc(mod.unitLabel||"units")+' · '+esc(QF.money(Number(mod.perUnit)||0))+' each.</p>'+
      '<div class="err">Enter a number between '+esc(mod.min)+' and '+esc(mod.max)+'.</div></div>';
  }else{
    var base = Number(s.basePrice)||0;
    var opts = mod.options.map(function(o){
      var sel = state.answers[mod.id] && state.answers[mod.id].optionId===o.id;
      var extra = (sel && o.kind==="unit") ?
        '<input type="number" data-unitqty min="1" max="'+esc(mod.maxQty||50)+'" value="'+esc(state.answers[mod.id].qty||1)+'" style="width:110px;margin-top:8px" aria-label="Quantity">' : "";
      return '<div class="opt'+(sel?" sel":"")+'" data-opt="'+esc(o.id)+'" role="button" tabindex="0">'+
        '<span class="radio"></span><span class="lbl"><strong>'+esc(o.label)+"</strong>"+extra+'</span>'+
        '<span class="delta">'+esc(QF.deltaLabel(o, base))+"</span></div>";
    }).join("");
    var needsUnit = mod.options.some(function(o){return o.kind==="unit";});
    body = '<div class="opt-list">'+opts+"</div>"+
      (needsUnit ? '<p class="hint">If you pick a "$ per unit" option, enter the quantity under it.</p>' : "")+
      '<p class="hint" id="pickErr" style="display:none;color:var(--bad)">Please pick an option to continue.</p>';
  }
  main.innerHTML =
    '<h1 class="page-title" style="font-size:1.6rem">'+esc(s.name)+'</h1>'+
    progressBar(2+qi, total, "Question "+(qi+1)+" of "+s.modifiers.length)+
    '<div class="card"><h3 style="margin-bottom:6px">'+esc(mod.question||"Question")+"</h3>"+body+"</div>"+
    '<div class="btn-row no-print" style="display:flex;gap:12px;flex-wrap:wrap">'+
    '<button class="btn ghost" id="backBtn">← Back</button>'+
    '<button class="btn" id="nextBtn" style="flex:1">'+(qi===s.modifiers.length-1?"Continue →":"Next →")+"</button></div>";

  if(mod.type==="choice"){
    main.querySelectorAll("[data-opt]").forEach(function(el){
      function pick(){
        main.querySelectorAll("[data-opt]").forEach(function(x){x.classList.remove("sel");});
        el.classList.add("sel");
        var optId = el.getAttribute("data-opt");
        var opt = mod.options.filter(function(o){return o.id===optId;})[0];
        state.answers[mod.id] = {optionId:optId, qty:1};
        var pe = document.getElementById("pickErr"); if(pe) pe.style.display="none";
        /* if unit option, inject qty input */
        var lbl = el.querySelector(".lbl");
        if(opt.kind==="unit" && !lbl.querySelector("[data-unitqty]")){
          var q = document.createElement("input");
          q.type="number"; q.min="1"; q.max=String(mod.maxQty||50); q.value="1";
          q.setAttribute("data-unitqty",""); q.style.cssText="width:110px;margin-top:8px"; q.setAttribute("aria-label","Quantity");
          q.onclick=function(e){e.stopPropagation();};
          q.oninput=function(){ state.answers[mod.id].qty = Math.max(1, Number(q.value)||1); };
          lbl.appendChild(q);
        }else if(opt.kind!=="unit"){
          var old = lbl.querySelector("[data-unitqty]"); if(old) old.remove();
        }
      }
      el.onclick = pick;
      el.onkeydown = function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(); } };
    });
  }

  document.getElementById("backBtn").onclick = function(){
    if(qi===0) renderServiceStep(); else renderQuestionStep(qi-1);
  };
  document.getElementById("nextBtn").onclick = function(){
    if(mod.type==="quantity"){
      var inp = document.getElementById("qtyIn");
      var q = Number(inp.value);
      var bad = !isFinite(q) || q < Number(mod.min) || q > Number(mod.max);
      inp.closest(".field").classList.toggle("invalid", bad);
      if(bad) return;
      state.answers[mod.id] = {qty:q};
    }else{
      if(!state.answers[mod.id] || !state.answers[mod.id].optionId){
        var pe = document.getElementById("pickErr"); if(pe) pe.style.display="block";
        return;
      }
    }
    if(qi < s.modifiers.length-1) renderQuestionStep(qi+1);
    else renderContactStep();
  };
}

/* ---------- step: contact ---------- */
function renderContactStep(){
  var s = svc();
  state.stepName = "contact";
  var total = s.modifiers.length + 3;
  main.innerHTML =
    '<h1 class="page-title" style="font-size:1.6rem">Where should we send it?</h1>'+
    progressBar(2+s.modifiers.length, total, "Last step — your contact info")+
    '<div class="card">'+
    '<p class="page-sub" style="margin-bottom:18px">Your instant range appears right after this. '+esc(biz)+' only uses this to follow up on your quote — no spam, no selling your info.</p>'+
    '<div class="field"><label class="f" for="cName">Full name</label><input type="text" id="cName" autocomplete="name" placeholder="Jane Doe"><div class="err">Please enter your name.</div></div>'+
    '<div class="row2"><div class="field"><label class="f" for="cPhone">Phone</label><input type="tel" id="cPhone" autocomplete="tel" placeholder="(555) 123-4567"><div class="err">Enter a valid phone number (7–15 digits).</div></div>'+
    '<div class="field"><label class="f" for="cEmail">Email</label><input type="email" id="cEmail" autocomplete="email" placeholder="jane@email.com"><div class="err">Enter a valid email address.</div></div></div>'+
    "</div>"+
    '<div class="btn-row no-print" style="display:flex;gap:12px;flex-wrap:wrap">'+
    '<button class="btn ghost" id="backBtn">← Back</button>'+
    '<button class="btn" id="seeBtn" style="flex:1">See my price range →</button></div>';

  document.getElementById("backBtn").onclick = function(){ renderQuestionStep(s.modifiers.length-1); };
  document.getElementById("seeBtn").onclick = function(){
    var name = document.getElementById("cName"),
        phone = document.getElementById("cPhone"),
        email = document.getElementById("cEmail");
    var ok = true;
    function check(el, valid){ el.closest(".field").classList.toggle("invalid", !valid); if(!valid) ok=false; }
    check(name, name.value.trim().length>=2);
    check(phone, QF.validPhone(phone.value));
    check(email, QF.validEmail(email.value));
    if(!ok){ toast("Please fix the highlighted fields."); return; }
    submitLead(s, name.value.trim(), phone.value.trim(), email.value.trim());
  };
}

/* ---------- submit + result ---------- */
function submitLead(s, name, phone, email){
  var range = QF.serviceRange(s);
  var est = QF.estimateFor(s, state.answers);
  var lead = {
    id: QF.uid(),
    name:name, phone:phone, email:email,
    businessName: biz,
    serviceId: s.id, serviceName: s.name,
    answers: state.answers, answerDetail: est.detail,
    lowPrice: range.low, highPrice: range.high, estimate: est.rounded,
    status:"new",
    createdAt: new Date().toISOString()
  };
  var leads = QF.loadLeads();
  /* duplicate flag: same phone + service within 24h */
  var dup = leads.some(function(l){
    return QF.normPhone(l.phone)===QF.normPhone(phone) && l.serviceId===s.id &&
      (Date.now()-new Date(l.createdAt).getTime()) < 24*3600*1000;
  });
  lead.possibleDuplicate = !!dup;
  var toSave = Object.assign({}, lead);
  delete toSave._mailto;
  leads.unshift(toSave);
  var r = QF.saveLeads(leads);
  if(!r.ok) toast("Saved your quote, but couldn't store the lead: "+r.error);
  /* mailto bridge: lead lands in contractor inbox via customer's email app (not stored) */
  lead._mailto = buildMailto(s, lead);
  renderResult(s, lead);
}
function buildMailto(s, lead){
  if(!cfg.email) return null;
  var lines = [
    "New QuoteForge lead for "+biz,
    "",
    "Name: "+lead.name,
    "Phone: "+lead.phone,
    "Email: "+lead.email,
    "Service: "+s.name,
    "Price range shown: "+QF.fmtRange({low:lead.lowPrice, high:lead.highPrice})+" "+(s.unit||""),
    "Estimate from answers: "+QF.money(lead.estimate),
    "Answers:"
  ];
  lead.answerDetail.forEach(function(d){ lines.push(" - "+d.question+": "+d.answer); });
  lines.push("", "Submitted: "+new Date(lead.createdAt).toLocaleString());
  return "mailto:"+encodeURIComponent(cfg.email)+
    "?subject="+encodeURIComponent("New quote lead: "+lead.name+" — "+s.name)+
    "&body="+encodeURIComponent(lines.join("\n"));
}
function renderResult(s, lead){
  state.stepName = "result";
  var range = {low:lead.lowPrice, high:lead.highPrice};
  var span = range.high - range.low;
  var pos = span>0 ? Math.min(100, Math.max(0, (lead.estimate-range.low)/span*100)) : 50;
  var detail = lead.answerDetail.map(function(d){
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:.92rem">'+
      '<span style="color:var(--muted)">'+esc(d.question)+"<br><strong style='color:var(--ink)'>"+esc(d.answer)+"</strong></span></div>";
  }).join("");
  main.innerHTML =
    '<p class="kicker" style="margin-top:34px">Your instant quote · '+esc(biz)+'</p>'+
    '<h1 class="page-title" style="margin-top:0">Here\'s your honest range</h1>'+
    '<div class="range-hero"><div class="nums">'+esc(QF.fmtRange(range))+'</div>'+
    '<div class="per">'+esc(s.unit||"")+' · rounded to the nearest $10</div></div>'+
    '<div class="range-bar" aria-hidden="true"><div class="fill" style="left:0;right:0"></div><div class="marker" style="left:'+pos+'%"></div></div>'+
    '<div class="range-ends"><span>'+esc(QF.money(range.low))+'</span><span>'+esc(QF.money(range.high))+'</span></div>'+
    '<p class="est-note">Based on your answers, most similar jobs land around <strong style="color:var(--amber)">'+esc(QF.money(lead.estimate))+'</strong> — marked on the bar. '+
    'The final price is confirmed when '+esc(biz)+' sees the job. Ranges are rounded to the nearest 10 on purpose: a range you can stand behind beats a fake-precise number.</p>'+
    (lead.possibleDuplicate ? '<p style="margin-top:10px"><span class="badge warn">Possible duplicate</span> <span class="hint">A quote for this number + service was already submitted in the last 24 hours.</span></p>' : "")+
    '<div class="card" style="margin-top:22px" id="summary"><p class="kicker">Quote summary</p>'+detail+
    '<p class="hint" style="margin-top:10px">Quoted to '+esc(lead.name)+' · '+esc(new Date(lead.createdAt).toLocaleString())+'</p></div>'+
    '<p class="est-note">'+esc(biz)+" will follow up shortly"+(cfg.phone?" at "+esc(cfg.phone):"")+". Thanks, "+esc(lead.name.split(" ")[0])+"!</p>"+
    '<div class="btn-row no-print" style="display:flex;gap:12px;flex-wrap:wrap;margin:22px 0">'+
    (lead._mailto?'<a class="btn ghost" href="'+lead._mailto+'">Email this lead to '+esc(biz)+'</a>':"")+
    '<button class="btn ghost" id="printBtn">Print / save quote</button>'+
    '<button class="btn" id="againBtn">Get another quote</button></div>'+
    '<p class="hint">Powered by <a href="../index.html" style="color:var(--amber)">QuoteForge</a> — quote jobs while you sleep.</p>';

  document.getElementById("printBtn").onclick = function(){ window.print(); };
  document.getElementById("againBtn").onclick = function(){ state.answers={}; state.serviceId=null; renderServiceStep(); window.scrollTo(0,0); };
  window.scrollTo(0,0);
}

renderServiceStep();
})();
