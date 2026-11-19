import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./shell/layout";
import { SessionProvider } from "./shell/session";
import { Home } from "./modules/home";
import { AppDetail, Store } from "./modules/store";
import { Membership, Pay, Recharge } from "./modules/billing";
import { Login, Profile } from "./modules/identity";
import { Developer, DeveloperApply } from "./modules/developer";
import { Docs } from "./modules/docs";
import { Admin } from "./modules/admin";
import { About, Design, Invoke, Legal, OAuth, OAuthCallback } from "./modules/pages";

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="store" element={<Store />} />
          <Route path="store/:id" element={<AppDetail />} />
          <Route path="membership" element={<Membership />} />
          <Route path="recharge" element={<Recharge />} />
          <Route path="pay/:outTradeNo" element={<Pay />} />
          <Route path="login" element={<Login />} />
          <Route path="register-developer" element={<DeveloperApply />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/:tab" element={<Profile />} />
          <Route path="billing" element={<Navigate to="/profile/billing" replace />} />
          <Route path="developer" element={<Developer />} />
          <Route path="developer/:tab" element={<Developer />} />
          <Route path="docs" element={<Docs />} />
          <Route path="docs/*" element={<Docs />} />
          <Route path="oauth/authorize" element={<OAuth />} />
          <Route path="oauth/callback" element={<OAuthCallback />} />
          <Route path="oauth/login" element={<Navigate to="/login" replace />} />
          <Route path="legal/terms-of-service" element={<Legal />} />
          <Route path="legal/privacy-policy" element={<Legal />} />
          <Route path="about" element={<About />} />
          <Route path="design" element={<Design />} />
          <Route path="invoke" element={<Invoke />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/*" element={<Admin />} />
          <Route path="*" element={<section className="section"><h2>没有这一页</h2><a href="/">回首页</a></section>} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
