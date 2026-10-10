/* QuoteForge setup: service + modifier builder, live preview, share-link generation. */
(function(){
"use strict";
var esc = QF.esc, toast = QF.toast;

var cfg = QF.loadConfig();
if(!cfg){ cfg = {businessName:"", email:"", phone:"", services:[]}; }

var els = {
  bizName: document.getElementById("bizName"),
  bizPhone: document.getElementById("bizPhone"),
  bizEmail: document.getElementById("bizEmail"),
  svcList: document.getElementById("svcList"),
  svcEmptyHint: document.getElementById("svcEmptyHint"),
  preview: document.getElementById("preview"),
  shareUrl: document.getElementById("shareUrl"),
  copyLink: document.getElementById("copyLink"),
  openQuote: document.getElementById("openQuote"),
  shareHint: document.getElementById("shareHint")
};
els.bizName.value = cfg.businessName||"";
els.bizPhone.value = cfg.phone||"";
els.bizEmail.value = cfg.email||"";

function persist(){
  cfg.businessName = els.bizName.value.trim();
  cfg.phone = els.bizPhone.value.trim();
  cfg.email = els.bizEmail.value.trim();
  var r = QF.saveConfig(cfg);
  if(!r.ok) toast("Couldn't save: "+r.error);
  renderPreview(); renderShare();
}
function markInvalid(input, bad){
  var f = input.closest(".field");
  if(f) f.classList.toggle("invalid", !!bad);
}

/* ---------- services ---------- */
function newService(){
  return {id:QF.uid(), name:"", basePrice:0, unit:"per visit", modifiers:[], _open:true};
}
function newModifier(type){
  var m = {id:QF.uid(), type:type, question:""};
  if(type==="quantity"){ m.unitLabel="units"; m.perUnit=10; m.min=0; m.max=10; }
  else{
    m.options=[
      {id:QF.uid(), label:"Option A", kind:"add", value:0},
      {id:QF.uid(), label:"Option B", kind:"add", value:20}
    ];
  }
  return m;
}
function kindLabel(k){ return k==="mult"?"× multiplier":(k==="unit"?"$ per unit":"+$ fixed"); }

function renderServices(){
  els.svcList.innerHTML = "";
  els.svcEmptyHint.style.display = cfg.services.length? "none":"block";
  cfg.services.forEach(function(svc, si){
    var wrap = document.createElement("div");
    wrap.className = "svc"+(svc._open?" open":"");
    var head = document.createElement("div");
    head.className = "svc-head";
    head.innerHTML = '<div><div class="t">'+esc(svc.name||"Untitled service")+'</div>'+
      '<div class="s">'+esc(QF.money(Number(svc.basePrice)||0))+" "+esc(svc.unit||"")+" · "+svc.modifiers.length+" question"+(svc.modifiers.length===1?"":"s")+"</div></div>"+
      '<span style="color:var(--faint)">'+(svc._open?"▾":"▸")+"</span>";
    head.onclick = function(){ svc._open=!svc._open; renderServices(); };
    wrap.appendChild(head);

    var body = document.createElement("div");
    body.className = "svc-body";
    body.innerHTML =
      '<div class="row3">'+
      '<div class="field"><label class="f">Service name</label><input type="text" data-k="name" value="'+esc(svc.name)+'" placeholder="e.g. Deep house cleaning"></div>'+
      '<div class="field"><label class="f">Base price ($)</label><input type="number" data-k="basePrice" min="0" step="1" value="'+esc(svc.basePrice)+'"></div>'+
      '<div class="field"><label class="f">Unit label</label><input type="text" data-k="unit" value="'+esc(svc.unit)+'" placeholder="per visit, per job…"></div>'+
      "</div>"+
      '<p class="kicker" style="margin-top:6px">Modifier questions ('+svc.modifiers.length+' — aim for 3–5)</p>'+
      '<div data-mods></div>'+
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 16px">'+
      '<button class="add-link" data-addmod="choice">+ Choice question</button>'+
      '<button class="add-link" data-addmod="quantity">+ Quantity (per-unit) question</button>'+
      "</div>"+
      '<button class="btn danger small" data-delsvc>Delete service</button>';
    wrap.appendChild(body);
    els.svcList.appendChild(wrap);

    body.querySelectorAll("[data-k]").forEach(function(inp){
      inp.addEventListener("input", function(){
        var k = inp.getAttribute("data-k");
        svc[k] = (k==="basePrice") ? Math.max(0, Number(inp.value)||0) : inp.value;
        persist();
        head.querySelector(".t").textContent = svc.name||"Untitled service";
        head.querySelector(".s").textContent = QF.money(Number(svc.basePrice)||0)+" "+(svc.unit||"")+" · "+svc.modifiers.length+" questions";
      });
    });
    body.querySelector("[data-delsvc]").onclick = function(){
      if(confirm("Delete service \""+(svc.name||"untitled")+"\" and its questions?")){
        cfg.services.splice(si,1); persist(); renderServices();
      }
    };
    body.querySelectorAll("[data-addmod]").forEach(function(b){
      b.onclick = function(){
        if(svc.modifiers.length>=5){ toast("5 questions max per service keeps the customer flow snappy."); return; }
        svc.modifiers.push(newModifier(b.getAttribute("data-addmod")));
        persist(); renderServices();
      };
    });

    var modsEl = body.querySelector("[data-mods]");
    svc.modifiers.forEach(function(mod, mi){
      var mdiv = document.createElement("div");
      mdiv.className = "mod";
      var inner = '<div class="field" style="margin-bottom:10px"><label class="f">Question</label>'+
        '<input type="text" data-mq value="'+esc(mod.question)+'" placeholder="'+(mod.type==="quantity"?"e.g. How many square feet?":"e.g. Yard size")+'"></div>';

      if(mod.type==="quantity"){
        inner += '<div class="row3">'+
          '<div class="field"><label class="f">Unit label</label><input type="text" data-f="unitLabel" value="'+esc(mod.unitLabel||"")+'"></div>'+
          '<div class="field"><label class="f">$ per unit</label><input type="number" data-f="perUnit" min="0" step="0.5" value="'+esc(mod.perUnit)+'"></div>'+
          '<div class="field"><label class="f">Min – Max qty</label><div style="display:flex;gap:8px"><input type="number" data-f="min" min="0" step="1" value="'+esc(mod.min)+'"><input type="number" data-f="max" min="0" step="1" value="'+esc(mod.max)+'"></div></div>'+
          "</div>";
      }else{
        inner += '<div data-opts></div>'+
          '<div class="row2"><div class="field"><label class="f">Max quantity (for $/unit options)</label><input type="number" data-f="maxQty" min="1" step="1" value="'+esc(mod.maxQty||50)+'"></div></div>'+
          '<button class="add-link" data-addopt>+ Add option</button>';
      }
      inner += '<div style="margin-top:10px"><button class="icon-btn" data-delmod>Remove question</button></div>';
      mdiv.innerHTML = inner;
      modsEl.appendChild(mdiv);

      mdiv.querySelector("[data-mq]").addEventListener("input", function(e){ mod.question=e.target.value; persist(); });
      mdiv.querySelectorAll("[data-f]").forEach(function(inp){
        inp.addEventListener("input", function(){
          var f = inp.getAttribute("data-f");
          mod[f] = (f==="unitLabel") ? inp.value : Math.max(0, Number(inp.value)||0);
          persist();
        });
      });
      var del = mdiv.querySelector("[data-delmod]");
      if(del) del.onclick = function(){ svc.modifiers.splice(mi,1); persist(); renderServices(); };

      if(mod.type==="choice"){
        var optsEl = mdiv.querySelector("[data-opts]");
        mod.options.forEach(function(opt, oi){
          var row = document.createElement("div");
          row.className = "optrow";
          row.innerHTML =
            '<input type="text" data-ok="label" value="'+esc(opt.label)+'" placeholder="Option label" aria-label="Option label">'+
            '<select data-ok="kind" aria-label="Price effect type">'+
              '<option value="add"'+(opt.kind==="add"?" selected":"")+'>+$ fixed</option>'+
              '<option value="mult"'+(opt.kind==="mult"?" selected":"")+'>× multiplier</option>'+
              '<option value="unit"'+(opt.kind==="unit"?" selected":"")+'>$ per unit</option>'+
            "</select>"+
            '<input type="number" data-ok="value" step="any" value="'+esc(opt.value)+'" aria-label="Value" title="Fixed $ / multiplier like 1.2 / $ per unit">'+
            '<button class="icon-btn" data-delopt aria-label="Remove option">✕</button>';
          optsEl.appendChild(row);
          row.querySelectorAll("[data-ok]").forEach(function(inp){
            inp.addEventListener("input", function(){
              var k = inp.getAttribute("data-ok");
              opt[k] = (k==="label") ? inp.value : (k==="kind" ? inp.value : Number(inp.value)||0);
              persist();
            });
          });
          row.querySelector("[data-delopt]").onclick = function(){
            if(mod.options.length<=1){ toast("A question needs at least one option."); return; }
            mod.options.splice(oi,1); persist(); renderServices();
          };
        });
        mdiv.querySelector("[data-addopt]").onclick = function(){
          mod.options.push({id:QF.uid(), label:"", kind:"add", value:0});
          persist(); renderServices();
        };
      }
    });
  });
}

/* ---------- live preview ---------- */
function renderPreview(){
  var el = els.preview;
  var v = QF.validateConfig(cfg);
  if(!v.ok){
    el.innerHTML = '<p class="hint">Add a service with a name and base price to see the customer preview.</p>';
    return;
  }
  var html = "";
  cfg.services.slice(0,3).forEach(function(svc){
    var r = QF.serviceRange(svc);
    html += '<div class="panel tight"><div style="font-weight:700">'+esc(svc.name)+'</div>'+
      '<div class="hint">Base '+esc(QF.money(Number(svc.basePrice)||0))+" "+esc(svc.unit||"")+" · "+svc.modifiers.length+" questions</div>"+
      '<div class="range-hero" style="margin:12px 0 4px;padding:16px"><div class="nums" style="font-size:1.8rem">'+esc(QF.fmtRange(r))+'</div>'+
      '<div class="per">'+esc(svc.unit||"")+' · rounded to nearest $10</div></div></div>';
  });
  if(cfg.services.length>3) html += '<p class="hint">+ '+(cfg.services.length-3)+' more service(s)</p>';
  el.innerHTML = html;
}

/* ---------- share link ---------- */
function shareURL(){
  var v = QF.validateConfig(cfg);
  if(!v.ok) return null;
  var base = location.href.split("#")[0].replace(/setup\.html.*$/,"");
  return base + "quote.html#c=" + QF.encodeConfig(cfg);
}
function renderShare(){
  var url = shareURL();
  if(url){
    els.shareUrl.value = url;
    els.copyLink.disabled = false; els.openQuote.disabled = false;
    els.shareHint.textContent = "Link updates automatically as you edit. Length ~"+url.length+" chars — fine for texting.";
  }else{
    els.shareUrl.value = "";
    els.copyLink.disabled = true; els.openQuote.disabled = true;
    els.shareHint.textContent = "Add at least one service with a name and base price to generate your link.";
  }
}

document.getElementById("addService").onclick = function(){
  cfg.services.push(newService()); persist(); renderServices();
};
document.getElementById("loadSample").onclick = function(){
  if(cfg.services.length && !confirm("Replace your current setup with the editable landscaping sample?")) return;
  var s = QF.sampleConfig();
  cfg.services = s.services;
  if(!cfg.businessName) cfg.businessName = s.businessName;
  if(!cfg.email) cfg.email = s.email;
  if(!cfg.phone) cfg.phone = s.phone;
  els.bizName.value=cfg.businessName; els.bizEmail.value=cfg.email; els.bizPhone.value=cfg.phone;
  persist(); renderServices();
  toast("Sample loaded — edit everything, it's yours.");
};
els.copyLink.onclick = function(){
  var url = els.shareUrl.value; if(!url) return;
  els.shareUrl.select();
  function done(){ toast("Link copied — text it to a customer."); }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done, function(){ document.execCommand("copy"); done(); });
  }else{ document.execCommand("copy"); done(); }
};
els.openQuote.onclick = function(){
  var url = els.shareUrl.value; if(url) location.href = url;
};
[els.bizName, els.bizPhone, els.bizEmail].forEach(function(inp){
  inp.addEventListener("input", function(){
    var bad = (inp===els.bizName && !inp.value.trim()) ||
              (inp===els.bizPhone && inp.value.trim() && !QF.validPhone(inp.value)) ||
              (inp===els.bizEmail && inp.value.trim() && !QF.validEmail(inp.value));
    markInvalid(inp, bad);
    persist();
  });
  inp.addEventListener("blur", function(){
    var bad = (inp===els.bizName && !inp.value.trim()) ||
              (inp===els.bizPhone && inp.value.trim() && !QF.validPhone(inp.value)) ||
              (inp===els.bizEmail && inp.value.trim() && !QF.validEmail(inp.value));
    markInvalid(inp, bad);
  });
});

renderServices(); renderPreview(); renderShare();
})();
