import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [settings, setSettings] = useState(null);
  const [catalogOnly, setCatalogOnly] = useState(false);

  async function refresh() {
    const [session, platform] = await Promise.all([api("/v1/auth/session"), api("/v1/platform/system-settings")]);
    setUser(session.user);
    setCatalogOnly(session.catalog_only === true);
    setSettings(platform);
    return session.user;
  }

  useEffect(() => {
    refresh().catch(() => setUser(null));
  }, []);

  return <SessionContext.Provider value={{ user, settings, refresh, setUser, catalogOnly }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
