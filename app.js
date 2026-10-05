(function(){
/* ---------- Supabase connection (the anon key is public by design; row level security protects the data) ---------- */
const CFG={
  url:'https://ivfsyoytfgelarfcunun.supabase.co',
  key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2ZnN5b3l0ZmdlbGFyZmN1bnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExOTg4MzksImV4cCI6MjEwNjc3NDgzOX0.X5WyHqnYuKyvpVAK6aMwhimHLBnq4VLe120WivGzDGw'
};
const sb=window.supabase&&window.supabase.createClient?window.supabase.createClient(CFG.url,CFG.key):null;

const IC={
 home:'<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
 income:'<path d="M12 19V5M5 12l7-7 7 7"/>',
 expenses:'<path d="M12 5v14M5 12l7 7 7-7"/>',
 record:'<path d="M12 5v14M5 12h14"/>',
 more:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 categories:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
 goals:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
 history:'<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6"/>',
 settings:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>'
};
const NAV=[['home','Dashboard'],['record','Record today'],['income','Daily income'],['expenses','Daily expenses'],['categories','Categories'],['goals','Goals'],['history','History & reports'],['settings','Profile & settings']];
const CURRENCIES=['₹','$','€','£','৳','Rs','KSh','₦'];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uuid(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
const D=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
const today=()=>D(new Date());
const dt=s=>new Date(s+'T00:00');
const addDays=(s,n)=>{const x=dt(s);x.setDate(x.getDate()+n);return D(x)};
const weekStart=s=>addDays(s,-((dt(s).getDay()+6)%7));
const monthStart=s=>s.slice(0,8)+'01';
const nice=s=>dt(s).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
const niceLong=s=>s===today()?'Today':s===addDays(today(),-1)?'Yesterday':dt(s).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});

/* ---------- state: an in-memory copy of the signed-in owner's shop ---------- */
const empty=()=>({sample:false,user:null,account:null,shop:null,cats:{income:[],expense:[]},tx:[],goals:[]});
let S=empty();
function sample(){
  const s=empty();s.sample=true;s.account={name:'Asha',email:'asha@example.com'};
  s.shop={id:uuid(),name:'Asha General Store',type:'Grocery / Kirana',currency:'₹'};
  s.cats.income=['Product Sales','Services','Online Orders','Other'].map(n=>({id:uuid(),name:n}));
  s.cats.expense=['Stock','Rent','Utilities','Staff','Transport','Marketing','Repairs','Other'].map(n=>({id:uuid(),name:n}));
  let seed=11;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const I=s.cats.income,E=s.cats.expense,t=today();
  const add=(type,date,amount,cat,note)=>s.tx.push({id:uuid(),type,date,amount:Math.round(amount/10)*10,catId:cat.id,note:note||''});
  for(let i=44;i>=0;i--){const d=addDays(t,-i),x=dt(d),dow=x.getDay(),dom=x.getDate();
    const f=dow===0?.55:dow===6?1.35:1;
    add('income',d,(2800+r()*2600)*f*(1+(44-i)/300),I[0],'Counter sales');
    if(r()>.55)add('income',d,400+r()*900,I[2],'Phone and WhatsApp orders');
    if(r()>.8)add('income',d,150+r()*400,I[1],'Home delivery charges');
    if(i%3===0)add('expense',d,1500+r()*2200,E[0],'Wholesaler restock');
    if(dom===1)add('expense',d,12000,E[1],'Shop rent');
    if(dom===5)add('expense',d,1850,E[2],'Electricity bill');
    if(dow===6)add('expense',d,3000,E[3],'Helper weekly wages');
    if(r()>.7)add('expense',d,120+r()*300,E[4],'Auto for delivery');
  }
  s.goals=[{id:uuid(),name:'Monthly sales',measure:'income',period:'month',target:150000},
           {id:uuid(),name:'Weekly take-home',measure:'net',period:'week',target:18000},
           {id:uuid(),name:'Keep transport low',measure:'expense',period:'month',target:3000}];
  return s}

/* ---------- database access ---------- */
// Runs a write against Supabase. The sample shop never touches the database.
async function run(q){if(S.sample)return;const{error}=await q();if(error)throw error}
async function get(q){const{data,error}=await q;if(error)throw error;return data}
const toRow=x=>({id:x.id,shop_id:S.shop.id,kind:x.type,category_id:x.catId,amount:x.amount,note:x.note,entry_date:x.date});
async function loadCats(){const rows=await get(sb.from('categories').select('id,kind,name').eq('shop_id',S.shop.id).order('created_at').order('name'));
  S.cats={income:[],expense:[]};rows.forEach(c=>S.cats[c.kind].push({id:c.id,name:c.name}))}
async function loadAll(user){
  const prof=await get(sb.from('profiles').select('full_name').eq('id',user.id).maybeSingle());
  const shop=await get(sb.from('shops').select('id,name,shop_type,currency').maybeSingle());
  const s=empty();s.user=user;s.account={name:(prof&&prof.full_name)||user.email.split('@')[0],email:user.email};S=s;
  if(!shop)return;
  S.shop={id:shop.id,name:shop.name,type:shop.shop_type,currency:shop.currency};
  await loadCats();
  S.goals=(await get(sb.from('goals').select('id,name,measure,period,target').eq('shop_id',shop.id).order('created_at'))).map(g=>({id:g.id,name:g.name,measure:g.measure,period:g.period,target:+g.target}));
  for(let from=0;;from+=1000){ // the API returns at most 1000 rows per request
    const rows=await get(sb.from('entries').select('id,kind,category_id,amount,note,entry_date').eq('shop_id',shop.id).order('entry_date').order('created_at').range(from,from+999));
    rows.forEach(e=>S.tx.push({id:e.id,type:e.kind,amount:+e.amount,catId:e.category_id,note:e.note,date:e.entry_date}));
    if(rows.length<1000)break}
}
async function insertEntries(rows){await run(()=>sb.from('entries').insert(rows.map(toRow)));S.tx.push(...rows)}
async function removeEntries(ids){await run(()=>sb.from('entries').delete().in('id',ids));S.tx=S.tx.filter(x=>!ids.includes(x.id))}
function friendly(e){const m=(e&&e.message)||String(e);
  if(/Invalid login credentials/i.test(m))return'Wrong email or password.';
  if(/Email not confirmed/i.test(m))return'Confirm your email first. Open the link we sent to your inbox, then log in.';
  if(/already registered/i.test(m))return'An account with this email already exists. Log in instead.';
  if(/rate limit/i.test(m))return'Too many attempts. Wait a few minutes and try again.';
  if(e&&e.code==='23505')return'That name is already used.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return'Could not reach the server. Check your internet connection.';
  return m}

/* ---------- money + stats ---------- */
const sym=()=>S.shop&&S.shop.currency||'₹';
function fmt(n){const a=Math.abs(n);return(n<0?'−':'')+sym()+a.toLocaleString('en-IN',{maximumFractionDigits:a%1?2:0})}
function short(n){return n>=100000?(n/100000).toFixed(n%100000?1:0)+'L':n>=1000?(n/1000).toFixed(n%1000?1:0)+'k':String(n)}
const sum=(type,a,b)=>S.tx.reduce((t,x)=>x.type===type&&x.date>=a&&x.date<=b?t+x.amount:t,0);
const catName=(type,id)=>{const c=S.cats[type].find(c=>c.id===id);return c?c.name:'Uncategorised'};
function byCat(type,a,b){const m={};S.tx.forEach(x=>{if(x.type===type&&x.date>=a&&x.date<=b)m[x.catId]=(m[x.catId]||0)+x.amount});
  return Object.keys(m).map(id=>({name:catName(type,id),total:m[id]})).sort((p,q)=>q.total-p.total)}
function delta(now,prev){if(!prev)return'';const p=Math.round((now-prev)/prev*100);
  return `<span class="pill ${p>0?'up':p<0?'down':'flat'}">${p>0?'▲':p<0?'▼':'•'} ${Math.abs(p)}%</span>`}
function goalProgress(g){const t=today(),a=g.period==='week'?weekStart(t):monthStart(t);
  const inc=sum('income',a,t),exp=sum('expense',a,t);
  const v=g.measure==='income'?inc:g.measure==='expense'?exp:inc-exp;
  return{v,pct:g.target?Math.max(0,Math.round(v/g.target*100)):0}}
const MEASURE={income:'Income',net:'Net earnings',expense:'Expense limit'};

/* ---------- ui state ---------- */
let route='home',booting=true,bootError='',authMode='login',authMsg='',range=7,toastT=null,undoFn=null,catEdit=null,goalEdit=null,csv=false,askKey=null,askT=null,busy=false;
let theme='system';try{theme=localStorage.getItem('galla.theme')||'system'}catch(e){}
const blank=()=>({amount:'',cat:null,note:'',date:today(),editId:null});
const blankGoal=()=>({name:'',measure:'income',period:'month',target:''});
let F={auth:{name:'',email:''},income:blank(),expense:blank(),rec:{note:'',date:today()},hist:{period:'month',type:'all'},goal:blankGoal()};
function toast(msg,undo){const el=document.getElementById('toast');undoFn=undo||null;
  el.innerHTML=esc(msg)+(undo?' <button data-act="undo">Undo</button>':'');el.hidden=false;
  clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;undoFn=null},undo?6000:3200)}
