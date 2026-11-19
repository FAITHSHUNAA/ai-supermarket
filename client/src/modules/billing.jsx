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

export function Recharge() {
  const { user } = useSession();
  const [packs, setPacks] = useState([]);
  const [coupon, setCoupon] = useState("");
  const [custom, setCustom] = useState(20);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/v1/platform/recharge-packages").then((body) => setPacks(body.items)).catch(setError);
  }, []);

  async function buy(body) {
    if (!user) return (window.location.href = "/login?return_to=/recharge");
    setError(null);
    try {
      const result = body.package_id
        ? await api("/v1/auth/payments/recharge-package", { method: "POST", body: { ...body, coupon_code: coupon, channel: "wechat" } })
        : await api("/v1/payments/recharge", { method: "POST", body: { ...body, channel: "wechat" } });
      const trade = result.order?.out_trade_no || result.out_trade_no;
      window.location.href = `/pay/${trade}`;
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <PageTitle kicker="POINTS" title="充值中心">
        余额 {user?.wallet?.points ?? "—"} 积分
      </PageTitle>
      <Notice error={error} />
      <FieldCoupon coupon={coupon} setCoupon={setCoupon} />
      <div className="grid-4">
        {packs.map((pack) => (
          <article className="pack" key={pack.id}>
            <h3>{pack.name}</h3>
            <div className="price">{yuan(pack.cny_cents)}</div>
            <p className="muted">{pack.points} 积分</p>
            <p className="muted">{pack.description}</p>
            <button className="btn" type="button" onClick={() => buy({ package_id: pack.id })}>去收银台</button>
          </article>
        ))}
      </div>
      <article className="card" style={{ marginTop: 16 }}>
        <h3>自定义金额</h3>
        <p className="muted">按当前汇率换算，1 元默认等于 100 积分。</p>
        <input type="number" min="1" value={custom} onChange={(event) => setCustom(event.target.value)} />
        <button className="btn" type="button" onClick={() => buy({ cny_cents: Math.round(Number(custom) * 100) })}>充值</button>
      </article>
    </section>
  );
}

function FieldCoupon({ coupon, setCoupon }) {
  return (
    <label className="field" style={{ maxWidth: 280 }}>
      <span>优惠券</span>
      <input value={coupon} placeholder="例如 WELCOME100" onChange={(event) => setCoupon(event.target.value)} />
    </label>
  );
}

export function Pay() {
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

  if (!order) return <section className="section"><Notice error={error} />{error ? null : <p>正在读取订单…</p>}</section>;
  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <article className="card" style={{ maxWidth: 560 }}>
        <div className="faint">演示收银台</div>
        <h2>{order.title}</h2>
        <p className="price">{yuan(order.amount_cents)}</p>
        <p className="muted">到账 {order.points} 积分 · 状态 {order.status}</p>
        <p className="muted">这里不会唤起真实的微信或支付宝。确认后只在本站记账，用来走通充值、会员和应用购买。</p>
        <Notice error={error} />
        {order.status === "pending" ? (
          <>
            <div className="tabs">
              <button type="button" className={channel === "wechat" ? "on" : ""} onClick={() => setChannel("wechat")}>微信支付</button>
              <button type="button" className={channel === "alipay" ? "on" : ""} onClick={() => setChannel("alipay")}>支付宝</button>
            </div>
            <button className="btn" type="button" onClick={confirm}>我已完成演示支付</button>
          </>
        ) : (
          <div className="row">
            <button className="btn" type="button" onClick={() => navigate("/profile/wallet")}>查看钱包</button>
            <Link className="btn ghost" to="/store">继续逛</Link>
          </div>
        )}
      </article>
    </section>
  );
}
