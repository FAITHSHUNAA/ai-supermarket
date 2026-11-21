import { ListingDetails } from "./listing";
import { DetailLink } from "../shell/detail";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../shell/session";
import { Empty, Notice, PageTitle } from "../shell/ui";

export function Store() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const grid = useRef(null);
  const [loading,setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const keyword = params.get("keyword") || "";
  const category = params.get("category") || "";
  const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  const [search, setSearch] = useState(keyword);
  useEffect(() => setSearch(keyword), [keyword]);
  function filter(key, value) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  useEffect(() => {
    api("/v1/platform/application-categories").then((body) => setCategories(body.items)).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page_size: "24", page: String(page) });
    if (keyword) query.set("keyword", keyword);
    if (category) query.set("category", category);
    api(`/v1/platform/apps?${query}`)
      .then(body => {
        if (!active) return;
        const update = () => {
          if (active) {setData(body); setLoading(false);}
        };
        if (grid.current?.childElementCount && document.startViewTransition && !document.querySelector("dialog[open]") && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
          document.startViewTransition(() => flushSync(update));
        } else update();
      })
      .catch(err => { if (active) {setLoading(false);setData(null);setError(err);} });
    return () => { active = false; };
  }, [keyword, category, page]);

  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <PageTitle kicker="AI ECOSYSTEM" title="AI 超市">
        发现已上架的应用，用一个账号开通更多工具。
      </PageTitle>
      <form className="toolbar" role="search" onSubmit={event => {event.preventDefault(); filter("keyword", search.trim());}}>
        <input
          style={{ maxWidth: 280 }}
          placeholder="搜索应用"
          aria-label="搜索应用"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <button className="btn" type="submit">搜索</button>
        <select
          aria-label="商品分类"
          style={{ maxWidth: 220 }}
          value={category}
          onChange={(event) => {
            filter("category", event.target.value);
          }}
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.parentId ? `· ${item.name}` : item.name}
            </option>
          ))}
        </select>
        {(keyword || category || page > 1) && <Link to="/store">清除筛选</Link>}
      </form>
      <Notice error={error} />
      {!data && loading ? <p className="muted" role="status">正在读取已上架应用…</p> : null}
      {data && data.items.length === 0 ? <Empty>{keyword || category || page > 1 ? "没有找到商品，可以调整筛选条件。" : <>目前还没有在售商品。<Link to="/docs/listing">查看上架规范</Link></>}</Empty> : null}
      <div className="grid-3" ref={grid} aria-busy={loading}>
        {(data?.items || []).map((app) => (
          <DetailLink className="app-card" style={{viewTransitionName:"product-"+CSS.escape(app.client_id)}} key={app.client_id} to={`/store/${app.client_id}`}>
            <div className="faint">{app.category?.name || "未分类"}</div>
            <h3>{app.name}</h3>
            <p className="muted">{app.summary}</p>
            <div className="tags">
              {(app.tags || []).map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </div>
            <strong>{app.commercial_offer ? (app.commercial_offer.price_points ? `${app.commercial_offer.price_points} 积分` : "免费开通") : "暂无报价"}</strong>
          </DetailLink>
        ))}
      </div>
      {data && (page > 1 || data.pagination.total_pages > 1) && <nav className="row" aria-label="商品分页">
        <button disabled={page <= 1} onClick={() => filter("page",String(page - 1))}>上一页</button>
        <span>第 {page} 页，共 {data.pagination.total_pages} 页</span>
        <button disabled={page >= data.pagination.total_pages} onClick={() => filter("page",String(page + 1))}>下一页</button>
      </nav>}
    </section>
  );
}

export function AppDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("帮我起三个标题");
  const [output, setOutput] = useState("");
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    api("/v1/platform/payment-channels").then(result => setChannels(result.items || [])).catch(setError);
  }, []);

  function load() {
    return api(`/v1/platform/apps/${id}`).then(setApp).catch(setError);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function buy(channel) {
    setError(null);
    try {
      const result = await api("/v1/auth/app-purchases/orders", { method: "POST", body: { client_id: id, channel } });
      if (result.status === "pending") {
        window.location.href = result.billing_url;
        return;
      }
      setMessage("已经开通");
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function run() {
    setError(null);
    try {
      const model = app.experience?.modelKey || "stall-chat-flash";
      if (app.experience?.type === "image") {
        const body = await api("/v1/images/generations", { method: "POST", body: { model, prompt } });
        setOutput(body.data[0].url);
      } else {
        const body = await api("/v1/chat/completions", {
          method: "POST",
          body: { model, messages: [{ role: "user", content: prompt }] },
        });
        setOutput(body.choices[0].message.content);
      }
    } catch (err) {
      setError(err);
    }
  }

  if (!app) return <section className="section"><Notice error={error} />{error ? null : <p>正在打开应用…</p>}</section>;
  const price = app.commercial_offer?.price_points ?? null;
  return (
    <section className="section" style={{ paddingTop: 36 }}>
      <div className="faint">{app.category?.name} · 开发者 {app.developer?.name}</div>
      <h2>{app.name}</h2>
      <p className="lede">{app.description}</p>
      <ListingDetails listing={app.commercial_offer?.listing} />
      <Notice error={error}>{message}</Notice>
      <div className="grid-2">
        <article className="card">
          <div className="price">{price === 0 ? "免费" : price === null ? "未标价" : `${price} 积分`}</div>
          <p className="muted">最低会员等级 {app.min_member_level}</p>
          {app.owned ? <p>你已开通这个应用。</p> : null}
          {!user ? <Link className="btn" to={`/login?return_to=/store/${id}`}>登录后开通</Link> : null}
          {user && !app.owned && price !== null ? (
            <div className="row">
              <button className="btn" type="button" onClick={() => buy("points")}>用积分开通</button>
              {price > 0 && channels.filter(item => ["wechat","alipay"].includes(item.channel)).map(item => <button key={item.channel} className="btn ghost" type="button" onClick={() => buy(item.channel)}>{item.name}</button>)}
            </div>
          ) : null}
          {user ? (
            <p>
              <Link to="/profile/billing">申请售后</Link>
            </p>
          ) : null}
        </article>
        <article className="card">
          {app.commercial_offer?.listing ? <><h3>商品交付</h3>{app.delivery_url ? <a className="btn" href={app.delivery_url} target="_blank" rel="noreferrer">打开交付入口</a> : <p>开通后可领取。</p>}</> : <><h3>打开体验</h3>
          <p className="muted">体验会计入你的积分。未登录不能调用。</p>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <button className="btn" type="button" onClick={run}>发送</button>
          {output.startsWith("/v1/") ? <img className="poster" alt="生成结果" src={output} /> : <div className="bubble">{output}</div>}</>}
        </article>
      </div>
    </section>
  );
}
