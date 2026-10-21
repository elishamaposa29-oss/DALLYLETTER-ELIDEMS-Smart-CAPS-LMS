import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@workspace/api-client-react";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const TOKEN_KEY = "dallyletter_native_expo_push_token_v1";
type StoredToken = { userId: number; token: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type Session = { userId: number; authToken: string; pushToken: string };

export default function NativePushControls() {
  const { user, token, isLoading } = useAuth();
  const colors = useColors();
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pushToken, setPushToken] = useState("");
  const previousSession = useRef<Session | null>(null);
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
    || Constants.easConfig?.projectId
    || Constants.expoConfig?.extra?.eas?.projectId
    || "";

  const unregister = async (session: Session) => {
    try {
      await fetch(getApiUrl("/api/push/subscriptions"), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + session.authToken, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: session.pushToken }),
      });
    } catch {
      // Server-side tokens expire or are reassigned; logout must not be blocked by push cleanup.
    }
  };

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const previous = previousSession.current;
      // Auth restoration is asynchronous. Do not delete a saved device token
      // while the provider is still loading the existing account session.
      if (isLoading) return;
      if (!user?.id || !token) {
        if (previous) {
          await unregister(previous);
          previousSession.current = null;
        }
        await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        if (active) setPushToken("");
        return;
      }
      if (previous && (previous.userId !== user.id || previous.authToken !== token)) {
        await unregister(previous);
        previousSession.current = null;
        await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        if (active) setPushToken("");
      }
      const rawStored = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
      let stored: StoredToken | null = null;
      try { stored = rawStored ? JSON.parse(rawStored) as StoredToken : null; } catch { stored = null; }
      if (stored && stored.userId === user.id && typeof stored.token === "string") {
        if (active) {
          setPushToken(stored.token);
          previousSession.current = { userId: user.id, authToken: token, pushToken: stored.token };
        }
      } else {
        await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        if (active) setPushToken("");
      }
    };
    void sync();
    return () => { active = false; };
  }, [user?.id, token, isLoading]);

  useEffect(() => {
    if (!user) return;
    const openNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as { url?: unknown };
      const url = typeof data.url === "string" ? data.url : "";
      const role = String(user.role).toLowerCase().replace(/[ -]+/g, "_");
      if (url.startsWith("/teacher/") && role === "teacher") {
        router.push({ pathname: "/(teacher)/more", params: { section: "notifications" } } as any);
      } else if (url.startsWith("/manager/") && ["manager", "senior_manager"].includes(role)) {
        router.push({ pathname: "/(manager)/more", params: { section: "notifications" } } as any);
      } else if (url.startsWith("/admin/") && ["owner", "admin"].includes(role)) {
        router.push({ pathname: "/(admin)/more", params: { section: "notifications" } } as any);
      } else {
        const destination = role === "teacher"
          ? "/(teacher)/more"
          : ["manager", "senior_manager"].includes(role)
            ? "/(manager)/more"
            : ["owner", "admin"].includes(role)
              ? "/(admin)/more"
              : "/(student)/more";
        router.push({ pathname: destination, params: { section: "notifications" } } as any);
      }
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then(openNotification).catch(() => {});
    return () => subscription.remove();
  }, [user?.id, user?.role]);

  const enable = async () => {
    if (!user?.id || !token) {
      setError("Sign in before enabling push notifications.");
      return;
    }
    if (Platform.OS === "web") {
      setError("This control registers native app push. For browser push, use the Dallyletter website.");
      return;
    }
    if (!projectId) {
      setError("Native push is not configured for this build: set EXPO_PUBLIC_EAS_PROJECT_ID to the Dallyletter Expo EAS project ID, then rebuild the app.");
      return;
    }
    setWorking(true);
    setError("");
    setStatus("");
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("dallyletter-updates", {
          name: "Dallyletter updates",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#0d0d73",
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
      if (!permission.granted) throw new Error("Notification permission was not granted. Enable notifications in Android Settings to continue.");
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      const nativeToken = result.data;
      const response = await fetch(getApiUrl("/api/push/expo-subscriptions"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ token: nativeToken }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Could not register this device (HTTP ${response.status}).`);
      await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ userId: user.id, token: nativeToken } satisfies StoredToken));
      previousSession.current = { userId: user.id, authToken: token, pushToken: nativeToken };
      setPushToken(nativeToken);
      setStatus("Device registered. Tap “Send test notification” and check the Android notification shade.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register native push on this device.");
    } finally {
      setWorking(false);
    }
  };

  const sendTest = async () => {
    if (!token || !pushToken) {
      setError("Register this device first.");
      return;
    }
    setWorking(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(getApiUrl("/api/push/test"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => ({})) as { error?: string; notificationId?: number; message?: string };
      if (!response.ok) throw new Error(result.error || `Push test failed (HTTP ${response.status}).`);
      if (!result.notificationId) throw new Error("The server did not return a push-test notification ID.");
      setStatus("Test queued. Waiting for the push dispatcher…");
      // A queue response alone does not prove the Expo ticket was accepted.
      // Poll the authenticated per-user status endpoint, but never claim the OS displayed it.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusResponse = await fetch(getApiUrl(`/api/push/test/${result.notificationId}`), {
          headers: { Authorization: "Bearer " + token },
        });
        const dispatch = await statusResponse.json().catch(() => ({})) as { acceptedByPushService?: boolean; dispatchComplete?: boolean; attempts?: number; lastError?: string | null };
        if (!statusResponse.ok) throw new Error("Push test was queued, but its dispatch status could not be checked.");
        if (dispatch.acceptedByPushService) {
          setStatus("Expo accepted the push ticket. Check the Android notification shade; only the device can confirm display.");
          return;
        }
        if (dispatch.dispatchComplete && dispatch.lastError) {
          throw new Error("Push dispatch finished without a successful delivery: " + dispatch.lastError);
        }
        if (dispatch.lastError && attempt === 7) throw new Error("Push dispatch is retrying: " + dispatch.lastError);
      }
      setStatus("Push test is still pending. Reopen this panel to check dispatch status and verify the Android notification shade.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue a push test.");
    } finally {
      setWorking(false);
    }
  };

  return <View style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, gap: 8, marginBottom: 12 }}>
    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>Native device notifications</Text>
    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Register this Android device for push alerts, then test delivery. A queued test is not proof of device delivery.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={working || isLoading} onPress={() => void enable()} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", opacity: working ? 0.7 : 1 }}>
      {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{pushToken ? "Refresh device registration" : "Enable device push"}</Text>}
    </TouchableOpacity>
    {pushToken ? <TouchableOpacity accessibilityRole="button" disabled={working} onPress={() => void sendTest()} style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>Send test notification</Text></TouchableOpacity> : null}
    {status ? <Text accessibilityRole="text" style={{ color: colors.primary, fontSize: 12 }}>{status}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</Text> : null}
  </View>;
}
