import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("adminToken"));
  const [username, setUsername] = useState(() => localStorage.getItem("adminUsername"));

  const value = useMemo(
    () => ({
      token,
      username,
      isAuthenticated: !!token,
      signIn: (newToken, newUsername) => {
        localStorage.setItem("adminToken", newToken);
        localStorage.setItem("adminUsername", newUsername);
        setToken(newToken);
        setUsername(newUsername);
      },
      signOut: () => {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminUsername");
        setToken(null);
        setUsername(null);
      },
    }),
    [token, username]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
