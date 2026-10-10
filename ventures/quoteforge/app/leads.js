/* QuoteForge lead dashboard: statuses, filters, one-tap call/email, CSV export, mailto fallback. */
(function(){
"use strict";
var esc = QF.esc, toast = QF.toast;

var listEl = document.getElementById("leadList"),
    statsEl = document.getElementById("stats"),
    filterEl = document.getElementById("statusFilter"),
    searchEl = document.getElementById("searchBox");

var leads = QF.loadLeads();
var cfg = QF.loadConfig();

function fmtDate(iso){
  var d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
function statusBadge(s){
  return '<span class="badge status-'+esc(s)+'">'+esc(s)+'</span>';
}
function filtered(){
  var f = filterEl.value, q = searchEl.value.trim().toLowerCase();
  return leads.filter(function(l){
    if(f && l.status!==f) return false;
    if(q){
      var hay = (l.name+" "+l.phone+" "+l.email+" "+(l.serviceName||"")).toLowerCase();
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  });
}
function mailtoLead(l){
  var lines = [
    "QuoteForge lead — "+l.businessName,
    "",
    "Name: "+l.name, "Phone: "+l.phone, "Email: "+l.email,
    "Service: "+(l.serviceName||l.serviceId),
    "Range shown: "+QF.fmtRange({low:l.lowPrice,high:l.highPrice}),
    "Estimate: "+QF.money(l.estimate),
    "Status: "+l.status,
    "Answers:"
  ];
  (l.answerDetail||[]).forEach(function(d){ lines.push(" - "+d.question+": "+d.answer); });
  lines.push("", "Submitted: "+new Date(l.createdAt).toLocaleString());
  return "mailto:"+encodeURIComponent(l.email)+
    "?subject="+encodeURIComponent("Re: your quote from "+(l.businessName||"us"))+
    "&body="+encodeURIComponent("Hi "+l.name.split(" ")[0]+",\n\nThanks for getting a quote ("+QF.fmtRange({low:l.lowPrice,high:l.highPrice})+" for "+(l.serviceName||"your service")+").\n\nWhen works for a quick look at the job?\n\n— "+(l.businessName||""));
}
function render(){
  var rows = filtered();
  /* stats */
  var counts = {new:0, contacted:0, quoted:0, won:0};
  leads.forEach(function(l){ if(counts[l.status]==null) counts[l.status]=0; counts[l.status]++; });
  statsEl.innerHTML =
    '<span class="badge">'+leads.length+' total</span>'+
    '<span class="badge info">'+(counts.new||0)+' new</span>'+
    '<span class="badge">'+(counts.contacted||0)+' contacted</span>'+
    '<span class="badge">'+(counts.quoted||0)+' quoted</span>'+
    '<span class="badge ok">'+(counts.won||0)+' won</span>';

  if(!leads.length){
    listEl.innerHTML = '<div class="empty"><h3>No leads yet</h3>'+
      '<p>Share your quote link and every customer quote lands here automatically.<br>'+
      (cfg ? 'Your link is on the <a href="setup.html" style="color:var(--amber)">Setup page</a>.' : 'Start on the <a href="setup.html" style="color:var(--amber)">Setup page</a> to build your link first.')+'</p></div>';
    return;
  }
  if(!rows.length){
    listEl.innerHTML = '<div class="empty"><h3>No matches</h3><p>Try a different filter or search.</p></div>';
    return;
  }
  listEl.innerHTML = "";
  rows.forEach(function(l){
    var div = document.createElement("div");
    div.className = "lead";
    var answers = (l.answerDetail||[]).map(function(d){
      return "<div>• <strong>"+esc(d.question)+":</strong> "+esc(d.answer)+"</div>";
    }).join("");
    div.innerHTML =
      '<div class="top"><div><span class="name">'+esc(l.name)+'</span> '+statusBadge(l.status)+
      (l.possibleDuplicate?' <span class="badge warn">possible duplicate</span>':"")+'</div>'+
      '<div class="meta">'+esc(fmtDate(l.createdAt))+'</div></div>'+
      '<div class="meta">'+esc(l.serviceName||l.serviceId)+' · range <strong style="color:var(--amber)">'+esc(QF.fmtRange({low:l.lowPrice,high:l.highPrice}))+'</strong>'+
      ' · est. '+esc(QF.money(l.estimate))+'</div>'+
      (answers?'<div class="answers">'+answers+'</div>':"")+
      '<div class="actions">'+
      '<a class="btn ghost small" href="tel:'+esc(l.phone.replace(/[^\d+]/g,""))+'">📞 Call</a>'+
      '<a class="btn ghost small" href="'+mailtoLead(l)+'">✉️ Email</a>'+
      '<select data-status aria-label="Lead status">'+
        ["new","contacted","quoted","won"].map(function(s){
          return '<option value="'+s+'"'+(l.status===s?" selected":"")+'>'+s[0].toUpperCase()+s.slice(1)+'</option>';
        }).join("")+
      '</select>'+
      '<button class="icon-btn" data-del>Delete</button>'+
      "</div>";
    div.querySelector("[data-status]").onchange = function(e){
      l.status = e.target.value;
      var r = QF.saveLeads(leads);
      if(!r.ok){ toast("Couldn't save: "+r.error); } else { toast("Marked "+l.status+"."); render(); }
    };
    div.querySelector("[data-del]").onclick = function(){
      if(confirm("Delete lead from "+l.name+"?")){
        leads = leads.filter(function(x){return x.id!==l.id;});
        QF.saveLeads(leads); render();
      }
    };
    listEl.appendChild(div);
  });
}

document.getElementById("csvBtn").onclick = function(){
  if(!leads.length){ toast("No leads to export yet."); return; }
  QF.download("quoteforge-leads.csv", QF.leadsToCSV(leads, cfg));
  toast("CSV downloaded — "+leads.length+" lead(s).");
};
document.getElementById("emailLeads").onclick = function(){
  var to = (cfg&&cfg.email)||"";
  var lines = ["QuoteForge leads export — "+new Date().toLocaleString(),"",""];
  filtered().forEach(function(l){
    lines.push([l.createdAt,l.name,l.phone,l.email,l.serviceName||l.serviceId,
      QF.fmtRange({low:l.lowPrice,high:l.highPrice}),QF.money(l.estimate),l.status].join(" | "));
  });
  var href = "mailto:"+encodeURIComponent(to)+
    "?subject="+encodeURIComponent("QuoteForge leads export ("+filtered().length+")")+
    "&body="+encodeURIComponent(lines.join("\n"));
  if(!to) toast("Add your business email on the Setup page first — opening a blank email instead.");
  location.href = href;
};
filterEl.onchange = render;
searchEl.oninput = render;

render();
})();