function go(r){route=r;askKey=null;try{history.replaceState(null,'','#'+r)}catch(e){}render();window.scrollTo(0,0)}
function applyTheme(){const r=document.documentElement;if(theme==='light'||theme==='dark')r.dataset.theme=theme;else delete r.dataset.theme}

/* ---------- pieces ---------- */
function entry(type,title){const f=F[type],cats=S.cats[type];
  if(!cats.find(c=>c.id===f.cat))f.cat=cats[0]?cats[0].id:null;
  return `<section class="entry ${type} stack"><h2>${title}</h2>
   <div class="amt"><span>${esc(sym())}</span><input id="amt-${type}" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="${title} amount" value="${esc(f.amount)}" data-f="${type}.amount"></div>
   <div class="chips" role="group" aria-label="${title} category">${cats.map(c=>`<button type="button" class="chip ${c.id===f.cat?'on':''}" aria-pressed="${c.id===f.cat}" data-act="pick" data-type="${type}" data-id="${c.id}">${esc(c.name)}</button>`).join('')||'<span class="empty">Add a category first.</span>'}</div></section>`}
function txRow(x,showDate){return `<li class="tx"><div class="m"><b>${esc(catName(x.type,x.catId))}</b><small>${esc([showDate?nice(x.date):'',x.note].filter(Boolean).join(' · '))||'&nbsp;'}</small></div>
  <span class="a ${x.type==='income'?'pos':'neg'}">${x.type==='income'?'+':'−'}${fmt(x.amount)}</span>
  <button class="btn small" data-act="edit" data-id="${x.id}">Edit</button><button class="btn small danger" data-act="del" data-id="${x.id}" aria-label="Delete entry">Delete</button></li>`}
