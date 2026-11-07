import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, DeviceEventEmitter } from "react-native";
import { getApiUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "dallyletter_token";
const USER_KEY = "dallyletter_user";
const NATIVE_PUSH_TOKEN_KEY = "dallyletter_native_expo_push_token_v1";
const AUTH_CACHE_EPOCH_KEY = "dallyletter_auth_cache_epoch_v1";
const AUTH_CACHE_VERIFIED_KEY = "dallyletter_auth_cache_verified_v1";
const newAuthCacheEpoch = () => Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);

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
          // Each login receives a fresh cache namespace. A prior session's
          // offline query data is never hydrated into a later session.
          let cacheEpoch = await AsyncStorage.getItem(AUTH_CACHE_EPOCH_KEY);
          if (!cacheEpoch) {
            cacheEpoch = newAuthCacheEpoch();
            await AsyncStorage.setItem(AUTH_CACHE_EPOCH_KEY, cacheEpoch);
          }
          // Revalidate cached credentials on every cold start so expired/revoked
          // sessions cannot restore a stale account into the app.
          try {
            // Do not hydrate private/offline API data until this exact session
            // has been revalidated by the server on this app launch.
            await AsyncStorage.removeItem(AUTH_CACHE_VERIFIED_KEY);
            const response = await fetch(getApiUrl("/api/auth/me"), { headers: { Authorization: "Bearer " + storedToken } });
            if (response.ok) {
              const currentUser = await response.json();
              const cachedUser = JSON.parse(storedUser) as Record<string, unknown>;
              const authorityFingerprint = (value: Record<string, unknown>) => JSON.stringify({
                id: value.id,
                role: value.role,
                isManager: value.isManager,
                managerLevel: value.managerLevel,
                isPrefect: value.isPrefect,
                teacherApplicationStatus: value.teacherApplicationStatus,
                isBlocked: value.isBlocked,
                isSuspended: value.isSuspended,
              });
              const authorityChanged = authorityFingerprint(cachedUser) !== authorityFingerprint(currentUser);
              if (authorityChanged) {
                // A server-side role, manager grant, or account-state transition
                // invalidates the old offline cache even when the token is unchanged.
                cacheEpoch = newAuthCacheEpoch();
                await AsyncStorage.setItem(AUTH_CACHE_EPOCH_KEY, cacheEpoch);
              }
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(currentUser));
              await AsyncStorage.setItem(AUTH_CACHE_VERIFIED_KEY, cacheEpoch);
              setToken(storedToken);
              setUser(currentUser);
              // Always notify the cache hydrator after server validation. It
              // will use a new namespace if any authority field changed.
              DeviceEventEmitter.emit("dallyletter-auth-changed");
            } else if (response.status === 401 || response.status === 403) {
              // A rejected session must also release the old account's server-side
              // push subscription and local device token; otherwise a later login
              // could inherit stale notification ownership on this device.
              await unregisterNativePushForAccount(storedToken);
              await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY), AsyncStorage.removeItem(NATIVE_PUSH_TOKEN_KEY), AsyncStorage.removeItem(AUTH_CACHE_EPOCH_KEY), AsyncStorage.removeItem(AUTH_CACHE_VERIFIED_KEY)]);
              DeviceEventEmitter.emit("dallyletter-auth-changed");
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
    const cacheEpoch = newAuthCacheEpoch();
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, newToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser)),
      AsyncStorage.setItem(AUTH_CACHE_EPOCH_KEY, cacheEpoch),
      AsyncStorage.setItem(AUTH_CACHE_VERIFIED_KEY, cacheEpoch),
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
      AsyncStorage.removeItem(AUTH_CACHE_EPOCH_KEY),
      AsyncStorage.removeItem(AUTH_CACHE_VERIFIED_KEY),
    ]);
    setToken(null);
    setUser(null);
    DeviceEventEmitter.emit("dallyletter-auth-changed");
  }, [token, user?.id]);

  useEffect(() => {
    if (!token || !user) return;
    let checking = false;
    const revalidate = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch(getApiUrl("/api/auth/me"), { headers: { Authorization: "Bearer " + token } });
        if (response.status === 401 || response.status === 403) {
          await logout();
          return;
        }
        if (!response.ok) return;
        const currentUser = await response.json() as User;
        if (Number(currentUser.id) !== Number(user.id)) {
          await logout();
          return;
        }
        const fingerprint = (value: Record<string, unknown>) => JSON.stringify({
          id: value.id, role: value.role, isManager: value.isManager,
          managerLevel: value.managerLevel, isPrefect: value.isPrefect,
          teacherApplicationStatus: value.teacherApplicationStatus,
          isBlocked: value.isBlocked, isSuspended: value.isSuspended,
        });
        const authorityChanged = fingerprint(user as unknown as Record<string, unknown>) !==
          fingerprint(currentUser as unknown as Record<string, unknown>);
        let cacheEpoch = await AsyncStorage.getItem(AUTH_CACHE_EPOCH_KEY) || newAuthCacheEpoch();
        if (authorityChanged) cacheEpoch = newAuthCacheEpoch();
        await Promise.all([
          AsyncStorage.setItem(USER_KEY, JSON.stringify(currentUser)),
          AsyncStorage.setItem(AUTH_CACHE_EPOCH_KEY, cacheEpoch),
          AsyncStorage.setItem(AUTH_CACHE_VERIFIED_KEY, cacheEpoch),
        ]);
        setUser(currentUser);
        DeviceEventEmitter.emit("dallyletter-auth-changed");
      } catch {
        // A temporary network failure never grants new authority. The API
        // continues to enforce current permissions on every protected action.
      } finally {
        checking = false;
      }
    };
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void revalidate();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void revalidate();
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [token, user, logout]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
