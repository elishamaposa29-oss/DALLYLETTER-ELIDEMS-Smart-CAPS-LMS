import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ManagerLayout() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_");
  // Owners must be able to enter the manager workspace; senior managers and
  // junior managers are separate authorization levels, enforced by API routes.
  // This layout is only a navigation guard, never the security boundary.
  const allowedRoles = [
    "owner",
    "manager",
    "junior_manager",
    "jnr_manager",
    "senior_manager",
    "snr_manager",
  ];
  const allowed = allowedRoles.includes(role) || Boolean((user as any)?.isManager);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (!allowed) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
