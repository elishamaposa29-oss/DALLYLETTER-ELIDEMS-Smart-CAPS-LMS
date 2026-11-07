import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("dallyletter_token"));
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: fetchedUser, isLoading, refetch, error } = useGetCurrentUser({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!token, retry: false, refetchInterval: 60_000, refetchOnWindowFocus: true } as any,
  });

  useEffect(() => {
    if (!sessionUser || !fetchedUser) return;
    if (sessionUser.id !== fetchedUser.id) {
      // A token resolving to a different account is an identity transition:
      // discard every cached query before adopting the server-confirmed user.
      queryClient.clear();
      setSessionUser(fetchedUser);
      return;
    }
    const authorityFingerprint = (value: User) => JSON.stringify({
      id: value.id,
      role: value.role,
      isManager: (value as any).isManager,
      managerLevel: (value as any).managerLevel,
      isPrefect: (value as any).isPrefect,
      teacherApplicationStatus: (value as any).teacherApplicationStatus,
      isBlocked: (value as any).isBlocked,
      isSuspended: (value as any).isSuspended,
    });
    if (authorityFingerprint(sessionUser) !== authorityFingerprint(fetchedUser)) {
      queryClient.clear();
      setSessionUser(fetchedUser);
    }
  }, [sessionUser, fetchedUser, queryClient]);

  useEffect(() => {
    if (!token || !error) return;
    const message = error instanceof Error ? error.message : String(error);
    if (/401|403|unauthorized|forbidden|authentication required/i.test(message)) {
      queryClient.clear();
      setSessionUser(null);
      setToken(null);
      setLocation("/login");
    }
  }, [token, error, sessionUser, setLocation, queryClient]);

  useEffect(() => {
    if (token) {
      localStorage.setItem("dallyletter_token", token);
    } else {
      localStorage.removeItem("dallyletter_token");
    }
  }, [token]);

  const login = (newToken: string, authenticatedUser: User) => {
    const previousToken = token;
    // Never reuse API/query results across sessions, even when the same account
    // logs in again or its role/permissions changed while the app was closed.
    queryClient.clear();
    if (previousToken && previousToken !== newToken) {
      void fetch(getApiUrl("/api/auth/logout"), { method: "POST", headers: { Authorization: "Bearer " + previousToken } }).catch(() => undefined);
    }
    // Persist the credential synchronously before triggering any authenticated query.
    // The login response already contains the trusted user record; use it immediately
    // so route guards do not redirect during the first /auth/me request.
    localStorage.setItem("dallyletter_token", newToken);
    setSessionUser(authenticatedUser);
    setToken(newToken);
    void refetch().then((result) => {
      if (result.data) setSessionUser(result.data);
      // Keep the successful login response as the route-guard identity if the
      // follow-up profile request transiently fails; the normal 401 handler remains
      // active after this initial session bootstrap is complete.
    });
  };

  const logout = () => {
    if (token) void fetch(getApiUrl("/api/auth/logout"), { method: "POST", headers: { Authorization: "Bearer " + token } }).catch(() => undefined);
    queryClient.clear();
    setSessionUser(null);
    setToken(null);
    setLocation("/login");
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "dallyletter_token") return;
      queryClient.clear();
      setSessionUser(null);
      setToken(event.newValue);
      if (!event.newValue) setLocation("/login");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient, setLocation]);

  const user = sessionUser ?? fetchedUser;

  return (
    <AuthContext.Provider value={{ user, isLoading: !!token && isLoading && !sessionUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
