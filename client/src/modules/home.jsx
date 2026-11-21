import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Notice } from "../shell/ui";

export function Home() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/v1/platform/apps?page_size=3").then(setCatalog).catch(setError);
  }, []);
  return (
    <section className="hero">
      <div>
        <h1>AI 超市</h1>
        <p className="lede">浏览网页应用、API 服务和数字资源。商品页列出使用条件、授权范围和交付方式。</p>
        <div className="row">
          <Link className="btn" to="/store">浏览商品</Link>
          <Link className="btn ghost" to="/register-developer">申请成为卖家</Link>
        </div>
      </div>
      <aside className="panel">
        <h2>在架商品{catalog && " · " + catalog.pagination.total}</h2>
        <Notice error={error} />
        {!catalog && !error && <p>正在读取商品…</p>}
        {catalog?.items.map(app => <article key={app.client_id}>
          <h3><Link to={`/store/${app.client_id}`}>{app.name}</Link></h3>
          <p>{app.summary}</p>
        </article>)}
        {catalog?.items.length === 0 && <><p>首批商品征集中。卖家可以先查看填写模板，准备商品说明和交付地址。</p><Link to="/docs/listing">查看商品上架规范 →</Link></>}
      </aside>
    </section>
  );
}
