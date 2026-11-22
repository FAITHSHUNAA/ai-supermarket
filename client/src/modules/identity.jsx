import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../shell/session";
import { Field, Notice } from "../shell/ui";
import { ListingDetails } from "./listing";

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, settings } = useSession();
  const usernameMode = settings?.login?.primary_login_method === "username_password";
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "password");
  const [form, setForm] = useState({ phone: "", password: "", otp: "", name: "", invite_code: params.get("invite") || "", email: "" });
  const [captcha, setCaptcha] = useState(null);
  const [demo, setDemo] = useState("");
  const [error, setError] = useState(null);
  const returnTo = params.get("return_to") || "/profile";

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadCaptcha() {
    setCaptcha(await api("/v1/auth/captcha/challenge"));
  }
  useEffect(() => {
    if (mode === "register" || usernameMode) loadCaptcha().catch(setError);
  }, [mode, usernameMode]);

  async function send(purpose) {
    setError(null);
    try {
      const path = purpose === "register" ? "/v1/auth/register/otp" : "/v1/auth/otp/send";
      const result = await api(path, { method: "POST", body: { phone: form.phone, purpose } });
      setDemo(result.demo_code ? `演示验证码 ${result.demo_code}` : "验证码已发送");
    } catch (err) {
      setError(err);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "register") {
        const answer = form.answer;
        await api("/v1/auth/register", {
          method: "POST",
          body: { ...form, username: form.phone, captcha_id: captcha?.captcha_id, captcha_answer: String(answer), privacy_accepted: true, otp: form.otp },
        });
      } else if (mode === "otp") {
        await api("/v1/auth/login/otp", { method: "POST", body: { phone: form.phone, otp: form.otp } });
      } else if (mode === "reset") {
        await api("/v1/auth/password-reset", { method: "POST", body: { phone: form.phone, otp: form.otp, password: form.password } });
        setMode("password");
        setDemo("密码已重置，请登录");
        return;
      } else {
        await api("/v1/auth/login", { method: "POST", body: { account: form.phone, password: form.password, captcha_id: captcha?.captcha_id, captcha_answer: form.answer } });
      }
      await refresh();
      navigate(usernameMode && mode==="register" ? "/recovery" : returnTo);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="auth-wrap">
      <div>
        <div className="kicker">一个账号走完全站</div>
        <h2>登录 AI 超市</h2>
        {usernameMode && <Link to="/recovery">使用恢复码找回账号</Link>}
        {usernameMode ? <p>用户名为 3 至 32 位字母、数字或下划线，以字母开头。设置 12 至 128 位本站专用密码。</p> : settings && <p>此环境支持手机号登录。</p>}
      </div>
      <form className="card" onSubmit={submit}>
        <div className="tabs">
          {[
            ["password", "密码登录"],
            ["otp", "验证码登录"],
            ["register", "注册"],
            ["reset", "重置密码"],
          ].filter(([key]) => !usernameMode || ["password","register"].includes(key)).map(([key, label]) => (
            <button type="button" key={key} className={mode === key ? "on" : ""} onClick={() => setMode(key)}>{label}</button>
          ))}
        </div>
        <Field label={usernameMode ? "用户名" : "手机号或邮箱"}>
          <input value={form.phone} onChange={(event) => set("phone", event.target.value)} required />
        </Field>
        {mode === "register" ? (
          <Field label="怎么称呼你">
            <input value={form.name} onChange={(event) => set("name", event.target.value)} />
          </Field>
        ) : null}
        {mode !== "otp" ? (
          <Field label={mode === "reset" || mode === "register" ? "设置密码" : "密码"}>
            <input type="password" value={form.password} onChange={(event) => set("password", event.target.value)} required={mode !== "otp"} />
          </Field>
        ) : null}
        {!usernameMode && mode !== "password" ? (
          <Field label="短信验证码">
            <div className="row">
              <input value={form.otp} onChange={(event) => set("otp", event.target.value)} />
              <button className="btn ghost" type="button" onClick={() => send(mode === "register" ? "register" : mode === "reset" ? "reset" : "login")}>获取</button>
            </div>
          </Field>
        ) : null}
        {mode === "register" ? (
          <>
            <Field label="邀请码，可不填">
              <input value={form.invite_code} onChange={(event) => set("invite_code", event.target.value)} />
            </Field>
            <label><input type="checkbox" required />同意 <Link to="/legal/terms-of-service">用户协议</Link> 和 <Link to="/legal/privacy-policy">隐私政策</Link></label>
          </>
        ) : null}
        {(mode === "register" || usernameMode) && captcha && <Field label={captcha.prompt + " = ?"}><input required inputMode="numeric" value={form.answer || ""} onChange={e => set("answer",e.target.value)} /></Field>}
        <Notice error={error}>{demo}</Notice>
        <button className="btn" type="submit">{mode === "register" ? "注册并进入" : mode === "reset" ? "重置密码" : "登录"}</button>
      </form>
    </section>
  );
}

