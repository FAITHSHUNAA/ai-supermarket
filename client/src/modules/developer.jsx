import { ListingForm } from "./listing";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, yuan } from "../api";
import { useSession } from "../shell/session";
import { Field, Notice } from "../shell/ui";

const tabs = [
  ["", "概览"],
  ["api-keys", "API Key"],
  ["models", "模型"],
  ["calls", "调用"],
  ["clients", "应用"],
  ["sandboxes", "沙箱"],
  ["hosting", "托管"],
  ["earnings", "收益"],
  ["settlements", "结算"],
  ["wallet", "钱包"],
];

export function DeveloperApply() {
  const { user, refresh, settings } = useSession();
  const live = settings?.login?.primary_login_method === "username_password";
  const [pitch, setPitch] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [promo, setPromo] = useState("希望分享给同事。");
  const [error, setError] = useState(null);
  const [done, setDone] = useState("");
  useEffect(() => {
    let active = true;
    if (user?.id) api("/v1/developer/application").then(data => {
      if (active) { setPitch(data.pitch); setReason(data.reason || ""); }
    }).catch(err => { if (active) setError(err); });
    return () => { active = false; };
  }, [user?.id,user?.developerStatus]);
  if (user === undefined) return <p className="section">正在读取入驻状态…</p>;
  if (user === null) return <p className="section">请先 <Link to="/login?return_to=/register-developer">登录</Link> 再申请。</p>;
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <div className="faint">DEVELOPER</div>
      <h2>入驻成为开发者</h2>
      <p className="lede">说明你准备销售的商品、适用人群和交付方式。通过审核后即可创建商品并提交上架。 <Link to="/docs/listing">查看上架规范</Link></p>
      <Notice error={error}>{done}</Notice>
      <div className="split">
        <article className="card">
          <h3>开发者申请</h3>
          <p>当前状态：{({none:"尚未申请",pending:"等待审核",approved:"已获准入驻",rejected:"已退回"})[user.developerStatus]}</p>
          {user.developerStatus === "approved" ? <Link className="btn" to="/developer/clients">管理我的商品</Link> : <>
            {reason && <p>退回原因：{reason}</p>}
            <Field label="你要上架什么"><textarea maxLength={2000} disabled={sending || user.developerStatus === "pending"} value={pitch} onChange={(event) => setPitch(event.target.value)} /></Field>
            {user.developerStatus !== "pending" && <button className="btn" disabled={sending || !pitch.trim()} type="button" onClick={async () => {
              setSending(true);
              try { await submit("/v1/developer/application", { pitch }, setError, setDone, refresh); } finally { setSending(false); }
            }}>{sending ? "正在提交…" : "提交入驻"}</button>}
          </>}
        </article>
        {!live && <article className="card">
          <h3>推广员申请</h3>
          <p className="muted">当前状态：{user?.promoterStatus || "none"}</p>
          <Field label="推广说明"><textarea value={promo} onChange={(event) => setPromo(event.target.value)} /></Field>
          <button className="btn ghost" type="button" onClick={() => submit("/v1/developer-center/promoter-applications", { pitch: promo }, setError, setDone, refresh)}>申请推广</button>
        </article>}
      </div>
    </section>
  );
}

async function submit(path, body, setError, setDone, refresh) {
  setError(null);
  try {
    await api(path, { method: "POST", body });
    setDone("已提交");
    if (refresh) await refresh();
  } catch (error) {
    setError(error);
  }
}

