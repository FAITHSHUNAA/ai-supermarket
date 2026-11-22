import { ListingDetails } from "./listing";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, yuan } from "../api";
import { useSession } from "../shell/session";
import { Notice } from "../shell/ui";

const sections = [
  ["", "总览"],
  ["users", "用户"],
  ["administrators", "管理员"],
  ["permission-groups", "权限组"],
  ["developers", "开发者审核"],
  ["developer-api-keys", "开发者钥匙"],
  ["developer-policy", "开发者策略"],
  ["developer-approval-bonus", "审核奖励"],
  ["clients", "应用"],
  ["application-categories", "应用分类"],
  ["application-offers", "报价审核"],
  ["application-purchases", "购买订单"],
  ["application-after-sales", "售后"],
  ["application-hosting", "托管实例"],
  ["hosting-nodes", "托管节点"],
  ["hosting-plans", "托管方案"],
  ["hosting-settings", "托管准入"],
  ["model-providers", "模型供应商"],
  ["model-settings", "模型设置"],
  ["pricing", "模型价格"],
  ["token-prices", "Token 价格"],
  ["point-exchange-rates", "积分汇率"],
  ["shadow-billing", "影子计费"],
  ["payment-orders", "支付订单"],
  ["payment-channels", "支付渠道"],
  ["recharge-packages", "充值套餐"],
  ["membership-plans", "会员方案"],
  ["coupons", "优惠券"],
  ["promoter-applications", "推广员"],
  ["referral-settings", "邀请设置"],
  ["referral-attributions", "邀请关系"],
  ["revenue-split-rules", "分成规则"],
  ["revenue-statements", "月结单"],
  ["revenue-settlements", "线下结算"],
  ["revenue-report", "收入报表"],
  ["content-safety", "内容安全"],
  ["audit-logs", "审计"],
  ["access-logs", "访问日志"],
  ["user-events", "用户事件"],
  ["generation-logs", "调用日志"],
  ["api-market", "数据接口"],
  ["api-usage-repair", "调用修复"],
  ["wallet-generation", "钱包代际"],
  ["risk-flags", "风险标记"],
  ["imports", "导入"],
  ["legal-documents", "法律文书"],
  ["system-settings", "系统设置"],
];

export function Admin() {
  const { user } = useSession();
  const location = useLocation();
  const section = location.pathname.replace(/^\/admin\/?/, "");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    setData(await api("/v1/admin/snapshot"));
  }
  useEffect(() => {
    if (user?.role === "admin") load().catch(setError);
  }, [user]);

  async function act(body) {
    setError(null);
    try {
      await api("/v1/admin/actions", { method: "POST", body });
      setMessage("已保存");
      await load();
    } catch (err) {
      setError(err);
    }
  }

  if (user === undefined) return <p>正在确认身份…</p>;
  if (!user || user.role !== "admin") {
    return (
      <section className="section">
        <h2>管理后台</h2>
        <p className="muted">需要管理员账号。演示账号 13800000001 / Admin#123456。</p>
        <Link className="btn" to="/login?return_to=/admin">登录</Link>
      </section>
    );
  }

  return (
    <section className="layout">
      <aside className="side" style={{ maxHeight: "70vh", overflow: "auto" }}>
        {sections.map(([key, label]) => (
          <Link key={key || "home"} className={section === key ? "active" : ""} to={key ? `/admin/${key}` : "/admin"}>{label}</Link>
        ))}
      </aside>
      <div>
        <Notice error={error}>{message}</Notice>
        {data ? <Section section={section} data={data} act={act} /> : <p>正在读取后台…</p>}
      </div>
    </section>
  );
}

function Section({ section, data, act }) {
  const report = data.report;
  if (!section) {
    return (
      <div className="grid-4">
        <Stat label="用户" value={report.users} />
        <Stat label="上架应用" value={report.listed_apps} />
        <Stat label="开发者" value={report.developers} />
        <Stat label="已支付" value={yuan(report.paid_cents)} />
      </div>
    );
  }
  if (section === "users") return <Users data={data} act={act} />;
  if (section === "developers") return <Developers data={data} act={act} />;
  if (section === "application-offers") return <Offers data={data} act={act} />;
  if (section === "application-after-sales") return <Refunds data={data} act={act} />;
  if (section === "revenue-settlements") return <SettlementAdmin data={data} act={act} />;
  if (section === "system-settings" || section === "developer-policy" || section === "hosting-settings" || section === "referral-settings") return <Settings data={data} act={act} />;
  if (section === "legal-documents") return <LegalAdmin data={data} act={act} />;
  if (section === "content-safety") return <Keywords data={data} act={act} />;
  if (section === "imports") return <Imports act={act} />;
  if (section === "wallet-generation") return <Windows data={data} act={act} />;
  if (section === "point-exchange-rates") return <Rates data={data} act={act} />;
  if (section === "model-settings" || section === "pricing") return <ModelAdmin data={data} act={act} />;
  if (section === "revenue-report") return <pre>{JSON.stringify(data.report, null, 2)}</pre>;
  if (section === "payment-channels") return <p>演示收银台提供微信支付、支付宝和积分余额。真实商户号可在后续接入，当前确认按钮只改本站订单。</p>;
  return <Generic section={section} data={data} act={act} />;
}

