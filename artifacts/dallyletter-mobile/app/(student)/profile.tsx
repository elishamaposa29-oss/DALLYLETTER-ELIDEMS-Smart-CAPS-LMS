import { Feather } from "@expo/vector-icons";
import { useListPayments } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function StudentProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { data: payments } = useListPayments();

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const paid = payments?.filter((p: any) => p.status === "paid").length ?? 0;
  const overdue = payments?.filter((p: any) => p.status === "overdue").length ?? 0;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 32,
      paddingHorizontal: 20,
      alignItems: "center",
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    name: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    email: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", marginTop: 4 },
    roleBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginTop: 10,
    },
    roleText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    rowValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    payStatsRow: { flexDirection: "row", gap: 10 },
    payCard: { flex: 1, borderRadius: colors.radius, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    payNum: { fontSize: 28, fontFamily: "Inter_700Bold" },
    payLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    paymentItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    payTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    payStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    payStatusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    logoutBtn: {
      backgroundColor: "#fef2f2",
      borderRadius: colors.radius,
      padding: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: "#fecaca",
    },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
  });

  const payStatusColor: Record<string, string> = { paid: "#22c55e", overdue: "#ef4444", pending: "#f59e0b" };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Feather name="user" size={36} color="#ffffff" />
        </View>
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.email}>{user?.email}</Text>
        <View style={s.roleBadge}>
          {user?.isPrefect && <Feather name="star" size={12} color={colors.primary} />}
          <Text style={s.roleText}>{user?.isPrefect ? "Prefect Student" : "Student"}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account Details</Text>
          <View style={s.card}>
            <View style={s.row}>
              <Feather name="user" size={16} color={colors.mutedForeground} />
              <Text style={s.rowLabel}>Name</Text>
              <Text style={s.rowValue}>{user?.name}</Text>
            </View>
            <View style={s.row}>
              <Feather name="mail" size={16} color={colors.mutedForeground} />
              <Text style={s.rowLabel}>Email</Text>
              <Text style={s.rowValue} numberOfLines={1}>{user?.email}</Text>
            </View>
            {user?.grade && (
              <View style={s.row}>
                <Feather name="award" size={16} color={colors.mutedForeground} />
                <Text style={s.rowLabel}>Grade</Text>
                <Text style={s.rowValue}>{user.grade}</Text>
              </View>
            )}
            {user?.phone && (
              <View style={[s.row, s.rowLast]}>
                <Feather name="phone" size={16} color={colors.mutedForeground} />
                <Text style={s.rowLabel}>Phone</Text>
                <Text style={s.rowValue}>{user.phone}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Fee Status</Text>
          <View style={[s.payStatsRow, { marginBottom: 12 }]}>
            <View style={[s.payCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
              <Text style={[s.payNum, { color: "#22c55e" }]}>{paid}</Text>
              <Text style={s.payLabel}>Paid</Text>
            </View>
            <View style={[s.payCard, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
              <Text style={[s.payNum, { color: "#ef4444" }]}>{overdue}</Text>
              <Text style={s.payLabel}>Overdue</Text>
            </View>
          </View>
          {payments && payments.length > 0 && (
            <View style={s.card}>
              {payments.slice(0, 6).map((p: any, i: number) => {
                const col = payStatusColor[p.status] ?? "#9ca3af";
                return (
                  <View key={p.id} style={[s.paymentItem, i === payments.slice(0, 6).length - 1 && { borderBottomWidth: 0 }]}>
                    <Feather name="credit-card" size={14} color={colors.mutedForeground} />
                    <Text style={s.payTitle}>{p.month ?? "Payment"}</Text>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                      R{p.amount ?? "—"}
                    </Text>
                    <View style={[s.payStatusBadge, { backgroundColor: col + "20" }]}>
                      <Text style={[s.payStatusText, { color: col }]}>{p.status.toUpperCase()}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
