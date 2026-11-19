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
  const { user, refresh } = useSession();
  const [pitch, setPitch] = useState("我想把自己的工具上架到超市。");
  const [promo, setPromo] = useState("希望分享给同事。");
  const [error, setError] = useState(null);
  const [done, setDone] = useState("");
  if (user === null) return <p className="section">请先 <Link to="/login?return_to=/register-developer">登录</Link> 再申请。</p>;
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <div className="faint">DEVELOPER</div>
      <h2>入驻成为开发者</h2>
      <p className="lede">审核通过后才能创建钥匙、应用和托管。推广员需要另外申请，通过后才能参与分成。</p>
      <Notice error={error}>{done}</Notice>
      <div className="split">
        <article className="card">
          <h3>开发者申请</h3>
          <p className="muted">当前状态：{user?.developerStatus || "none"}</p>
          <Field label="你要上架什么"><textarea value={pitch} onChange={(event) => setPitch(event.target.value)} /></Field>
          <button className="btn" type="button" onClick={() => submit("/v1/developer/application", { pitch }, setError, setDone, refresh)}>提交入驻</button>
        </article>
        <article className="card">
          <h3>推广员申请</h3>
          <p className="muted">当前状态：{user?.promoterStatus || "none"}</p>
          <Field label="推广说明"><textarea value={promo} onChange={(event) => setPromo(event.target.value)} /></Field>
          <button className="btn ghost" type="button" onClick={() => submit("/v1/developer-center/promoter-applications", { pitch: promo }, setError, setDone, refresh)}>申请推广</button>
        </article>
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
  const { tab = "" } = useParams();
  const { user } = useSession();
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
        {tabs.map(([key, label]) => (
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
  const [form, setForm] = useState({ name: "我的新应用", summary: "一句话说明", redirect_uris: "http://127.0.0.1:8787/oauth/callback" });
  const [secret, setSecret] = useState("");
  const [error, setError] = useState(null);
  async function load() {
    setItems((await api("/v1/developer/clients?page_size=50")).items);
  }
  useEffect(() => { load().catch(setError); }, []);
  return (
    <article className="card">
      <h3>应用客户端</h3>
      <Notice error={error}>{secret}</Notice>
      <Field label="名称"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="简介"><input value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></Field>
      <button className="btn" type="button" onClick={async () => {
        try {
          const created = await api("/v1/developer/clients", { method: "POST", body: { ...form, redirect_uris: form.redirect_uris.split(",").map((item) => item.trim()) } });
          setSecret(`密钥只此一次：${created.client_secret}`);
          await load();
        } catch (err) { setError(err); }
      }}>创建应用</button>
      {items.map((item) => (
        <div key={item.client_id} style={{ marginTop: 14 }}>
          <strong>{item.name}</strong>
          <span className="muted"> · {item.status} · {item.client_id}</span>
          <Offer clientId={item.client_id} />
        </div>
      ))}
    </article>
  );
}

function Offer({ clientId }) {
  const [price, setPrice] = useState(100);
  const [message, setMessage] = useState("");
  return (
    <div className="row">
      <input style={{ maxWidth: 120 }} type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
      <button className="btn tiny ghost" type="button" onClick={async () => {
        await api(`/v1/developer/clients/${clientId}/commercial-offer`, { method: "POST", body: { price_points: Number(price), title: `${price} 积分开通` } });
        setMessage("报价已提交，等待审核");
      }}>提交报价</button>
      <span className="muted">{message}</span>
    </div>
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
  useEffect(() => { api("/v1/developer/wallet").then(setData).catch(() => {}); }, []);
  const wallet = data?.wallet;
  return (
    <article className="card">
      <h3>双账户</h3>
      <div className="grid-2">
        <div className="stat"><span className="muted">积分，只用于调用</span><b>{wallet?.points ?? "—"}</b></div>
        <div className="stat"><span className="muted">佣金，只走结算</span><b>{yuan(wallet?.commission_cents || 0)}</b></div>
      </div>
      <p><Link to="/recharge">给积分账户充值</Link></p>
    </article>
  );
}
