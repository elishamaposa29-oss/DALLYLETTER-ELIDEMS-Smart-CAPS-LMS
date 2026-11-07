import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ManagerLayout() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  const role = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const allowed = ["manager", "senior_manager", "junior_manager"].includes(role) || Boolean((user as any)?.isManager);
  const restrictedTeacher = role === "teacher" && ["draft","pending_review","rejected_pending_conversion"].includes(String((user as any)?.teacherApplicationStatus||"").toLowerCase());

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (restrictedTeacher) return <Redirect href="/profile-hub" />;
  if (!allowed) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