// Two-tap delete for things that cannot be undone.
function askBtn(key,act,attrs,label,cls){return askKey===key?`<button class="btn ${cls||''} danger" data-act="${act}" ${attrs}>Tap again to confirm</button>`:`<button class="btn ${cls||''} danger" data-act="ask" data-key="${key}">${label}</button>`}
const head=(t,sub)=>`<header><h1>${t}</h1>${sub?`<p class="muted">${sub}</p>`:''}</header>`;
const field=(id,label,html)=>`<div class="field"><label for="${id}">${label}</label>${html}</div>`;

/* ---------- views ---------- */
const V={};
V.loading=()=>`<div class="auth stack"><div class="brand">Galla</div>${bootError?`<p class="neg">${esc(bootError)}</p><button class="btn" data-act="reload" style="align-self:flex-start">Try again</button>`:'<p class="muted">Opening your shop…</p>'}</div>`;

V.auth=()=>{const su=authMode==='signup';return `<div class="auth stack">
  <div><div class="brand">Galla</div><p class="muted">Your shop's daily income and expenses, in two minutes a day.</p></div>
  <div class="seg" style="align-self:flex-start"><button class="${su?'':'on'}" data-act="authmode" data-v="login">Log in</button><button class="${su?'on':''}" data-act="authmode" data-v="signup">Sign up</button></div>
  <form class="card stack" data-form="auth">
   ${su?field('au-name','Your name',`<input type="text" id="au-name" required autocomplete="name" value="${esc(F.auth.name)}" data-f="auth.name">`):''}
   ${field('au-email','Email',`<input type="email" id="au-email" required autocomplete="email" value="${esc(F.auth.email)}" data-f="auth.email">`)}
   ${field('au-pass','Password'+(su?' (at least 6 characters)':''),'<input type="password" id="au-pass" required minlength="6" autocomplete="'+(su?'new-password':'current-password')+'">')}
   ${authMsg?`<p class="notice" role="alert">${esc(authMsg)}</p>`:''}
   <button class="btn primary big">${su?'Create account':'Log in'}</button>
  </form>
  <button class="link" data-act="sample" style="align-self:flex-start">Look around with a sample shop</button></div>`};

V.setup=()=>`<div class="auth stack">${head('Set up your shop','Three quick details. You can change them later.')}
  <form class="card stack" data-form="setup">
   ${field('sh-name','Shop name','<input type="text" id="sh-name" required maxlength="80" placeholder="e.g. Sharma Kirana Store">')}
   ${field('sh-type','Type of shop','<select id="sh-type">'+['Grocery / Kirana','Clothing','Food & tea stall','Mobile & electronics','Salon','Pharmacy','Other'].map(o=>'<option>'+esc(o)+'</option>').join('')+'</select>')}
   ${field('sh-cur','Currency','<select id="sh-cur">'+CURRENCIES.map(o=>'<option>'+o+'</option>').join('')+'</select>')}
   ${field('sh-goal','Monthly sales goal (optional)','<input type="text" inputmode="decimal" id="sh-goal" placeholder="e.g. 100000">')}
   <button class="btn primary big">Open my shop</button></form>
  <button class="link" data-act="logout" style="align-self:flex-start">Log out</button></div>`;

