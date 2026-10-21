import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { user, isLoading } = useAuth();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  const role = String(user.role || "").toLowerCase().replace(/[ -]+/g, "_");
  if (["owner", "admin", "platform_owner", "manager", "senior_manager"].includes(role)) return <Redirect href="/(admin)/home" />;
  if (role === "teacher") return <Redirect href="/(teacher)/home" />;
  return <Redirect href="/(student)/home" />;
}
