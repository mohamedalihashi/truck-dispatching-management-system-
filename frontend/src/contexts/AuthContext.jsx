import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, loadSession, saveSession } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const existing = loadSession();
  const [user, setUser] = useState(existing?.user || null);
  const [token, setToken] = useState(existing?.token || null);
  const [booting, setBooting] = useState(Boolean(existing?.token));

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => {
        clearSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => setBooting(false));
  }, [token]);

  function completeAuth(result) {
    saveSession(result);
    setUser(result.user);
    setToken(result.token);
    return result;
  }

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: Boolean(user && token),
      async login(payload) {
        const result = await api.login(payload);
        if (result.verificationRequired) return result;
        return completeAuth(result);
      },
      async verifyLogin(payload) {
        return completeAuth(await api.verifyLogin(payload));
      },
      async changePassword(payload) {
        const result = await api.changePassword(payload);
        return completeAuth(result);
      },
      async register(payload) {
        const result = await api.register(payload);
        if (result.verificationRequired || result.verificationPending) return result;
        return completeAuth(result);
      },
      async verifyRegister(payload) {
        const result = await api.verifyRegister(payload);
        return result.token ? completeAuth(result) : result;
      },
      async resendCode(payload) {
        return api.resendCode(payload);
      },
      async logout() {
        try {
          await api.logout();
        } catch {
          // Local sign-out must still succeed if the server is unavailable.
        }
        clearSession();
        setUser(null);
        setToken(null);
      },
      async refreshUser() {
        const result = await api.me();
        const session = loadSession();
        if (session?.token) {
          saveSession({ token: session.token, user: result.user });
        }
        setUser(result.user);
        return result.user;
      }
    }),
    [user, token, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