function Stat({ label, value }) {
  return <article className="stat"><span className="muted">{label}</span><b>{value}</b></article>;
}

function Users({ data, act }) {
  const [points, setPoints] = useState(100);
  return (
    <Table
      rows={data.users}
      columns={["name", "phone", "role", "status"]}
      render={(user) => (
        <>
          <td>{user.name}<div className="faint">{user.phone}</div></td>
          <td>{user.role}</td>
          <td>{user.plan?.name}</td>
          <td>{user.wallet?.points}</td>
          <td className="row">
            <button className="btn tiny ghost" type="button" onClick={() => act({ type: "user.status", user_id: user.id, status: user.status === "active" ? "disabled" : "active" })}>{user.status === "active" ? "停用" : "启用"}</button>
            <button className="btn tiny" type="button" onClick={() => act({ type: "user.points", user_id: user.id, points: Number(points), reason: "后台调整" })}>加 {points}</button>
          </td>
        </>
      )}
      extra={<input style={{ maxWidth: 120 }} type="number" value={points} onChange={(event) => setPoints(event.target.value)} />}
    />
  );
}

function Developers({ data, act }) {
  return (
    <Table
      rows={data.users.filter((user) => user.developerStatus !== "none")}
      render={(user) => (
        <>
          <td>{user.name}</td>
          <td>{user.developerStatus}</td>
          <td className="row">
            <button className="btn tiny" type="button" onClick={() => act({ type: "developer.review", user_id: user.id, approve: true })}>通过</button>
            <button className="btn tiny ghost" type="button" onClick={() => act({ type: "developer.review", user_id: user.id, approve: false })}>拒绝</button>
          </td>
        </>
      )}
    />
  );
}

function Offers({ data, act }) {
  return (
    <Table
      rows={data.offers}
      render={(offer) => (
        <>
          <td>{data.clients.find(item => item.client_id === offer.clientId)?.name || offer.clientId}<ListingDetails listing={offer.listing} />{offer.listing && <a href={offer.listing.delivery_url} target="_blank" rel="noreferrer">检查交付入口</a>}{offer.reason && <p>{offer.reason}</p>}</td>
          <td>{offer.pricePoints}{offer.reviewNotes && <p>审核备注：{offer.reviewNotes}</p>}</td>
          <td>{offer.status}</td>
          <td className="row">
            <button className="btn tiny" type="button" disabled={offer.status !== "pending" || !offer.listing} onClick={() => act({ type: "offer.review", id: offer.id, approve: true })}>通过并上架</button>
            <button className="btn tiny ghost" type="button" disabled={offer.status !== "pending"} onClick={() => { const reason = window.prompt("请说明需要修改的内容"); if (reason?.trim()) act({ type: "offer.review", id: offer.id, approve: false, reason }); }}>拒绝</button>
          </td>
        </>
      )}
    />
  );
}

function Refunds({ data, act }) {
  return (
    <Table
      rows={data.refunds}
      render={(item) => (
        <>
          <td>{item.clientId}</td>
          <td>{item.reason}</td>
          <td>{item.status}</td>
          <td className="row">
            <button className="btn tiny" type="button" onClick={() => act({ type: "refund.review", id: item.id, approve: true })}>退款</button>
            <button className="btn tiny ghost" type="button" onClick={() => act({ type: "refund.review", id: item.id, approve: false })}>驳回</button>
          </td>
        </>
      )}
    />
  );
}

function SettlementAdmin({ data, act }) {
  return (
    <>
      <a href="/v1/admin/offline-settlement-requests/export.csv">导出 CSV</a>
      <Table
        rows={data.settlements}
        render={(item) => (
          <>
            <td>{item.requestNo}</td>
            <td>{yuan(item.amountCents)}</td>
            <td>{item.status}</td>
            <td className="row">
              <button className="btn tiny ghost" type="button" onClick={() => act({ type: "settlement", request_no: item.requestNo, action: "start" })}>开始</button>
              <button className="btn tiny" type="button" onClick={() => act({ type: "settlement", request_no: item.requestNo, action: "paid" })}>记为已付</button>
              <button className="btn tiny danger" type="button" onClick={() => act({ type: "settlement", request_no: item.requestNo, action: "reject" })}>驳回</button>
            </td>
          </>
        )}
      />
    </>
  );
}