V.home=()=>{const t=today(),ws=weekStart(t),ms=monthStart(t);
  const ti=sum('income',t,t),te=sum('expense',t,t);
  const span=(dt(t)-dt(ws))/864e5,pws=addDays(ws,-7),pwe=addDays(pws,span);
  const pm=new Date(dt(ms));pm.setMonth(pm.getMonth()-1);const pms=D(pm),pmeD=new Date(pm);pmeD.setDate(Math.min(dt(t).getDate(),new Date(pm.getFullYear(),pm.getMonth()+1,0).getDate()));const pme=D(pmeD);
  const per=(label,a,b,pa,pb)=>{const i=sum('income',a,b),e=sum('expense',a,b),pi=sum('income',pa,pb),pe=sum('expense',pa,pb);
    return `<div class="card stat stack"><div class="row between"><span class="label">${label} net</span>${delta(i-e,pi-pe)}</div>
     <span class="num ${i-e<0?'neg':''}">${fmt(i-e)}</span>
     <div class="mini"><span>Income</span><b>${fmt(i)}</b></div><div class="mini"><span>Expenses</span><b>${fmt(e)}</b></div></div>`};
  const days={};S.tx.forEach(x=>{if(x.type==='income'&&x.date>=ms&&x.date<=t)days[x.date]=(days[x.date]||0)+x.amount});
  const best=Object.keys(days).sort((a,b)=>days[b]-days[a])[0];
  const ic=byCat('income',ms,t),ec=byCat('expense',ms,t),mi=sum('income',ms,t),me=sum('expense',ms,t);
  const hl=(l,v,s)=>`<div class="card hl"><span class="label">${l}</span><span class="num">${v}</span><span class="muted">${s}</span></div>`;
  const ins=[];
  const wi=sum('income',ws,t),pwi=sum('income',pws,pwe);
  if(pwi&&wi){const p=Math.round((wi-pwi)/pwi*100);ins.push([p>=0?'g':'b',`Income this week is ${Math.abs(p)}% ${p>=0?'higher':'lower'} than the same days last week.`])}
  if(mi){const p=Math.round(me/mi*100);ins.push([p<=70?'g':'b',`Expenses used ${p}% of this month's income. You keep ${fmt(Math.max(0,mi-me))} so far.`])}
  if(ec[0]&&me)ins.push(['',`${ec[0].name} is ${Math.round(ec[0].total/me*100)}% of your spending this month.`]);
  const wd=[0,0,0,0,0,0,0],wn=[0,0,0,0,0,0,0],seen={};
  S.tx.forEach(x=>{if(x.type==='income'&&x.date>=addDays(t,-56)){const d=dt(x.date).getDay();wd[d]+=x.amount;if(!seen[x.date]){seen[x.date]=1;wn[d]++}}});
  let bd=-1,bv=0;wd.forEach((v,d)=>{if(wn[d]>1&&v/wn[d]>bv){bv=v/wn[d];bd=d}});
  if(bd>=0)ins.push(['g',`${['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'][bd]} are your strongest day, about ${fmt(Math.round(bv))} on average.`]);
  let miss=0;for(let i=1;i<=7;i++)if(!S.tx.some(x=>x.date===addDays(t,-i)))miss++;
  if(miss&&S.tx.length)ins.push(['b',`${miss} of the last 7 days have no entries. Fill them in so your numbers stay true.`]);
  if(!ti&&!te)ins.unshift(['',"Nothing recorded today yet."]);
  return `${S.sample?`<div class="banner">You are viewing a sample shop with example numbers. Nothing here is saved. <button class="link" data-act="startown">Start my own shop</button></div>`:''}
  <header class="row between"><div><p class="muted">${esc(S.shop.name)} · ${dt(t).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p><h1>Hello, ${esc(S.account.name.split(' ')[0])}</h1></div>
   <a class="btn primary" href="#record" data-go="record">Record today</a></header>
  <section class="today"><div><span class="label">Net earnings today</span><div class="num net">${fmt(ti-te)}</div></div>
   <div class="pair"><div><span class="label">Income</span><span class="num">${fmt(ti)}</span></div><div><span class="label">Expenses</span><span class="num">${fmt(te)}</span></div></div></section>
  <div class="grid2">${per('This week',ws,t,pws,pwe)}${per('This month',ms,t,pms,pme)}</div>
  <section class="card stack"><div class="row between"><h2>Goals</h2><a class="link" href="#goals" data-go="goals">Manage</a></div>
   ${S.goals.length?S.goals.map(goalBar).join(''):'<p class="empty">No goals yet. Set a monthly sales goal to track progress here.</p>'}</section>
  <section class="card stack"><div class="row between"><h2>Income vs expenses</h2><div class="seg"><button class="${range===7?'on':''}" data-act="range" data-v="7">7 days</button><button class="${range===30?'on':''}" data-act="range" data-v="30">30 days</button></div></div>
   <div class="legend"><span><i style="background:var(--in)"></i>Income</span><span><i style="background:var(--out)"></i>Expenses</span></div><div id="chart"></div></section>
  <div class="grid3">${hl('Best earning day',best?fmt(days[best]):'–',best?niceLong(best)+' this month':'No income this month')}
   ${hl('Top income category',ic[0]?esc(ic[0].name):'–',ic[0]?fmt(ic[0].total)+' this month':'No income this month')}
   ${hl('Biggest expense',ec[0]?esc(ec[0].name):'–',ec[0]?fmt(ec[0].total)+' this month':'No expenses this month')}</div>
  <section class="card stack"><h2>What the numbers say</h2><ul class="insights">${ins.slice(0,4).map(i=>`<li class="${i[0]}">${esc(i[1])}</li>`).join('')||'<li>Record a few days and insights will appear here.</li>'}</ul></section>`};
function goalBar(g){const p=goalProgress(g),lim=g.measure==='expense';
  const cls=lim?(p.pct>100?'bad':''):(p.pct>=100?'good':'');
  const msg=lim?(p.v>g.target?`${fmt(p.v-g.target)} over the limit`:`${fmt(g.target-p.v)} left`):(p.v>=g.target?'Goal reached':`${fmt(g.target-p.v)} to go`);
  return `<div class="stack" style="gap:6px"><div class="row between"><b>${esc(g.name||MEASURE[g.measure])}</b><span class="muted">${g.period==='week'?'This week':'This month'}</span></div>
   <div class="bar ${cls}" role="img" aria-label="${p.pct}%"><i style="width:${Math.min(100,p.pct)}%"></i></div>
   <div class="mini"><span><b>${fmt(p.v)}</b> of ${fmt(g.target)} · ${p.pct}%</span><span>${msg}</span></div></div>`}

V.record=()=>`${head("Record today","Enter what came in and what went out. Leave a side empty if there was none.")}
  <form class="stack" data-form="record"><div class="card stack">${entry('income','Income')}</div><div class="card stack">${entry('expense','Expense')}</div>
  <div class="card stack">${field('rec-note','Note (optional)',`<input type="text" id="rec-note" maxlength="200" placeholder="e.g. Festival rush" value="${esc(F.rec.note)}" data-f="rec.note">`)}
  ${field('rec-date','Date',`<input type="date" id="rec-date" max="${today()}" value="${F.rec.date}" data-f="rec.date">`)}</div>
  <button class="btn primary big">Save day</button></form>`;

