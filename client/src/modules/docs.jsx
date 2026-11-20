import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Markdown, Notice } from "../shell/ui";
import listingGuide from "../../../docs/商品上架规范.md?raw";

export function Docs() {
  const params = useParams();
  const kind = params["*"] || "";
  return (
    <section className="layout">
      <aside className="side">
        <Link to="/docs">总览</Link>
        <Link to="/docs/models">模型列表</Link>
        <Link to="/docs/models/pricing">模型价格</Link>
        <Link to="/docs/api">数据 API</Link>
        <Link to="/docs/listing">商品上架规范</Link>
        <Link to="/docs/billing/recharge">积分充值</Link>
        <Link to="/docs/billing/membership">会员升级</Link>
        <a href="/llms.txt">llms.txt</a>
        <a href="/openapi.json">OpenAPI</a>
        <a href="/developer-integration-guide.md">接入指南</a>
        <a href="/examples/api-key-invoke.mjs" download>下载模型调用示例</a>
        <a href="/examples/oauth-pkce.mjs" download>下载 OAuth 接入示例</a>
      </aside>
      <article className="card">
        <DocBody kind={kind} />
      </article>
    </section>
  );
}

function DocBody({ kind }) {
  if (!kind) return <Overview />;
  if (kind === "listing") return <article style={{whiteSpace:"pre-wrap"}}>{listingGuide}</article>;
  if (kind === "models") return <ModelList />;
  if (kind === "models/pricing") return <Pricing />;
  if (kind.startsWith("models/")) return <ModelDoc modelKey={kind.slice("models/".length)} />;
  if (kind === "api") return <ApiList />;
  if (kind.startsWith("api/")) return <ApiDoc rest={kind.slice(4)} />;
  if (kind === "billing/recharge") return <Markdown text={"# 积分充值\n\n创建订单：POST /v1/auth/payments/recharge-package 或 POST /v1/payments/recharge。\n\n收银台确认后，订单 status 变为 paid，积分才会入账。不要解析支付链接，以订单状态为准。\n\n优惠券在下单时传入 coupon_code。演示券 WELCOME100 加赠 100 积分。"} />;
  if (kind === "billing/membership") return <Markdown text={"# 会员升级\n\nGET /v1/platform/membership-plans 读取方案。\n\nPOST /v1/auth/membership/orders 创建升级订单。免费方案会立即生效。\n\nPOST /v1/auth/membership/downgrade 用于降级。已开通应用数超过新等级上限时会被拒绝。"} />;
  return <p>没有这一页。</p>;
}

function Overview() {
  return (
    <>
      <h2>接入文档</h2>
      <p>先创建 API Key，保存明文，再调用确认接口。Authorization 和 X-API-Key 只能带一个。</p>
      <pre>{`curl $ORIGIN/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"stall-chat-flash","messages":[{"role":"user","content":"你好"}]}'`}</pre>
      <p className="muted">余额不足是 402。内容安全未通过是 400。钥匙未确认是 409。</p>
    </>
  );
}

function ModelList() {
  const [items, setItems] = useState([]);
  useEffect(() => { api("/v1/platform/models").then((body) => setItems(body.items)); }, []);
  return (
    <>
      <h2>模型列表</h2>
      {items.map((item) => (
        <p key={item.model_key}><Link to={`/docs/models/${item.model_key}`}>{item.display_name}</Link> · {item.shelf} · {item.default_points_per_call} 积分</p>
      ))}
    </>
  );
}

function Pricing() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/v1/platform/models/pricing").then(setData); }, []);
  return (
    <>
      <h2>模型价格</h2>
      <p className="muted">1 元 = {data?.points_per_cny} 积分</p>
      <table>
        <thead><tr><th>模型</th><th>分类</th><th>计费</th><th>默认积分</th></tr></thead>
        <tbody>
          {(data?.items || []).map((item) => (
            <tr key={item.model_key}><td>{item.display_name}</td><td>{item.shelf}</td><td>{item.billing_unit}</td><td>{item.default_points_per_call}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ModelDoc({ modelKey }) {
  const [doc, setDoc] = useState(null);
  const [prompt, setPrompt] = useState("用一句话介绍这家超市");
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);
  useEffect(() => {
    api(`/v1/platform/models/${modelKey}/documentation`).then(setDoc).catch(setError);
  }, [modelKey]);
  if (!doc) return <Notice error={error} />;
  return (
    <>
      <Markdown text={doc.markdown} />
      <h3>在这里试一次</h3>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button className="btn" type="button" onClick={async () => {
        setError(null);
        try {
          const body = await api("/v1/chat/completions", { method: "POST", body: { model: modelKey, messages: [{ role: "user", content: prompt }] } });
          setOutput(body.choices?.[0]?.message?.content || JSON.stringify(body));
        } catch (err) {
          if (err.code === "unsupported_model_format") {
            try {
              const body = await api("/v1/developer/models/" + modelKey + "/invoke", { method: "POST", body: { input: { prompt } } });
              setOutput(JSON.stringify(body, null, 2));
              return;
            } catch (inner) {
              setError(inner);
              return;
            }
          }
          setError(err);
        }
      }}>调用</button>
      <Notice error={error} />
      {output ? <pre>{output}</pre> : null}
    </>
  );
}

function ApiList() {
  const [text, setText] = useState("");
  useEffect(() => { fetch("/v1/market/documentation").then((response) => response.text()).then(setText); }, []);
  return (
    <>
      <h2>数据 API</h2>
      <p className="muted">这些接口返回本站编写的样例，不会去请求外部平台。</p>
      <pre>{text}</pre>
    </>
  );
}

function ApiDoc({ rest }) {
  const [supplier, key] = rest.split("/");
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    if (key) api(`/v1/market/endpoints/${supplier}/${key}/documentation`).then(setDoc);
    else api(`/v1/market/endpoints?supplier=${supplier}&page_size=50`).then(setDoc);
  }, [supplier, key]);
  if (!key) {
    return (
      <>
        <h2>{supplier}</h2>
        {(doc?.items || []).map((item) => <p key={item.id}><Link to={`/docs/api/${supplier}/${item.endpointKey}`}>{item.name}</Link> · {item.points} 积分</p>)}
      </>
    );
  }
  return doc ? <Markdown text={doc.markdown} /> : <p>读取中…</p>;
}