function Settings({ data, act }) {
  const [form, setForm] = useState(data.settings);
  return (
    <article className="card">
      <label className="field">品牌名<input value={form.brandName || ""} onChange={(event) => setForm({ ...form, brandName: event.target.value })} /></label>
      <label className="field">一句话<input value={form.tagline || ""} onChange={(event) => setForm({ ...form, tagline: event.target.value })} /></label>
      <label className="field">备案文案<input value={form.filingText || ""} onChange={(event) => setForm({ ...form, filingText: event.target.value })} /></label>
      <label className="field">1 元等于多少积分<input type="number" value={form.pointsPerCny || 100} onChange={(event) => setForm({ ...form, pointsPerCny: Number(event.target.value) })} /></label>
      <label className="field"><span>会员可购买</span><input type="checkbox" checked={!!form.membershipSalesEnabled} onChange={(event) => setForm({ ...form, membershipSalesEnabled: event.target.checked })} /></label>
      <label className="field"><span>托管看会员等级</span><input type="checkbox" checked={!!form.hostingAdmissionEnabled} onChange={(event) => setForm({ ...form, hostingAdmissionEnabled: event.target.checked })} /></label>
      <label className="field"><span>页面上显示演示验证码</span><input type="checkbox" checked={!!form.demoExposeOtp} onChange={(event) => setForm({ ...form, demoExposeOtp: event.target.checked })} /></label>
      <button className="btn" type="button" onClick={() => act({ type: "settings.save", patch: form })}>保存设置</button>
    </article>
  );
}

function LegalAdmin({ data, act }) {
  const [terms, setTerms] = useState(data.legal.terms);
  const [privacy, setPrivacy] = useState(data.legal.privacy);
  return (
    <article className="card">
      <label className="field">用户协议<textarea style={{ minHeight: 160 }} value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
      <label className="field">隐私政策<textarea style={{ minHeight: 160 }} value={privacy} onChange={(event) => setPrivacy(event.target.value)} /></label>
      <button className="btn" type="button" onClick={() => act({ type: "legal.save", terms, privacy })}>发布文书</button>
    </article>
  );
}

function Keywords({ data, act }) {
  const [word, setWord] = useState("");
  return (
    <article className="card">
      <div className="row">
        <input value={word} onChange={(event) => setWord(event.target.value)} placeholder="敏感词" />
        <button className="btn" type="button" onClick={() => act({ type: "keyword.save", word, enabled: true })}>添加</button>
      </div>
      {data.keywords.map((item) => <p key={item.id}>{item.word}</p>)}
    </article>
  );
}

function Imports({ act }) {
  const [csv, setCsv] = useState("phone,name\n13700000001,导入用户");
  const [result, setResult] = useState(null);
  return (
    <article className="card">
      <textarea value={csv} onChange={(event) => setCsv(event.target.value)} />
      <div className="row">
        <button className="btn ghost" type="button" onClick={async () => setResult(await api("/v1/admin/actions", { method: "POST", body: { type: "import.preview", csv } }))}>预览</button>
        <button className="btn" type="button" onClick={async () => setResult(await api("/v1/admin/actions", { method: "POST", body: { type: "import.apply", csv } }))}>导入</button>
      </div>
      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
    </article>
  );
}

function Windows({ data, act }) {
  const [name, setName] = useState("下一代钱包");
  return (
    <article className="card">
      <div className="row">
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button className="btn" type="button" onClick={() => act({ type: "window.create", name })}>开窗口</button>
      </div>
      {data.wallet_windows.map((item) => (
        <div className="row" key={item.id}>
          <span>{item.name} · {item.status}</span>
          <button className="btn tiny ghost" type="button" onClick={() => act({ type: "window.action", id: item.id, action: "start" })}>开始</button>
          <button className="btn tiny ghost" type="button" onClick={() => act({ type: "window.action", id: item.id, action: "drain" })}>迁移一步</button>
          <button className="btn tiny ghost" type="button" onClick={() => act({ type: "window.action", id: item.id, action: "manifest" })}>生成清单</button>
          <button className="btn tiny" type="button" onClick={() => act({ type: "window.action", id: item.id, action: "activate" })}>激活</button>
          <button className="btn tiny danger" type="button" onClick={() => act({ type: "window.action", id: item.id, action: "abandon" })}>放弃</button>
        </div>
      ))}
    </article>
  );
}