const profileTabs = [
  ["", "概览"],
  ["wallet", "钱包"],
  ["billing", "账单与售后"],
  ["usage", "用量"],
  ["security", "安全"],
  ["invite", "邀请"],
];

export function Profile() {
  const { tab = "" } = useParams();
  const { user, refresh, settings } = useSession();
  const navigate = useNavigate();
  if (user === null) return <NeedLogin />;
  if (!user) return <p>正在读取账号…</p>;
  return (
    <section className="layout">
      <aside className="side">
        <Link to="/recovery">生成一次性恢复码</Link>
        {profileTabs.filter(([key])=>!settings?.capabilities || settings.capabilities.profile_tabs.includes(key)).map(([key, label]) => (
          <Link key={key} className={tab === key ? "active" : ""} to={key ? `/profile/${key}` : "/profile"}>{label}</Link>
        ))}
        <button
          type="button"
          onClick={async () => {
            await api("/v1/auth/logout", { method: "POST", body: {} });
            await refresh();
            navigate("/");
          }}
        >
          退出
        </button>
      </aside>
      <div>
        {tab === "" ? <Overview user={user} /> : null}
        {tab === "wallet" ? <Wallet /> : null}
        {tab === "billing" ? <Billing user={user} /> : null}
        {tab === "usage" ? <Usage /> : null}
        {tab === "security" ? <Security /> : null}
        {tab === "invite" ? <Invite user={user} /> : null}
      </div>
    </section>
  );
}

function NeedLogin() {
  return (
    <section className="section">
      <h2>请先登录</h2>
      <Link className="btn" to="/login?return_to=/profile">去登录</Link>
    </section>
  );
}

function Overview({ user }) {
  return (
    <div className="grid-3">
      <article className="stat"><span className="muted">积分</span><b>{user.wallet?.points ?? 0}</b></article>
      <article className="stat"><span className="muted">会员</span><b>{user.plan?.name}</b></article>
      <article className="stat"><span className="muted">身份</span><b>{user.developerStatus === "approved" ? "开发者" : user.role === "admin" ? "管理员" : "会员"}</b></article>
    </div>
  );
}

function Wallet() {
  const [items, setItems] = useState(null);
  const [error,setError]=useState(null);
  const {settings}=useSession();
  useEffect(() => {
    api("/v1/auth/points-history").then((body) => setItems(body.items)).catch(setError);
  }, []);
  return (
    <article className="card">
      <h3>积分流水</h3>
      <Notice error={error}/>{!error && !items && <p>正在加载流水…</p>}{items?.length===0 && <p>暂无积分流水。</p>}
      <table>
        <thead><tr><th>时间</th><th>类型</th><th>积分</th><th>说明</th></tr></thead>
        <tbody>
          {(items || []).map((item) => (
            <tr key={item.id}><td>{item.createdAt?.slice(0, 16).replace("T", " ")}</td><td>{item.type}</td><td>{item.points}</td><td>{item.reason}</td></tr>
          ))}
        </tbody>
      </table>
      {settings?.capabilities?.recharge!==false && <p><Link to="/recharge">去充值</Link></p>}
    </article>
  );
}

