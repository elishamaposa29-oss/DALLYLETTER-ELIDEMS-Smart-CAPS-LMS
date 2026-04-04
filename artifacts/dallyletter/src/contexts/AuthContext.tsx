import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("dallyletter_token"));
  const [, setLocation] = useLocation();

  const { data: user, isLoading, refetch } = useGetCurrentUser({
    query: {
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("dallyletter_token", token);
    } else {
      localStorage.removeItem("dallyletter_token");
    }
  }, [token]);

  const login = (newToken: string) => {
    setToken(newToken);
    refetch();
  };

  const logout = () => {
    setToken(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: !!token && isLoading, login, logout }}>
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