function Rates({ data, act }) {
  const [value, setValue] = useState(100);
  const [preview, setPreview] = useState(null);
  return (
    <article className="card">
      <p>当前 1 元 = {data.settings.pointsPerCny} 积分</p>
      <div className="row">
        <input type="number" value={value} onChange={(event) => setValue(event.target.value)} />
        <button className="btn ghost" type="button" onClick={async () => setPreview(await api("/v1/admin/actions", { method: "POST", body: { type: "fx.preview", points_per_cny: Number(value) } }))}>预览</button>
        <button className="btn" type="button" onClick={() => act({ type: "fx.save", points_per_cny: Number(value), note: "后台调整" })}>生效</button>
      </div>
      {preview ? <pre>{JSON.stringify(preview, null, 2)}</pre> : null}
      {data.exchange_rates.map((item) => <p key={item.id}>{item.pointsPerCny} · {item.active ? "生效" : "历史"}</p>)}
    </article>
  );
}

function ModelAdmin({ data, act }) {
  return (
    <article className="card">
      {data.models.map((model) => (
        <div className="row" key={model.model_key}>
          <span>{model.display_name}</span>
          <button className="btn tiny ghost" type="button" onClick={() => act({ type: "model.save", model_key: model.model_key, enabled: !model.enabled })}>{model.enabled ? "下架" : "上架"}</button>
        </div>
      ))}
    </article>
  );
}

function Generic({ section, data, act }) {
  const rows = useMemo(() => rowsFor(section, data), [section, data]);
  return (
    <article className="card">
      <h3>{sections.find((item) => item[0] === section)?.[1] || section}</h3>
      {section === "promoter-applications" ? data.promoters.map((item) => (
        <div className="row" key={item.id}>
          <span>{item.userId} · {item.status}</span>
          <button className="btn tiny" type="button" onClick={() => act({ type: "promoter.review", user_id: item.userId, status: "approved" })}>通过</button>
          <button className="btn tiny ghost" type="button" onClick={() => act({ type: "promoter.review", user_id: item.userId, status: "rejected" })}>拒绝</button>
          <button className="btn tiny danger" type="button" onClick={() => act({ type: "promoter.review", user_id: item.userId, status: "revoked" })}>撤销</button>
        </div>
      )) : null}
      {section === "api-usage-repair" ? data.calls.map((item) => (
        <div className="row" key={item.id}>
          <span>{item.id} · {item.points} · {item.status}</span>
          <button className="btn tiny" type="button" onClick={() => act({ type: "call.repair", id: item.id })}>退回积分</button>
        </div>
      )) : null}
      {section === "revenue-statements" ? <button className="btn" type="button" onClick={() => act({ type: "statements.regenerate" })}>重算月结</button> : null}
      {section === "risk-flags" ? <button className="btn" type="button" onClick={() => act({ type: "risk.flag", user_id: data.users[1]?.id, reason: "人工抽查" })}>标记一笔</button> : null}
      {section === "developer-approval-bonus" ? <Bonus act={act} /> : null}
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </article>
  );
}

function Bonus({ act }) {
  const [points, setPoints] = useState(200);
  return (
    <div className="row">
      <input type="number" value={points} onChange={(event) => setPoints(event.target.value)} />
      <button className="btn" type="button" onClick={() => act({ type: "bonus.settings", points: Number(points) })}>设置审核通过奖励</button>
    </div>
  );
}

function Table({ rows, render, extra }) {
  return (
    <article className="card">
      {extra}
      <table><tbody>{rows.map((row) => <tr key={row.id || row.client_id || row.model_key || row.requestNo}>{render(row)}</tr>)}</tbody></table>
    </article>
  );
}

function rowsFor(section, data) {
  const map = {
    administrators: data.users.filter((user) => user.role === "admin"),
    "permission-groups": data.permission_groups,
    "developer-api-keys": data.api_keys,
    clients: data.clients,
    "application-categories": data.categories,
    "application-purchases": data.orders.filter((item) => item.kind === "app"),
    "application-hosting": data.hosting_instances,
    "hosting-nodes": data.hosting_nodes,
    "hosting-plans": data.hosting_plans,
    "model-providers": data.shadow_providers,
    "token-prices": data.token_prices,
    "shadow-billing": data.shadow_providers,
    "payment-orders": data.orders,
    "recharge-packages": data.packages,
    "membership-plans": data.plans,
    coupons: data.coupons,
    "referral-attributions": data.referrals,
    "revenue-split-rules": data.split_rules,
    "revenue-statements": data.statements,
    "audit-logs": data.audit_logs,
    "access-logs": data.access_logs,
    "user-events": data.user_events,
    "generation-logs": data.calls,
    "api-market": data.endpoints,
    "risk-flags": data.risk_flags,
    "promoter-applications": data.promoters,
  };
  return map[section] || { note: "这一屏使用上方按钮操作，原始数据如下。", keys: Object.keys(data) };
}