function Billing() {
  const [apps, setApps] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [reason, setReason] = useState("不想继续使用");
  const [error, setError] = useState(null);
  async function load() {
    await Promise.all([api("/v1/auth/apps").then(mine=>setApps(mine.items)), api("/v1/auth/refunds").then(list=>setRefunds(list.items))]);
  }
  useEffect(() => {
    load().catch(setError);
  }, []);
  return (
    <article className="card">
      <h3>已开通应用</h3>
      <Notice error={error} />
      {apps.map((item) => (
        <div className="row" key={item.id} style={{ justifyContent: "space-between" }}>
          <details><summary>{item.snapshot?.name || item.app?.name || item.clientId} · 领取与购买记录</summary>
            {item.snapshot ? <>
              <p>开通时价格：{item.snapshot.pricePoints} 积分 · {item.createdAt?.slice(0,10)}</p>
              <ListingDetails listing={item.snapshot.listing}/>
              {item.delivery_status==="blocked" ? <p>商品交付已暂停，可在此申请售后。</p> : (item.replacementUrl || item.snapshot.listing?.delivery_url) && <a className="btn" href={item.replacementUrl || item.snapshot.listing.delivery_url} target="_blank" rel="noreferrer">{item.replacementUrl?"领取补发版本":"领取购买版本"}</a>}
              <button className="btn ghost" disabled={item.delivery_status==="pending"} onClick={async()=>{
                try{await api("/v1/auth/delivery-report",{method:"POST",body:{entitlement_id:item.id}});await load();}catch(err){setError(err);}
              }}>{item.delivery_status==="pending"?"交付问题处理中":"报告交付链接失效"}</button>
            </> : <p>历史记录未保存成交版本。{item.app?.status === "listed" && <Link to={`/store/${item.clientId}`}>查看商品详情</Link>}</p>}
          </details>
          <button
            className="btn tiny ghost"
            type="button"
            onClick={async () => {
              try {
                await api("/v1/auth/refunds", { method: "POST", body: { entitlement_id: item.id, reason } });
                await load();
              } catch (err) {
                setError(err);
              }
            }}
          >
            申请售后
          </button>
        </div>
      ))}
      <Field label="售后原因"><input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <h3>售后进度</h3>
      {refunds.map((item) => <p key={item.id}>{item.status} · {item.reason}</p>)}
    </article>
  );
}

function Usage() {
  const [data, setData] = useState(null);
  const [error,setError]=useState(null);
  useEffect(() => {
    api("/v1/auth/usage").then(setData).catch(setError);
  }, []);
  return (
    <article className="card">
      <h3>调用记录</h3>
      <Notice error={error}/>{data ? <p className="muted">累计 {data.points || 0} 积分</p> : !error && <p>正在加载用量…</p>}
      <table>
        <tbody>
          {(data?.calls || []).map((item) => (
            <tr key={item.id}><td>{item.createdAt?.slice(0, 16).replace("T", " ")}</td><td>{item.modelKey || item.endpointId}</td><td>{item.points}</td><td>{item.status}</td></tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function Security() {
  const [form, setForm] = useState({ current_password: "", password: "", phone: "", otp: "", email: "" });
  const [demo, setDemo] = useState("");
  const [error, setError] = useState(null);
  const { refresh } = useSession();
  async function run(path, body) {
    setError(null);
    try {
      const result = await api(path, { method: "POST", body });
      if (result.demo_code) setDemo(`演示验证码 ${result.demo_code}`);
      else setDemo("已保存");
      await refresh();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <article className="card">
      <h3>安全设置</h3>
      <Notice error={error}>{demo}</Notice>
      <Field label="当前密码"><input type="password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} /></Field>
      <Field label="新密码"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
      <button className="btn" type="button" onClick={() => run("/v1/auth/security/password", { current_password: form.current_password, password: form.password })}>修改密码</button>
      <hr />
      <Field label="新手机号"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => run("/v1/auth/security/phone-otp", { phone: form.phone })}>获取验证码</button>
        <input placeholder="验证码" value={form.otp} onChange={(event) => setForm({ ...form, otp: event.target.value })} />
        <button className="btn" type="button" onClick={() => run("/v1/auth/security/phone", { phone: form.phone, otp: form.otp })}>更换手机号</button>
      </div>
      <Field label="邮箱"><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
      <button className="btn ghost" type="button" onClick={() => run("/v1/auth/security/email", { email: form.email })}>保存邮箱</button>
    </article>
  );
}

function Invite({ user }) {
  const [info, setInfo] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/v1/auth/referral-attribution").then(setInfo).catch(setError);
  }, []);
  return (
    <article className="card">
      <h3>我的邀请码</h3>
      <p className="price">{user.invite_code}</p>
      <p className="muted">邀请人：{info?.invited_by || "还没有"}。改绑只能做一次。</p>
      <Notice error={error} />
      <div className="row">
        <input value={code} placeholder="对方的邀请码" onChange={(event) => setCode(event.target.value)} />
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              await api("/v1/auth/referral-attribution/rebind", { method: "POST", body: { invite_code: code } });
              setInfo(await api("/v1/auth/referral-attribution"));
            } catch (err) {
              setError(err);
            }
          }}
        >
          改绑
        </button>
      </div>
    </article>
  );
}
