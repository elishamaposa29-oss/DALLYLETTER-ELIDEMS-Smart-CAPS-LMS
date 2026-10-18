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
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || process.env.EXPO_PUBLIC_API_URL?.trim() || (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "");

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,
      gcTime: 7 * 24 * 60 * 60_000,
      networkMode: "offlineFirst",
    },
  },
});

const QUERY_CACHE_KEY = "dallyletter_mobile_query_cache_v1";
function OfflineQueryCache() {
  useEffect(() => {
    let active = true;
    let hydrated = false;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      if (!hydrated || !active) return;
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        const snapshot = dehydrate(queryClient, { shouldDehydrateQuery: query => query.state.status === "success" });
        void AsyncStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
      }, 700);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe(persist);
    void AsyncStorage.getItem(QUERY_CACHE_KEY).then(serialized => {
      if (!active || !serialized) return;
      try { hydrate(queryClient, JSON.parse(serialized)); } catch { void AsyncStorage.removeItem(QUERY_CACHE_KEY); }
    }).catch(() => {}).finally(() => { hydrated = true; persist(); });
    return () => { active = false; unsubscribe(); if (writeTimer) clearTimeout(writeTimer); };
  }, []);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(student)" />
      <Stack.Screen name="(teacher)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>\n          <OfflineQueryCache />
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
