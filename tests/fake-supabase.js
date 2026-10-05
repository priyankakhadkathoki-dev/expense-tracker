// TEST ONLY. An in-memory stand-in for supabase-js, kept in localStorage so it survives reloads.
// It mimics the parts the app uses, including "you only see your own rows".
(function(){
  const KEY='fake-supabase';
  const load=()=>JSON.parse(localStorage.getItem(KEY)||'null')||{users:[],session:null,seq:0,t:{profiles:[],shops:[],categories:[],entries:[],goals:[]}};
  const save=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const id=()=>'u'+Math.random().toString(36).slice(2);
  const mine=(d,t)=>{const me=d.session,shops=d.t.shops.filter(s=>s.owner_id===me).map(s=>s.id);
    if(!me)return()=>false;
    if(t==='profiles')return r=>r.id===me;if(t==='shops')return r=>r.owner_id===me;return r=>shops.includes(r.shop_id)};
  function from(t){
    const q={op:'select',filters:[],payload:null,one:false,rng:null};
    const api={
      select(){return api},insert(p){q.op='insert';q.payload=Array.isArray(p)?p:[p];return api},
      update(p){q.op='update';q.payload=p;return api},delete(){q.op='delete';return api},
      eq(c,v){q.filters.push(r=>r[c]===v);return api},in(c,v){q.filters.push(r=>v.includes(r[c]));return api},
      order(){return api},range(a,b){q.rng=[a,b];return api},
      maybeSingle(){q.one=true;return api},single(){q.one=true;return api},
      then(res,rej){return Promise.resolve().then(exec).then(res,rej)}
    };
    function exec(){
      const d=load(),ok=mine(d,t),match=r=>ok(r)&&q.filters.every(f=>f(r));
      if(q.op==='insert'){
        for(const row of q.payload){
          const r=Object.assign({created_at:++d.seq},row);
          if(t==='shops'){r.owner_id=d.session;if(d.t.shops.some(s=>s.owner_id===d.session))return{data:null,error:{code:'23505',message:'duplicate'}}}
          if(!ok(r))return{data:null,error:{code:'42501',message:'new row violates row-level security policy'}};
          d.t[t].push(r);
          if(t==='shops'){['Product Sales','Services','Online Orders','Other'].forEach(n=>d.t.categories.push({id:id(),shop_id:r.id,kind:'income',name:n,created_at:++d.seq}));
            ['Stock','Rent','Utilities','Staff','Transport','Marketing','Repairs','Other'].forEach(n=>d.t.categories.push({id:id(),shop_id:r.id,kind:'expense',name:n,created_at:++d.seq}))}
        }
        save(d);return{data:null,error:null}}
      if(q.op==='update'){d.t[t].filter(match).forEach(r=>Object.assign(r,q.payload));save(d);return{data:null,error:null}}
      if(q.op==='delete'){const gone=d.t[t].filter(match).map(r=>r.id);d.t[t]=d.t[t].filter(r=>!match(r));
        if(t==='categories')d.t.entries.forEach(e=>{if(gone.includes(e.category_id))e.category_id=null});save(d);return{data:null,error:null}}
      let rows=d.t[t].filter(match);
      if(t==='entries')rows.sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.created_at-b.created_at);
      if(q.rng)rows=rows.slice(q.rng[0],q.rng[1]+1);
      return{data:q.one?(rows[0]||null):rows,error:null}}
    return api}
  const userOf=u=>({id:u.id,email:u.email,identities:[{}]});
  const auth={
    async getSession(){const d=load(),u=d.users.find(u=>u.id===d.session);return{data:{session:u?{user:userOf(u)}:null},error:null}},
    async signUp({email,password,options}){const d=load();
      if(d.users.some(u=>u.email===email))return{data:{user:{identities:[]},session:null},error:null};
      const u={id:id(),email,password};d.users.push(u);d.t.profiles.push({id:u.id,full_name:options.data.full_name});
      if(window.FAKE_CONFIRM_EMAIL){save(d);return{data:{user:userOf(u),session:null},error:null}}
      d.session=u.id;save(d);return{data:{user:userOf(u),session:{user:userOf(u)}},error:null}},
    async signInWithPassword({email,password}){const d=load(),u=d.users.find(u=>u.email===email&&u.password===password);
      if(!u)return{data:{},error:{message:'Invalid login credentials'}};d.session=u.id;save(d);return{data:{user:userOf(u),session:{user:userOf(u)}},error:null}},
    async signOut(){const d=load();d.session=null;save(d);return{error:null}},
    onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}
  };
  window.supabase={createClient:()=>({from,auth})};
})();