export function Developer() {
  const { tab:requestedTab = "" } = useParams();
  const { user,settings } = useSession();
  const allowed=settings?.capabilities?.developer_tabs;
  const tab=requestedTab || allowed?.[0] || "";
  if (user === undefined) return <p>正在读取账号…</p>;
  if (!user) return <p className="section">请先 <Link to="/login?return_to=/developer">登录</Link>。</p>;
  if (user.developerStatus !== "approved" && user.role !== "admin") {
    return (
      <section className="section">
        <h2>开发者控制台还没打开</h2>
        <p className="muted">当前申请状态：{user.developerStatus}。</p>
        <Link className="btn" to="/register-developer">去申请</Link>
      </section>
    );
  }
  return (
    <section className="layout">
      <aside className="side">
        {tabs.filter(([key])=>!allowed || allowed.includes(key)).map(([key, label]) => (
          <Link key={key} className={tab === key ? "active" : ""} to={key ? `/developer/${key}` : "/developer"}>{label}</Link>
        ))}
      </aside>
      <div>
        {tab === "" ? <DevHome /> : null}
        {tab === "api-keys" ? <Keys /> : null}
        {tab === "models" ? <Models /> : null}
        {tab === "calls" ? <Calls /> : null}
        {tab === "clients" ? <Clients /> : null}
        {tab === "sandboxes" ? <Sandboxes /> : null}
        {tab === "hosting" ? <Hosting /> : null}
        {tab === "earnings" ? <Earnings /> : null}
        {tab === "settlements" ? <Settlements /> : null}
        {tab === "wallet" ? <DevWallet /> : null}
      </div>
    </section>
  );
}

function DevHome() {
  const [usage, setUsage] = useState(null);
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    api("/v1/developer/usage").then(setUsage).catch(() => {});
    api("/v1/developer/wallet").then(setWallet).catch(() => {});
  }, []);
  return (
    <div className="grid-3">
      <article className="stat"><span className="muted">调用次数</span><b>{usage?.calls ?? "—"}</b></article>
      <article className="stat"><span className="muted">消耗积分</span><b>{usage?.points ?? "—"}</b></article>
      <article className="stat"><span className="muted">可结算佣金</span><b>{yuan(wallet?.wallet?.commission_cents || 0)}</b></article>
    </div>
  );
}

function Keys() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("新钥匙");
  const [plain, setPlain] = useState("");
  const [error, setError] = useState(null);
  async function load() {
    setItems((await api("/v1/developer/api-keys")).items);
  }
  useEffect(() => {
    load().catch(setError);
  }, []);
  return (
    <article className="card">
      <h3>API Key</h3>
      <p className="muted">明文只出现一次。复制后要点确认，否则调用会返回 409。</p>
      <Notice error={error}>{plain ? `请立即保存：${plain}` : ""}</Notice>
      <div className="row">
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button className="btn" type="button" onClick={async () => {
          const created = await api("/v1/developer/api-keys", { method: "POST", body: { name } });
          setPlain(created.api_key);
          await load();
        }}>创建</button>
      </div>
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}<div className="faint">{item.prefix}</div></td>
              <td>{item.status}</td>
              <td className="row">
                {item.status === "delivery_pending" ? <button className="btn tiny" type="button" onClick={async () => { await api(`/v1/developer/api-keys/${item.id}/confirm-delivery`, { method: "POST", body: {} }); await load(); }}>确认已保存</button> : null}
                {item.status !== "revoked" ? <button className="btn tiny danger" type="button" onClick={async () => { await api(`/v1/developer/api-keys/${item.id}/revoke`, { method: "POST", body: {} }); await load(); }}>吊销</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function Models() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api("/v1/developer/models").then((body) => setItems(body.items)).catch(() => {});
  }, []);
  return (
    <article className="card">
      <h3>可调用模型</h3>
      {items.map((item) => (
        <div className="row" key={item.model_key} style={{ justifyContent: "space-between" }}>
          <span>{item.display_name} · {item.default_points_per_call} 积分</span>
          <button className="btn tiny ghost" type="button" onClick={() => navigate(`/docs/models/${item.model_key}`)}>文档</button>
        </div>
      ))}
    </article>
  );
}