function dayPage(type){const f=F[type],label=type==='income'?'Income':'Expense',t=today();
  const list=S.tx.filter(x=>x.type===type&&x.date===t).reverse();
  return `${head('Daily '+(type==='income'?'income':'expenses'),"Today's total: <b class='num "+(type==='income'?'pos':'neg')+"'>"+fmt(sum(type,t,t))+'</b>')}
  <form class="card stack" data-form="${type}">${entry(type,f.editId?'Edit '+label.toLowerCase():'Add '+label.toLowerCase())}
   ${field('note-'+type,'Note (optional)',`<input type="text" id="note-${type}" maxlength="200" value="${esc(f.note)}" data-f="${type}.note">`)}
   ${field('date-'+type,'Date',`<input type="date" id="date-${type}" max="${t}" value="${f.date}" data-f="${type}.date">`)}
   <div class="row"><button class="btn primary" style="flex:1">${f.editId?'Save changes':'Save '+label.toLowerCase()}</button>${f.editId?`<button type="button" class="btn" data-act="canceledit" data-type="${type}">Cancel</button>`:''}</div></form>
  <section class="card"><h2>Today</h2><ul class="txs">${list.map(x=>txRow(x)).join('')||`<li class="empty">No ${label.toLowerCase()} recorded today.</li>`}</ul></section>`}
V.income=()=>dayPage('income');V.expenses=()=>dayPage('expense');

V.categories=()=>{const block=(type,title)=>`<section class="card stack"><h2>${title}</h2><ul class="txs">${S.cats[type].map(c=>catEdit===c.id?
    `<li class="tx"><form class="row" style="flex:1" data-form="catrename" data-type="${type}" data-id="${c.id}"><input type="text" id="cat-rn" aria-label="Category name" value="${esc(c.name)}" required maxlength="24" style="flex:1;min-width:120px"><button class="btn small primary">Save</button><button type="button" class="btn small" data-act="catcancel">Cancel</button></form></li>`:
    `<li class="tx"><div class="m"><b>${esc(c.name)}</b></div><button class="btn small" data-act="catedit" data-id="${c.id}">Rename</button>${askBtn('cat'+c.id,'catdel',`data-type="${type}" data-id="${c.id}"`,'Delete','small')}</li>`).join('')}</ul>
   <form class="row" data-form="catadd" data-type="${type}"><input type="text" id="cat-new-${type}" aria-label="New ${title.toLowerCase()} category" placeholder="New category" required maxlength="24" style="flex:1;min-width:140px"><button class="btn">Add</button></form></section>`;
  return `${head('Categories','Keep the list short. Fewer categories make daily entry faster. Entries of a deleted category stay and show as Uncategorised.')}<div class="grid2">${block('income','Income')}${block('expense','Expenses')}</div>`};

V.goals=()=>{const g=F.goal;const opt=(o,sel)=>Object.keys(o).map(k=>`<option value="${k}" ${k===sel?'selected':''}>${o[k]}</option>`).join('');
  return `${head('Goals','Set a target and watch it fill up on your dashboard.')}
  <section class="card stack">${S.goals.map(x=>`<div class="stack" style="gap:8px">${goalBar(x)}<div class="row"><button class="btn small" data-act="goaledit" data-id="${x.id}">Edit</button><button class="btn small danger" data-act="goaldel" data-id="${x.id}">Delete</button></div></div>`).join('<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">')||'<p class="empty">No goals yet. Add your first one below.</p>'}</section>
  <form class="card stack" data-form="goal"><h2>${goalEdit?'Edit goal':'New goal'}</h2>
   ${field('g-name','Name (optional)',`<input type="text" id="g-name" maxlength="30" placeholder="e.g. Diwali month sales" value="${esc(g.name)}" data-f="goal.name">`)}
   <div class="grid2">${field('g-measure','Track',`<select id="g-measure" data-f="goal.measure">${opt(MEASURE,g.measure)}</select>`)}${field('g-period','Every',`<select id="g-period" data-f="goal.period">${opt({week:'Week',month:'Month'},g.period)}</select>`)}</div>
   ${field('g-target','Target amount',`<input type="text" inputmode="decimal" id="g-target" required value="${esc(g.target)}" data-f="goal.target">`)}
   <div class="row"><button class="btn primary" style="flex:1">${goalEdit?'Save changes':'Add goal'}</button>${goalEdit?'<button type="button" class="btn" data-act="goalcancel">Cancel</button>':''}</div></form>`};

function histRange(){const t=today(),p=F.hist.period;
  if(p==='week')return[weekStart(t),t];if(p==='month')return[monthStart(t),t];
  if(p==='last'){const a=dt(monthStart(t));a.setMonth(a.getMonth()-1);return[D(a),addDays(monthStart(t),-1)]}
  return['0000','9999']}
