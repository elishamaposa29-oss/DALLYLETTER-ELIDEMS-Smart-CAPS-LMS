import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function TeacherHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: stats } = useGetDashboardStats();
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
    greeting: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    name: { fontSize: 22, color: "#ffffff", fontFamily: "Inter_700Bold", marginTop: 2 },
    badge: {
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: "flex-start",
      marginTop: 8,
    },
    badgeText: { color: colors.accent, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 12 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
    statCard: {
      width: "47%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.primary },
    statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    statIcon: { marginBottom: 8 },
    activityCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    activityText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    activityTime: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", padding: 20, fontFamily: "Inter_400Regular" },
  });

  const statsData = [
    { icon: "users" as const, label: "Students", value: stats?.totalStudents },
    { icon: "book" as const, label: "Lessons", value: stats?.totalLessons },
    { icon: "video" as const, label: "Live Classes", value: stats?.totalClasses },
    { icon: "message-circle" as const, label: "Messages", value: stats?.recentMessages },
  ];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.greeting}>Teacher Dashboard</Text>
        <Text style={s.name}>{user?.name}</Text>
        {user?.subject && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{user.subject}</Text>
          </View>
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>Overview</Text>
        <View style={s.statsGrid}>
          {statsData.map((item) => (
            <View key={item.label} style={s.statCard}>
              <Feather name={item.icon} size={20} color={colors.primary} style={s.statIcon} />
              <Text style={s.statNum}>{item.value ?? "—"}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Recent Activity</Text>
        <View style={s.activityCard}>
          {activity && activity.length > 0 ? (
            activity.slice(0, 8).map((a: any) => (
              <View key={a.id} style={s.activityRow}>
                <Feather name="activity" size={14} color={colors.primary} />
                <Text style={s.activityText} numberOfLines={2}>{a.description}</Text>
                <Text style={s.activityTime}>
                  {new Date(a.createdAt).toLocaleDateString()}
                </Text>
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
