import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, yuan } from "../api";
import { useSession } from "../shell/session";
import { Notice, PageTitle } from "../shell/ui";

export function Membership() {
  const { user, refresh } = useSession();
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/v1/platform/membership-plans").then((body) => setPlans(body.items)).catch(setError);
  }, []);

  async function choose(plan) {
    if (!user) return (window.location.href = "/login?return_to=/membership");
    setError(null);
    try {
      if (user.plan && plan.member_level < user.plan.member_level) {
        await api("/v1/auth/membership/downgrade", { method: "POST", body: { plan_id: plan.id } });
        await refresh();
        return;
      }
      const result = await api("/v1/auth/membership/orders", { method: "POST", body: { plan_id: plan.id, channel: "wechat" } });
      if (result.billing_url) window.location.href = result.billing_url;
      else await refresh();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <PageTitle kicker="MEMBERSHIP" title="会员中心">
        当前：{user?.plan?.name || "未登录"}
      </PageTitle>
      <Notice error={error} />
      <div className="grid-4">
        {plans.map((plan) => (
          <article className="plan" key={plan.id}>
            <div className="faint">LV.{plan.member_level}</div>
            <h3>{plan.name}</h3>
            <div className="price">{yuan(plan.price_cents)}</div>
            <p className="muted">{plan.description}</p>
            <ul>
              {plan.benefits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button className="btn" type="button" onClick={() => choose(plan)}>
              {user?.plan?.id === plan.id ? "当前方案" : plan.member_level < (user?.plan?.member_level || 0) ? "降级" : "开通"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Pay() {
  const {settings} = useSession();
  const live = settings?.login?.primary_login_method === "username_password";
  const [qr,setQr] = useState("");
  const { outTradeNo } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [channel, setChannel] = useState("wechat");
  const [error, setError] = useState(null);
  useEffect(() => {
    api(`/v1/payments/orders/${outTradeNo}`).then(setOrder).catch(setError);
  }, [outTradeNo]);

  async function confirm() {
    setError(null);
    try {
      const result = await api(`/v1/payments/orders/${outTradeNo}/confirm`, { method: "POST", body: { channel } });
      setOrder(result.order);
    } catch (err) {
      setError(err);
    }
  }
  useEffect(() => {
    if (!qr || order?.status !== "pending") return;
    const timer = setInterval(() => api(`/v1/payments/orders/${outTradeNo}`).then(setOrder).catch(setError), 3000);
    return () => clearInterval(timer);
  },[qr,order?.status,outTradeNo]);

  if (!order) return <section className="section"><Notice error={error} />{error ? null : <p>正在读取订单…</p>}</section>;
  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <article className="card" style={{ maxWidth: 560 }}>
        <div className="faint">{live ? "商户收银台" : "演示收银台"}</div>
        <h2>{order.title}</h2>
        <p className="price">{yuan(order.amount_cents)}</p>
        <p className="muted">状态：{({pending:"待付款",paid:"支付成功",closed:"已关闭",paid_unfulfilled:"已收款，待处理交付或退款",refunded:"已原路退款"})[order.status] || order.status}</p>
        <p className="muted">{live ? "请在支付应用中核对商户和金额。支付平台确认到账后，订单状态会自动更新。" : "本地演示订单。"}</p>
        <Notice error={error} />
        {order.status === "pending" ? (
          live ? <><button className="btn" onClick={() => api(`/v1/payments/orders/${outTradeNo}/checkout`,{method:"POST"}).then(r=>setQr(r.qr)).catch(setError)}>获取付款码</button>{qr && <img alt="商户付款二维码" src={qr}/>}</> : <>
            <div className="tabs">
              <button type="button" className={channel === "wechat" ? "on" : ""} onClick={() => setChannel("wechat")}>微信支付</button>
              <button type="button" className={channel === "alipay" ? "on" : ""} onClick={() => setChannel("alipay")}>支付宝</button>
            </div>
            <button className="btn" type="button" onClick={confirm}>我已完成演示支付</button>
          </>
        ) : (
          <div className="row">
            <button className="btn" type="button" onClick={() => navigate(order.kind==="app"?"/profile/billing":"/profile/wallet")}>{order.kind==="app"?"查看领取与售后":"查看钱包"}</button>
            <Link className="btn ghost" to="/store">继续逛</Link>
          </div>
        )}
      </article>
    </section>
  );
}
