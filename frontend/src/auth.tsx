import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setCsrf } from "./lib/api";
import type { Session } from "./types";
const AuthContext = createContext<{
  session: Session | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const session = await api<Session>("/auth/session");
      setCsrf(session.csrfToken);
      return session;
    },
    retry: false,
    staleTime: 60000,
  });
  async function signIn(email: string, password: string) {
    const session = await api<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setCsrf(session.csrfToken);
    client.setQueryData(["session"], session);
  }
  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    setCsrf("");
    client.clear();
    await query.refetch();
  }
  return (
    <AuthContext.Provider
      value={{
        session: query.data,
        loading: query.isPending,
        error: query.error,
        refresh: () => void query.refetch(),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider required");
  return value;
}