function histRows(){const[a,b]=histRange();return S.tx.filter(x=>x.date>=a&&x.date<=b&&(F.hist.type==='all'||x.type===F.hist.type)).sort((p,q)=>q.date.localeCompare(p.date))}
V.history=()=>{const[a,b]=histRange(),rows=histRows(),i=sum('income',a,b),e=sum('expense',a,b);
  const seg=(key,opts)=>`<div class="seg">${opts.map(o=>`<button class="${F.hist[key]===o[0]?'on':''}" data-act="hist" data-k="${key}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
  const bars=(type,cls)=>{const c=byCat(type,a,b),max=c[0]?c[0].total:1;return c.map(x=>`<div class="stack" style="gap:4px"><div class="mini"><span>${esc(x.name)}</span><b>${fmt(x.total)}</b></div><div class="bar ${cls}"><i style="width:${Math.round(x.total/max*100)}%"></i></div></div>`).join('')||'<p class="empty">Nothing in this period.</p>'};
  let last='',list='';rows.slice(0,200).forEach(x=>{if(x.date!==last){last=x.date;const n=sum('income',x.date,x.date)-sum('expense',x.date,x.date);list+=`<li class="day"><span>${niceLong(x.date)}</span><span>Net ${fmt(n)}</span></li>`}list+=txRow(x)});
  return `${head('History & reports')}
  <div class="row">${seg('period',[['week','This week'],['month','This month'],['last','Last month'],['all','All']])}${seg('type',[['all','All'],['income','Income'],['expense','Expenses']])}</div>
  <div class="grid3"><div class="card stat"><span class="label">Income</span><span class="num pos">${fmt(i)}</span></div><div class="card stat"><span class="label">Expenses</span><span class="num neg">${fmt(e)}</span></div><div class="card stat"><span class="label">Net</span><span class="num">${fmt(i-e)}</span></div></div>
  <div class="grid2"><section class="card stack"><h2>Income by category</h2>${bars('income','good')}</section><section class="card stack"><h2>Expenses by category</h2>${bars('expense','bad')}</section></div>
  <section class="card"><div class="row between"><h2>Entries (${rows.length})</h2><button class="btn small" data-act="csv">Copy as CSV</button></div>
   ${csv?`<textarea id="csv-out" readonly aria-label="CSV export">${esc(makeCsv(rows))}</textarea>`:''}
   <ul class="txs">${list||'<li class="empty">No entries in this period.</li>'}</ul>${rows.length>200?'<p class="muted">Showing the latest 200 entries.</p>':''}</section>`};