function Calls() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api("/v1/developer/calls?page_size=30").then((body) => setItems(body.items)).catch(() => {});
  }, []);
  return (
    <article className="card">
      <h3>调用记录</h3>
      <table>
        <tbody>
          {items.map((item) => <tr key={item.id}><td>{item.createdAt?.slice(0, 19).replace("T", " ")}</td><td>{item.modelKey || item.endpointId}</td><td>{item.points}</td><td>{item.status}</td></tr>)}
        </tbody>
      </table>
    </article>
  );
}

function Clients() {
  const [items, setItems] = useState([]);
  const [reports,setReports]=useState([]);
  const [form, setForm] = useState({ name: "", summary: "", category_id:"" });
  const [categories,setCategories] = useState([]);
  useEffect(()=>{api("/v1/platform/application-categories").then(body=>setCategories(body.items)).catch(setError);},[]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState(null);
  async function load() {
    setItems((await api("/v1/developer/clients?page_size=50")).items);
    setReports((await api("/v1/developer/delivery-reports")).items);
  }
  useEffect(() => { load().catch(setError); }, []);
  return (
    <article className="card">
      <h3>发布商品</h3>
      {reports.map(r=><form key={r.id} onSubmit={async e=>{
        e.preventDefault();const url=new FormData(e.currentTarget).get("url");
        try{await api("/v1/developer/delivery-reports",{method:"POST",body:{id:r.id,url}});await load();}catch(err){setError(err);}
      }}><label>{items.find(c=>c.client_id===r.clientId)?.name || r.clientId} · 买家报告链接失效<input name="url" type="url" placeholder="https://" required/></label><button className="btn ghost">{r.submitted?"更新待审补发链接":"提交补发链接"}</button></form>)}
      <Link to="/docs/listing">查看商品上架规范及填写模板</Link>
      <Notice error={error}>{secret}</Notice>
      <Field label="名称"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="简介"><input value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></Field>
      <Field label="主题分类"><select value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">未分类</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <button className="btn" type="button" disabled={!form.name.trim() || !form.summary.trim()} onClick={async () => {
        try {
          await api("/v1/developer/clients", { method: "POST", body: { ...form, product_only:true } });
          setSecret("商品已创建，请展开上架申请填写资料");
          setForm({name:"",summary:"",category_id:""});
          await load();
        } catch (err) { setError(err); }
      }}>创建商品并填写上架资料</button>
      {items.map((item) => (
        <div key={item.client_id} style={{ marginTop: 14 }}>
          <strong>{item.name}</strong>
          <span className="muted"> · {item.status} · {item.client_id}</span>
          <ListingForm clientId={item.client_id} />
        </div>
      ))}
    </article>
  );
}

function Sandboxes() {
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  async function load() {
    setItems((await api("/v1/developer/sandboxes")).items);
    const list = await api("/v1/developer/clients?page_size=50");
    setClients(list.items);
    if (!clientId && list.items[0]) setClientId(list.items[0].client_id);
  }
  useEffect(() => { load().catch(() => {}); }, []);
  return (
    <article className="card">
      <h3>沙箱</h3>
      <div className="row">
        <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
          {clients.map((item) => <option key={item.client_id} value={item.client_id}>{item.name}</option>)}
        </select>
        <button className="btn" type="button" onClick={async () => { await api("/v1/developer/sandboxes", { method: "POST", body: { client_id: clientId } }); await load(); }}>创建沙箱</button>
      </div>
      {items.map((item) => (
        <div className="row" key={item.id}>
          <span>{item.name} · {item.status}</span>
          <button className="btn tiny ghost" type="button" onClick={async () => { await api(`/v1/developer/sandboxes/${item.id}/${item.status === "active" ? "pause" : "resume"}`, { method: "POST", body: {} }); await load(); }}>{item.status === "active" ? "暂停" : "恢复"}</button>
        </div>
      ))}
    </article>
  );
}

