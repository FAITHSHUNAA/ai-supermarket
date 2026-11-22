const {DatabaseSync}=require("node:sqlite");

// Business operations mutate an in-memory revision. Commit related rows in a single WAL transaction.
function open(file){
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entitlements(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS trade_no ON orders(json_extract(value,'$.outTradeNo'));
    CREATE UNIQUE INDEX IF NOT EXISTS provider_tx ON orders(json_extract(value,'$.channel'),json_extract(value,'$.providerTransaction'));`);
  const names=["orders","entitlements","refunds"];
  const cache=new Map();
  function load(){
    const state=Object.fromEntries(db.prepare("SELECT * FROM state").all().map(r=>[r.key,JSON.parse(r.value)]));
    if(!Object.keys(state).length)return null;
    for(const name of names)state[name]=db.prepare("SELECT value FROM "+name+" ORDER BY rowid").all().map(r=>JSON.parse(r.value));
    return state;
  }
  function save(state){
    const next=new Map();
    db.exec("BEGIN IMMEDIATE");
    try{
      for(const name of ["state",...names]){
        const key=name==="state"?"key":"id";
        const entries=name==="state"?Object.entries(state).filter(([k])=>!names.includes(k)):state[name].map(r=>[r.id,r]);
        const prev=cache.get(name)||new Map(), current=new Map();
        const upsert=db.prepare(`INSERT INTO ${name}(${key},value) VALUES (?,?) ON CONFLICT(${key}) DO UPDATE SET value=excluded.value`);
        for(const [id,data] of entries){
          const raw=JSON.stringify(data);current.set(id,raw);
          if(raw!==prev.get(id))upsert.run(id,raw);
        }
        for(const id of prev.keys())if(!current.has(id))db.prepare(`DELETE FROM ${name} WHERE ${key}=?`).run(id);
        next.set(name,current);
      }
      db.exec("COMMIT");
      for(const [name,values] of next)cache.set(name,values);
    }catch(err){db.exec("ROLLBACK");throw err;}
  }
  return {load,save};
}
module.exports={open};