function makeCsv(rows){return'Date,Type,Category,Amount,Note\n'+rows.map(x=>[x.date,x.type,catName(x.type,x.catId),x.amount,x.note].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')}

V.settings=()=>`${head('Profile & settings')}
  <form class="card stack" data-form="profile"><h2>Profile</h2>
   ${field('pf-name','Your name',`<input type="text" id="pf-name" required value="${esc(S.account.name)}">`)}
   <div class="field"><span class="label">Email</span><p>${esc(S.account.email)}</p></div>
   <h2>Shop</h2>
   ${field('pf-shop','Shop name',`<input type="text" id="pf-shop" required maxlength="80" value="${esc(S.shop.name)}">`)}
   ${field('pf-cur','Currency',`<select id="pf-cur">${CURRENCIES.map(o=>`<option ${o===S.shop.currency?'selected':''}>${o}</option>`).join('')}</select>`)}
   <button class="btn primary">Save</button></form>
  <section class="card stack"><h2>Appearance</h2><div class="seg" style="align-self:flex-start">${['system','light','dark'].map(o=>`<button class="${theme===o?'on':''}" data-act="theme" data-v="${o}">${o[0].toUpperCase()+o.slice(1)}</button>`).join('')}</div></section>
  <section class="card stack"><h2>Data</h2><p class="muted">${S.sample?'This is the sample shop. Nothing here is saved.':'Your entries are saved to your account, so you can log in from any device.'}</p>
   <div class="row">${askBtn('wipe','wipe','','Delete all entries')}<button class="btn" data-act="logout">${S.sample?'Leave sample shop':'Log out'}</button></div></section>`;

V.more=()=>`${head('More')}<nav class="card menu">${['history','goals','categories','settings'].map(r=>`<a href="#${r}" data-go="${r}">${NAV.find(n=>n[0]===r)[1]}<span aria-hidden="true">›</span></a>`).join('')}</nav>`;

/* ---------- chart ---------- */
function drawChart(){const el=document.getElementById('chart');if(!el)return;
  const W=Math.max(280,el.clientWidth),H=Math.round(Math.min(260,Math.max(180,W*.42))),L=44,R=10,T=10,B=26,t=today();
  const inc=[],exp=[],lab=[];for(let i=range-1;i>=0;i--){const d=addDays(t,-i);inc.push(sum('income',d,d));exp.push(sum('expense',d,d));lab.push(d)}
  const raw=Math.max(1,...inc,...exp),p=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/p,max=(n<=1?1:n<=2?2:n<=4?4:n<=5?5:10)*p;
  const x=i=>L+(W-L-R)*i/(range-1),y=v=>T+(H-T-B)*(1-v/max);
  const pts=a=>a.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
  let g='';[0,.5,1].forEach(f=>{const yy=y(max*f);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${yy+4}" text-anchor="end">${short(max*f)}</text>`});
  const step=Math.ceil(range/(W<420?4:7));let xl='';
  for(let i=range-1;i>=0;i-=step)xl+=`<text x="${x(i)}" y="${H-6}" text-anchor="${i===range-1?'end':i===0?'start':'middle'}">${nice(lab[i])}</text>`;
  const dots=(a,c)=>range<=7?a.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}"/>`).join(''):`<circle cx="${x(range-1)}" cy="${y(a[range-1])}" r="4" fill="${c}"/>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses for the last ${range} days">${g}
   <polygon points="${L},${y(0)} ${pts(inc)} ${W-R},${y(0)}" fill="var(--in)" opacity=".12"/>
   <polyline points="${pts(inc)}" fill="none" stroke="var(--in)" stroke-width="2.5" stroke-linejoin="round"/>
   <polyline points="${pts(exp)}" fill="none" stroke="var(--out)" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="6 4"/>
   ${dots(inc,'var(--in)')}${dots(exp,'var(--out)')}${xl}</svg>`}

/* ---------- render ---------- */
function render(){
  if(booting)route='loading';else if(!S.account)route='auth';else if(!S.shop)route='setup';else if(!V[route]||['auth','setup','loading'].includes(route))route='home';
  const shell=!['auth','setup','loading'].includes(route);
  document.getElementById('view').innerHTML=V[route]();
  const tabs=document.getElementById('tabs'),rail=document.getElementById('rail');
  tabs.hidden=!shell;rail.hidden=!shell;
  if(shell){
    const svg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
    rail.innerHTML='<div class="brand">Galla</div>'+NAV.map(n=>`<a href="#${n[0]}" data-go="${n[0]}" class="${route===n[0]?'on':''}" ${route===n[0]?'aria-current="page"':''}>${svg(n[0])}${n[1]}</a>`).join('');
    const moreOn=['more','history','goals','categories','settings'].includes(route);
    tabs.innerHTML=[['home','Home'],['income','Income'],['record','Record'],['expenses','Expenses'],['more','More']].map(n=>n[0]==='record'?
      `<a href="#record" data-go="record" class="rec"><span class="dot">${svg('record')}</span><em>Record</em></a>`:
      `<a href="#${n[0]}" data-go="${n[0]}" class="${(n[0]==='more'?moreOn:route===n[0])?'on':''}">${svg(n[0])}${n[1]}</a>`).join('');
  }
  drawChart()}

/* ---------- actions ---------- */
const num=v=>parseFloat(String(v).replace(/[^0-9.]/g,''))||0;
const val=id=>{const e=document.getElementById(id);return e?e.value.trim():''};
function draft(type,note,date){const f=F[type],a=num(f.amount);if(!(a>0)||!f.cat)return null;
  return{id:uuid(),type,amount:Math.round(a*100)/100,catId:f.cat,note:note.trim().slice(0,200),date}}
// One action at a time; errors surface as a message instead of failing silently.
async function guard(fn,form){if(busy)return;busy=true;document.body.classList.add('busy');
  try{await fn()}catch(e){console.error(e);if(form==='auth'){authMsg=friendly(e);render()}else toast(friendly(e))}
  finally{busy=false;document.body.classList.remove('busy')}}

const SUBMIT={
 async auth(){const email=F.auth.email.trim().toLowerCase(),pw=document.getElementById('au-pass').value;authMsg='';
  if(authMode==='signup'){
    const{data,error}=await sb.auth.signUp({email,password:pw,options:{data:{full_name:F.auth.name.trim()}}});if(error)throw error;
    if(!data.session){authMode='login';
      authMsg=data.user&&data.user.identities&&!data.user.identities.length?'An account with this email already exists. Log in instead.':'Almost there. Open the confirmation link we emailed to '+email+', then log in here.';
      render();return}
    await loadAll(data.user)}
  else{const{data,error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;await loadAll(data.user)}
  go('home')},
 async setup(){const shop={id:uuid(),name:val('sh-name'),type:val('sh-type'),currency:val('sh-cur')},g=num(val('sh-goal'));
  await run(()=>sb.from('shops').insert({id:shop.id,name:shop.name,shop_type:shop.type,currency:shop.currency}));
  S.shop=shop;await loadCats(); // the database adds the starter categories
  if(g>0){const goal={id:uuid(),name:'Monthly sales',measure:'income',period:'month',target:g};
    await run(()=>sb.from('goals').insert(Object.assign({shop_id:shop.id},goal)));S.goals.push(goal)}
  go('home');toast('Shop ready. Record your first day.')},
 async record(){const d=F.rec.date||today();
  const rows=[draft('income',F.rec.note,d),draft('expense',F.rec.note,d)].filter(Boolean);
  if(!rows.length){toast('Enter an income or expense amount first.');return}
  await insertEntries(rows);F.income=blank();F.expense=blank();F.rec={note:'',date:today()};go('home');
  const ids=rows.map(r=>r.id);
  toast('Day saved. Net for '+niceLong(d).toLowerCase()+': '+fmt(sum('income',d,d)-sum('expense',d,d)),async()=>{await removeEntries(ids);render();toast('Undone.')})},
 income(){return dayEntry('income')},expense(){return dayEntry('expense')},
 async catadd(f){const type=f.dataset.type,n=val('cat-new-'+type);
  if(S.cats[type].some(c=>c.name.toLowerCase()===n.toLowerCase())){toast('That category already exists.');return}
  const c={id:uuid(),name:n};await run(()=>sb.from('categories').insert({id:c.id,shop_id:S.shop.id,kind:type,name:n}));S.cats[type].push(c);render()},
 async catrename(f){const type=f.dataset.type,c=S.cats[type].find(c=>c.id===f.dataset.id),n=val('cat-rn');if(!c)return;
  if(S.cats[type].some(o=>o!==c&&o.name.toLowerCase()===n.toLowerCase())){toast('That category already exists.');return}
  await run(()=>sb.from('categories').update({name:n}).eq('id',c.id));c.name=n;catEdit=null;render()},
 async goal(){const t=num(F.goal.target);if(!(t>0)){toast('Enter a target amount more than 0.');return}
  const d={name:F.goal.name.trim(),measure:F.goal.measure,period:F.goal.period,target:t};
  if(goalEdit){const g=S.goals.find(g=>g.id===goalEdit);await run(()=>sb.from('goals').update(d).eq('id',goalEdit));if(g)Object.assign(g,d)}
  else{const g=Object.assign({id:uuid()},d);await run(()=>sb.from('goals').insert(Object.assign({shop_id:S.shop.id},g)));S.goals.push(g)}
  goalEdit=null;F.goal=blankGoal();render();toast('Goal saved.')},
 async profile(){const name=val('pf-name'),shop=val('pf-shop'),cur=val('pf-cur');
  await run(()=>sb.from('profiles').update({full_name:name}).eq('id',S.user.id));
  await run(()=>sb.from('shops').update({name:shop,currency:cur}).eq('id',S.shop.id));
  S.account.name=name;S.shop.name=shop;S.shop.currency=cur;render();toast('Saved.')}
};
async function dayEntry(type){const f=F[type];
  if(!(num(f.amount)>0)){toast('Enter an amount more than 0.');return}
  if(!f.cat){toast('Add a category first.');return}
  const row=draft(type,f.note,f.date||today());
  if(f.editId){row.id=f.editId;const x=S.tx.find(x=>x.id===row.id);
    await run(()=>sb.from('entries').update({category_id:row.catId,amount:row.amount,note:row.note,entry_date:row.date}).eq('id',row.id));
    if(x)Object.assign(x,row);F[type]=blank();render();toast('Changes saved.')}
  else{await insertEntries([row]);F[type]=blank();render();toast('Saved.',async()=>{await removeEntries([row.id]);render();toast('Undone.')})}}

const ACT={
 authmode(d){authMode=d.v;authMsg='';render()},
 sample(){S=sample();go('home')},
 startown(){S=empty();authMode='signup';authMsg='';render()},
 reload(){boot()},
 ask(d){askKey=d.key;clearTimeout(askT);askT=setTimeout(()=>{askKey=null;render()},4000);render()},
 pick(d){F[d.type].cat=d.id;render()},
 range(d){range=+d.v;render()},
 edit(d){const x=S.tx.find(x=>x.id===d.id);if(!x)return;F[x.type]={amount:String(x.amount),cat:x.catId,note:x.note,date:x.date,editId:x.id};go(x.type==='income'?'income':'expenses')},
 canceledit(d){F[d.type]=blank();render()},
 async del(d){const x=S.tx.find(x=>x.id===d.id);if(!x)return;await removeEntries([x.id]);render();
  toast('Entry deleted.',async()=>{await insertEntries([x]);render();toast('Entry restored.')})},
 undo(){const fn=undoFn;undoFn=null;document.getElementById('toast').hidden=true;return fn&&fn()},
 catedit(d){catEdit=d.id;render()},catcancel(){catEdit=null;render()},
 async catdel(d){askKey=null;if(S.cats[d.type].length<2){toast('Keep at least one category.');render();return}
  await run(()=>sb.from('categories').delete().eq('id',d.id));
  S.cats[d.type]=S.cats[d.type].filter(c=>c.id!==d.id);S.tx.forEach(x=>{if(x.catId===d.id)x.catId=null});render();toast('Category deleted.')},
 goaledit(d){const g=S.goals.find(g=>g.id===d.id);if(!g)return;goalEdit=g.id;F.goal={name:g.name,measure:g.measure,period:g.period,target:String(g.target)};render()},
 goalcancel(){goalEdit=null;F.goal=blankGoal();render()},
 async goaldel(d){const g=S.goals.find(g=>g.id===d.id);if(!g)return;await run(()=>sb.from('goals').delete().eq('id',g.id));S.goals=S.goals.filter(x=>x!==g);render();
  toast('Goal deleted.',async()=>{await run(()=>sb.from('goals').insert(Object.assign({shop_id:S.shop.id},g)));S.goals.push(g);render();toast('Goal restored.')})},
 hist(d){F.hist[d.k]=d.v;render()},
 csv(){const text=makeCsv(histRows());csv=true;render();const ta=document.getElementById('csv-out');
  const fb=()=>{if(ta){ta.focus();ta.select()}toast('Select and copy the text below.')};
  try{navigator.clipboard.writeText(text).then(()=>toast('Copied. Paste it into a spreadsheet.'),fb)}catch(e){fb()}},
 theme(d){theme=d.v;try{localStorage.setItem('galla.theme',theme)}catch(e){}applyTheme();render()},
 async wipe(){askKey=null;await run(()=>sb.from('entries').delete().eq('shop_id',S.shop.id));S.tx=[];render();toast('All entries deleted.')},
 async logout(){if(!S.sample&&sb)await sb.auth.signOut();S=empty();authMode='login';authMsg='';render()}
};
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-go]');if(a){e.preventDefault();csv=false;go(a.dataset.go);return}
  const b=e.target.closest('[data-act]');if(b&&ACT[b.dataset.act]){if(b.tagName==='BUTTON'&&b.type!=='submit')e.preventDefault();const d=b.dataset;guard(()=>ACT[d.act](d))}});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target,k=f.dataset.form;if(SUBMIT[k])guard(()=>SUBMIT[k](f),k)});
function bind(e){const p=e.target.dataset&&e.target.dataset.f;if(p){const[a,b]=p.split('.');F[a][b]=e.target.value}}
document.addEventListener('input',bind);document.addEventListener('change',bind);
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(h&&h!==route){route=h;render()}});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(drawChart,120)});

/* ---------- start ---------- */
async function boot(){
  booting=true;bootError='';const want=location.hash.slice(1)||'home';render();
  try{
    if(!sb)throw new Error('Could not load the app. Check your internet connection and reload.');
    const{data,error}=await sb.auth.getSession();if(error)throw error;
    if(data.session)await loadAll(data.session.user);
    booting=false;route=want;render();
  }catch(e){console.error(e);bootError=friendly(e);render()}
}
if(sb)sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&S.user){S=empty();authMode='login';render()}});
applyTheme();boot();
})();
