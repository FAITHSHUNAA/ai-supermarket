import { Dock } from "./dock";
import { useSurfaceMotion } from "./motion";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useSession } from "./session";


export function Layout() {
  const { user, settings, catalogOnly } = useSession();
  const { pathname } = useLocation();
  const publicPage = /^\/(?:$|store(?:\/|$)|docs(?:\/|$)|legal\/|about$|design$|membership$|recharge$)/.test(pathname);
  useSurfaceMotion(pathname);
  const brand = settings?.brand_name || "AI 超市";
  return (
    <div className="shell">
      <a className="skip" href="#app-content">
        跳到主要内容
      </a>
      <header className="nav">
        <Link className="brand" to="/">
          <img src="/favicon.svg" alt="" />
          <span>
            <strong>{brand}</strong>
            <small>AI MARKET</small>
          </span>
        </Link>
        <Dock />
        <div className="nav-side">
          <NavLink to="/register-developer">开发者中心</NavLink>
          {user ? (
            <NavLink className="btn tiny" to="/profile">
              {user.name}
            </NavLink>
          ) : (
            <NavLink className="btn tiny" to="/login">
              登录
            </NavLink>
          )}

        </div>
      </header>
      <main id="app-content" className="page">
        {catalogOnly && <p className="notice">当前开放商品目录与文档。账号、上架申请和交易尚未开放。 <Link to="/docs/listing">查看上架规范</Link></p>}
        {catalogOnly && !publicPage ? <Link className="btn" to="/store">浏览商品目录</Link> : <div className="route-view" key={pathname}><Outlet /></div>}
      </main>
      <footer className="footer">
        <div>
          <strong>{brand}</strong>
          <p>{settings?.description || "发现 AI 应用、调用模型，一站管理会员与积分。"}</p>
          <p className="faint">{settings?.filing_text}</p>
        </div>
        <div>
          <h2>产品服务</h2>
          <ul>
            <li><Link to="/store">应用商店</Link></li>
            <li><Link to="/recharge">充值中心</Link></li>
            <li><Link to="/membership">订阅服务</Link></li>
            <li><Link to="/profile">个人中心</Link></li>
          </ul>
        </div>
        <div>
          <h2>开发者资源</h2>
          <ul>
            <li><Link to="/docs">接入文档</Link></li>
            <li><Link to="/register-developer">入驻成为开发者</Link></li>
            <li><Link to="/developer">开发者控制台</Link></li>
            <li><Link to="/design">设计规范</Link></li>
          </ul>
        </div>
        <div>
          <h2>关于与支持</h2>
          <ul>
            <li><Link to="/about">关于我们</Link></li>
            <li><Link to="/legal/terms-of-service">用户协议</Link></li>
            <li><Link to="/legal/privacy-policy">隐私政策</Link></li>
            <li><Link to="/admin">管理后台</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
