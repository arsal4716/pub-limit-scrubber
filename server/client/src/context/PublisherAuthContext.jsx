import { createContext, useContext, useMemo, useState } from "react";

const PublisherAuthContext = createContext(null);

export function PublisherAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("publisherToken"));
  const [name, setName] = useState(() => localStorage.getItem("publisherName"));

  const value = useMemo(
    () => ({
      token,
      name,
      isAuthenticated: !!token,
      signIn: (newToken, newName) => {
        localStorage.setItem("publisherToken", newToken);
        localStorage.setItem("publisherName", newName);
        setToken(newToken);
        setName(newName);
      },
      signOut: () => {
        localStorage.removeItem("publisherToken");
        localStorage.removeItem("publisherName");
        setToken(null);
        setName(null);
      },
    }),
    [token, name]
  );

  return <PublisherAuthContext.Provider value={value}>{children}</PublisherAuthContext.Provider>;
}

export function usePublisherAuth() {
  const ctx = useContext(PublisherAuthContext);
  if (!ctx) throw new Error("usePublisherAuth must be used within PublisherAuthProvider");
  return ctx;
}