function Hosting() {
  const [plans, setPlans] = useState([]);
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ plan_id: "", client_id: "" });
  useEffect(() => {
    Promise.all([api("/v1/developer/hosting/plans"), api("/v1/developer/hosting/instances"), api("/v1/developer/clients?page_size=50")]).then(([planBody, instanceBody, clientBody]) => {
      setPlans(planBody.items);
      setItems(instanceBody.items);
      setClients(clientBody.items);
      setForm({ plan_id: planBody.items[0]?.id || "", client_id: clientBody.items[0]?.client_id || "" });
    }).catch(() => {});
  }, []);
  return (
    <article className="card">
      <h3>应用托管</h3>
      <div className="row">
        <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}>{clients.map((item) => <option key={item.client_id} value={item.client_id}>{item.name}</option>)}</select>
        <select value={form.plan_id} onChange={(event) => setForm({ ...form, plan_id: event.target.value })}>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button className="btn" type="button" onClick={async () => {
          await api("/v1/developer/application-hosting/create", { method: "POST", body: form });
          setItems((await api("/v1/developer/hosting/instances")).items);
        }}>申请实例</button>
      </div>
      {items.map((item) => <p key={item.id}>{item.status} · {item.endpoint || "等待节点"}</p>)}
    </article>
  );
}

function Earnings() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/v1/auth/earnings").then(setData).catch(() => {}); }, []);
  return (
    <article className="card">
      <h3>收益</h3>
      <p>佣金余额 {yuan(data?.wallet?.commission_cents || 0)}，冻结中 {yuan(data?.wallet?.pending_settlement_cents || 0)}</p>
      {(data?.statements || []).map((item) => <p key={item.id}>{item.period} · {yuan(item.commissionCents)} · {item.status}</p>)}
      <h3>分成明细</h3>
      {(data?.lines || []).map((item) => <p key={item.id}>{item.clientId} · 开发者 {yuan(item.developerCents)} · 推广 {yuan(item.promoterCents)}</p>)}
    </article>
  );
}

function Settlements() {
  const [items, setItems] = useState([]);
  const [amount, setAmount] = useState(1000);
  const [error, setError] = useState(null);
  async function load() { setItems((await api("/v1/developer/offline-settlement-requests")).items); }
  useEffect(() => { load().catch(setError); }, []);
  return (
    <article className="card">
      <h3>线下结算</h3>
      <p className="muted">佣金不会自动打款。提交申请后，由管理员记账。</p>
      <Notice error={error} />
      <div className="row">
        <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <button className="btn" type="button" onClick={async () => {
          try {
            await api("/v1/developer/offline-settlement-requests", { method: "POST", body: { amount_cents: Number(amount), note: "申请线下结算" } });
            await load();
          } catch (err) { setError(err); }
        }}>提交申请</button>
      </div>
      {items.map((item) => (
        <div className="row" key={item.requestNo}>
          <span>{item.requestNo} · {yuan(item.amountCents)} · {item.status}</span>
          {item.status === "pending" ? <button className="btn tiny ghost" type="button" onClick={async () => { await api(`/v1/developer/offline-settlement-requests/${item.requestNo}/cancel`, { method: "POST", body: {} }); await load(); }}>取消</button> : null}
        </div>
      ))}
    </article>
  );
}

function DevWallet() {
  const [data, setData] = useState(null);
  const [error,setError]=useState(null);
  const {settings}=useSession();
  useEffect(() => { api("/v1/developer/wallet").then(setData).catch(setError); }, []);
  if(!data)return error?<Notice error={error}/>:<p>正在读取账户…</p>;
  const wallet = data?.wallet;
  return (
    <article className="card">
      <h3>双账户</h3>
      <div className="grid-2">
        <div className="stat"><span className="muted">积分，只用于调用</span><b>{wallet?.points ?? "—"}</b></div>
        <div className="stat"><span className="muted">佣金，只走结算</span><b>{yuan(wallet?.commission_cents || 0)}</b></div>
      </div>
    </article>
  );
}
