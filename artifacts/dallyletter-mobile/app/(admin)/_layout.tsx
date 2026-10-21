import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AdminTabLayout() {
  const colors = useColors();
  const { user, isLoading } = useAuth();
  const role = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const allowed = ["owner", "admin"].includes(role);
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (!allowed) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.primary,
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} />
          ),
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: "Users", tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ href: role === "owner" ? undefined : null, title: "Payments", tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts", tabBarIcon: ({ color, size }) => <Feather name="bell" size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }} />
      <Tabs.Screen name="tools" options={{ href: null }} />
    </Tabs>
  );
}
