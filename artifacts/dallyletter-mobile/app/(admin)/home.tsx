import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats, useGetPaymentSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AdminHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: stats } = useGetDashboardStats();
  const { data: paymentSummary } = useGetPaymentSummary();
  const { data: activity } = useGetRecentActivity();

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 28,
      paddingHorizontal: 20,
    },
    ownerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: "flex-start",
      marginBottom: 10,
    },
    ownerBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
    greeting: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    name: { fontSize: 22, color: "#ffffff", fontFamily: "Inter_700Bold", marginTop: 2 },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 12 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
    statCard: {
      width: "47%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    statIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 10 },
    statNum: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.primary },
    statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    payRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
    payCard: { flex: 1, borderRadius: colors.radius, padding: 14, alignItems: "center", borderWidth: 1 },
    payNum: { fontSize: 24, fontFamily: "Inter_700Bold" },
    payLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    actCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    actRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    actText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    actTime: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", padding: 20, fontFamily: "Inter_400Regular" },
  });

  const statsData = [
    { icon: "users" as const, label: "Total Students", value: stats?.totalStudents, color: "#3b82f6" },
    { icon: "briefcase" as const, label: "Teachers", value: stats?.totalTeachers, color: "#8b5cf6" },
    { icon: "book" as const, label: "Lessons", value: stats?.totalLessons, color: "#10b981" },
    { icon: "video" as const, label: "Active Classes", value: stats?.activeClasses, color: "#f59e0b" },
  ];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.ownerBadge}>
          <Feather name="shield" size={11} color={colors.primary} />
          <Text style={s.ownerBadgeText}>OWNER</Text>
        </View>
        <Text style={s.greeting}>Admin Dashboard</Text>
        <Text style={s.name}>{user?.name}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>Platform Stats</Text>
        <View style={s.statsGrid}>
          {statsData.map((item) => (
            <View key={item.label} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: item.color + "20" }]}>
                <Feather name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={s.statNum}>{item.value ?? "—"}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Fee Overview</Text>
        <View style={s.payRow}>
          <View style={[s.payCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
            <Text style={[s.payNum, { color: "#22c55e" }]}>{paymentSummary?.paidCount ?? "—"}</Text>
            <Text style={s.payLabel}>Paid</Text>
          </View>
          <View style={[s.payCard, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Text style={[s.payNum, { color: "#ef4444" }]}>{paymentSummary?.overdueCount ?? "—"}</Text>
            <Text style={s.payLabel}>Overdue</Text>
          </View>
          <View style={[s.payCard, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}>
            <Text style={[s.payNum, { color: "#f59e0b" }]}>{paymentSummary?.pendingCount ?? "—"}</Text>
            <Text style={s.payLabel}>Pending</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Recent Activity</Text>
        <View style={s.actCard}>
          {activity && activity.length > 0 ? (
            activity.slice(0, 10).map((a: any) => (
              <View key={a.id} style={s.actRow}>
                <Feather name="activity" size={14} color={colors.primary} />
                <Text style={s.actText} numberOfLines={2}>{a.description}</Text>
                <Text style={s.actTime}>{new Date(a.createdAt).toLocaleDateString()}</Text>
              </View>
            ))
          ) : (
            <Text style={s.emptyText}>No recent activity</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
