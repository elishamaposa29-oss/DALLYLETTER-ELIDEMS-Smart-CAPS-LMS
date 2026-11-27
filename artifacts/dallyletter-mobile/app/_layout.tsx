import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { setBaseUrl } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DeviceEventEmitter } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { DailyAttendanceTracker } from "@/components/DailyAttendanceTracker";

const DEFAULT_API_BASE_URL = "https://dallyletter-elidems-smart-caps-lms-4.onrender.com";
function resolveApiBaseUrl() {
  const candidates = [
    process.env.EXPO_PUBLIC_API_BASE_URL,
    process.env.EXPO_PUBLIC_API_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : undefined,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value.replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE_URL;
}
const apiBaseUrl = resolveApiBaseUrl();

if (apiBaseUrl) setBaseUrl(apiBaseUrl);
void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000, gcTime: 7 * 24 * 60 * 60_000, networkMode: "offlineFirst" } } });

const QUERY_CACHE_PREFIX = "dallyletter_mobile_query_cache_v1_user_";
const USER_KEY = "dallyletter_user";
const AUTH_CACHE_EPOCH_KEY = "dallyletter_auth_cache_epoch_v1";
const AUTH_CACHE_VERIFIED_KEY = "dallyletter_auth_cache_verified_v1";

function OfflineQueryCache() {
  useEffect(() => {
    let active = true;
    let hydrated = false;
    let cacheKey: string | null = null;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      if (!hydrated || !active || !cacheKey) return;
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
        const snapshot = dehydrate(queryClient, { shouldDehydrateQuery: query => query.state.status === "success" && query.state.dataUpdatedAt >= cutoff });
        const bounded = { ...snapshot, queries: snapshot.queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt) };
        const serializeWithinLimit = (limit: number) => {
          const kept: typeof bounded.queries = [];
          let bytes = 0;
          for (const query of bounded.queries) {
            const size = JSON.stringify(query).length * 2;
            if (bytes + size > limit) continue;
            kept.push(query); bytes += size;
          }
          return JSON.stringify({ ...bounded, queries: kept });
        };
        if (cacheKey) {
          const key = cacheKey;
          void AsyncStorage.setItem(key, serializeWithinLimit(8 * 1024 * 1024)).catch(async () => {
            // Recover from Android storage pressure by shrinking cached reads only.
            // Queued submissions, drafts and user-authored learning work are stored separately.
            try { await AsyncStorage.setItem(key, serializeWithinLimit(2 * 1024 * 1024)); }
            catch { await AsyncStorage.removeItem(key).catch(() => undefined); }
          });
        }
      }, 700);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe(persist);
    let switchSequence = 0;
    const loadUserCache = async () => {
      const sequence = ++switchSequence;
      hydrated = false;
      queryClient.clear();
      cacheKey = null;
      try {
        const [serializedUser, cacheEpoch, verifiedEpoch] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(AUTH_CACHE_EPOCH_KEY),
          AsyncStorage.getItem(AUTH_CACHE_VERIFIED_KEY),
        ]);
        if (!active || sequence !== switchSequence) return;
        if (!serializedUser || !cacheEpoch || verifiedEpoch !== cacheEpoch) { hydrated = true; return; }
        const user = JSON.parse(serializedUser) as { id?: number };
        if (!Number.isInteger(user.id) || Number(user.id) <= 0) { hydrated = true; return; }
        cacheKey = QUERY_CACHE_PREFIX + String(user.id) + "_session_" + cacheEpoch;
        const serializedCache = await AsyncStorage.getItem(cacheKey);
        if (!active || sequence !== switchSequence) return;
        if (serializedCache) {
          try {
            const snapshot = JSON.parse(serializedCache);
            const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
            if (Array.isArray(snapshot?.queries)) snapshot.queries = snapshot.queries.filter((query: any) => Number(query?.state?.dataUpdatedAt || 0) >= cutoff);
            hydrate(queryClient, snapshot);
          } catch { await AsyncStorage.removeItem(cacheKey); }
        }
      } catch {
        // Offline cache is best-effort; app startup must remain usable without it.
      } finally {
        if (active && sequence === switchSequence) { hydrated = true; persist(); }
      }
    };
    // Wait for AuthProvider to verify the persisted session with /api/auth/me.
    // Hydrating here would race the auth check and briefly expose stale permissions.
    const authSubscription = DeviceEventEmitter.addListener("dallyletter-auth-changed", () => { void loadUserCache(); });
    return () => {
      active = false;
      unsubscribe();
      authSubscription.remove();
      if (writeTimer) clearTimeout(writeTimer);
    };
  }, []);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="(student)" />
      <Stack.Screen name="(teacher)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [bootFallbackReady, setBootFallbackReady] = useState(false);

  useEffect(() => {
    const watchdog = setTimeout(() => {
      setBootFallbackReady(true);
      void SplashScreen.hideAsync().catch(() => {});
    }, 5000);
    if (fontsLoaded || fontError) {
      clearTimeout(watchdog);
      void SplashScreen.hideAsync().catch(() => {});
    }
    return () => clearTimeout(watchdog);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && !bootFallbackReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <OfflineQueryCache />
          <AuthProvider>
            <DailyAttendanceTracker />
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider><RootLayoutNav /></KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
