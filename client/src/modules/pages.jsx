import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../shell/session";
import { Markdown, Notice } from "../shell/ui";

export function OAuth() {
  const [params] = useSearchParams();
  const { user } = useSession();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api(`/v1/oauth/authorize?${params.toString()}`).then(setInfo).catch(setError);
  }, [params]);
  async function approve() {
    setError(null);
    try {
      const result = await api(`/v1/oauth/authorize/approve?${params.toString()}`, {
        method: "POST",
        body: Object.fromEntries(params.entries()),
      });
      window.location.href = result.redirect_to;
    } catch (err) {
      setError(err);
    }
  }
  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <article className="card" style={{ maxWidth: 640 }}>
        <div className="faint">授权</div>
        <h2>{info?.client?.name || "应用"} 想使用你的 AI 超市账号</h2>
        <p className="muted">范围：{info?.scope}</p>
        <p className="muted">它能读取你的昵称、会员和积分，不能读取密码。</p>
        <Notice error={error} />
        {!user ? <Link className="btn" to={`/login?return_to=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`}>先登录</Link> : <button className="btn" type="button" onClick={approve}>同意并返回</button>}
      </article>
    </section>
  );
}

export function OAuthCallback() {
  const [params] = useSearchParams();
  return (
    <section className="section">
      <h2>已回到应用</h2>
      <p>授权码：<span className="mono">{params.get("code")}</span></p>
      <p className="muted">state：{params.get("state")}</p>
    </section>
  );
}

export function Legal() {
  const [params] = useSearchParams();
  const kind = window.location.pathname.includes("privacy") ? "privacy" : "terms";
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    const path = kind === "privacy" ? "/v1/platform/privacy-policy/current" : "/v1/platform/terms-of-service/current";
    api(path).then(setDoc);
  }, [kind]);
  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <article className="card">{doc ? <Markdown text={doc.markdown} /> : <p>读取中…</p>}</article>
      <span className="faint">{params.get("from") || ""}</span>
    </section>
  );
}

export function About() {
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <div className="faint">ABOUT</div>
      <h2>关于这家超市</h2>
      <p className="lede">这是一个按模块搭起来的 AI 超市：应用货架、模型调用、会员积分、开发者入驻和管理后台。支付、短信和上游模型在没有配置密钥时走演示，规则和正式流程一致。</p>
      <div className="grid-3">
        <article className="quote"><h3>身份</h3><p className="muted">注册、验证码、密码、会话和 OAuth。</p></article>
        <article className="quote"><h3>交易</h3><p className="muted">充值、会员、应用购买、预扣和售后。</p></article>
        <article className="quote"><h3>开发者</h3><p className="muted">钥匙、沙箱、托管、佣金和线下结算。</p></article>
      </div>
    </section>
  );
}

export function Design() {
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <div className="faint">DESIGN</div>
      <h2>设计规范</h2>
      <div className="grid-3">
        <article className="quote"><h3>底色</h3><p className="mono">#05050a</p></article>
        <article className="quote"><h3>强调</h3><p className="mono">#a78bfa / #ddd6ff</p></article>
        <article className="quote"><h3>成功</h3><p className="mono">#3dd68c</p></article>
      </div>
      <p className="muted">内容宽度 1280。卡片圆角 24 到 32。导航是胶囊。标题用大字号，说明用 62% 白色。</p>
      <div className="row">
        <button className="btn" type="button">主要按钮</button>
        <button className="btn ghost" type="button">次要按钮</button>
        <span className="tag">标签</span>
      </div>
    </section>
  );
}

export function Invoke() {
  const [model, setModel] = useState("stall-chat-flash");
  const [prompt, setPrompt] = useState("你好");
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <h2>调用台</h2>
      <label className="field">模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button className="btn" type="button" onClick={async () => {
        setError(null);
        try {
          const body = await api("/v1/developer/models/" + encodeURIComponent(model) + "/invoke", { method: "POST", body: { input: { prompt } } });
          setOutput(JSON.stringify(body, null, 2));
        } catch (err) {
          setError(err);
        }
      }}>调用</button>
      <Notice error={error} />
      {output ? <pre>{output}</pre> : null}
    </section>
  );
}
