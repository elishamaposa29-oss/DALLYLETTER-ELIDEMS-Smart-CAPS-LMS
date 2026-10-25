import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { getApiUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "dallyletter_token";
const USER_KEY = "dallyletter_user";
const NATIVE_PUSH_TOKEN_KEY = "dallyletter_native_expo_push_token_v1";

async function unregisterNativePushForAccount(authToken: string | null, userId?: number) {
  try {
    const raw = await AsyncStorage.getItem(NATIVE_PUSH_TOKEN_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { userId?: number; token?: string };
    if (!saved.token || !saved.userId || (userId !== undefined && saved.userId !== userId)) return;
    if (authToken) await fetch(getApiUrl("/api/push/subscriptions"), { method: "DELETE", headers: { Authorization: "Bearer " + authToken, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: saved.token }) }).catch(() => undefined);
    await AsyncStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
  } catch {
    // Push cleanup must never prevent sign-out or account switching.
  }
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  isPrefect: boolean;
  isBlocked: boolean;
  phone?: string | null;
  grade?: string | null;
  subject?: string | null;
  avatarUrl?: string | null;
  lastPaymentDate?: string | null;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      return storedToken;
    });

    const restore = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          // Revalidate cached credentials on every cold start so expired/revoked
          // sessions cannot restore a stale account into the app.
          try {
            const response = await fetch(getApiUrl("/api/auth/me"), { headers: { Authorization: "Bearer " + storedToken } });
            if (response.ok) {
              const currentUser = await response.json();
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(currentUser));
              setToken(storedToken);
              setUser(currentUser);
            } else if (response.status === 401 || response.status === 403) {
              await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
            } else {
              setToken(storedToken);
              setUser(JSON.parse(storedUser));
            }
          } catch {
            // Keep cached state during a temporary network outage; next API call revalidates it.
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch (_) {
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (newUser: User, newToken: string) => {
    if (user && token && (user.id !== newUser.id || token !== newToken)) {
      await fetch(getApiUrl("/api/auth/logout"), { method: "POST", headers: { Authorization: "Bearer " + token } }).catch(() => undefined);
      await unregisterNativePushForAccount(token, user.id);
    }
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, newToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser)),
    ]);
    setToken(newToken);
    setUser(newUser);
    DeviceEventEmitter.emit("dallyletter-auth-changed");
  }, [token, user]);

  const logout = useCallback(async () => {
    if (token) await fetch(getApiUrl("/api/auth/logout"), { method: "POST", headers: { Authorization: "Bearer " + token } }).catch(() => undefined);
    await unregisterNativePushForAccount(token, user?.id);
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(NATIVE_PUSH_TOKEN_KEY),
    ]);
    setToken(null);
    setUser(null);
    DeviceEventEmitter.emit("dallyletter-auth-changed");
  }, [token, user?.id]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
