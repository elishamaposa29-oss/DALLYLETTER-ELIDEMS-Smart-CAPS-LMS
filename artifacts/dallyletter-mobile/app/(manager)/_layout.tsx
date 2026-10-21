import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ManagerLayout() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  const role = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const allowed = ["manager", "senior_manager"].includes(role) || Boolean((user as any)?.isManager);

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (!allowed) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
