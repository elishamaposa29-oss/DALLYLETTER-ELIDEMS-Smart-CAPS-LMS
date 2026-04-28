import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats, useListNotifications } from "@workspace/api-client-react";
import { router } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function StudentHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { data: stats } = useGetDashboardStats();
  const { data: notifications } = useListNotifications();
  const unread = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const quickActions = [
    { icon: "book" as const, label: "Lessons", route: "/(student)/lessons" as const, color: "#3b82f6" },
    { icon: "video" as const, label: "Classes", route: "/(student)/classes" as const, color: "#8b5cf6" },
    { icon: "message-circle" as const, label: "Chat", route: "/(student)/chat" as const, color: "#10b981" },
    { icon: "credit-card" as const, label: "Payments", route: "/(student)/profile" as const, color: "#f59e0b" },
  ];

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 28,
      paddingHorizontal: 20,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    greeting: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    name: { fontSize: 22, color: "#ffffff", fontFamily: "Inter_700Bold", marginTop: 2 },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    badgeDot: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 100 },
    sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 12 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
    actionCard: {
      width: "47%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      alignItems: "flex-start",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    actionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.primary },
    statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    notifCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notifRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    notifText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", padding: 16, fontFamily: "Inter_400Regular" },
    prefectBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: "flex-start",
      marginTop: 8,
    },
    prefectText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.greeting}>Good day,</Text>
            <Text style={s.name}>{user?.name ?? "Student"}</Text>
            {user?.isPrefect && (
              <View style={s.prefectBadge}>
                <Feather name="star" size={12} color={colors.primary} />
                <Text style={s.prefectText}>Prefect</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.badge} onPress={() => router.push("/(student)/chat")}>
            <Feather name="bell" size={18} color="#ffffff" />
            {unread > 0 && <View style={s.badgeDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>Quick Access</Text>
        <View style={s.grid}>
          {quickActions.map((a) => (
            <TouchableOpacity key={a.label} style={s.actionCard} onPress={() => router.push(a.route)}>
              <View style={[s.actionIcon, { backgroundColor: a.color + "20" }]}>
                <Feather name={a.icon} size={20} color={a.color} />
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionTitle}>Overview</Text>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats?.totalLessons ?? "—"}</Text>
            <Text style={s.statLabel}>Lessons</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats?.totalClasses ?? "—"}</Text>
            <Text style={s.statLabel}>Live Classes</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats?.totalStudents ?? "—"}</Text>
            <Text style={s.statLabel}>Students</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Notifications</Text>
        <View style={s.notifCard}>
          {notifications && notifications.length > 0 ? (
            notifications.slice(0, 5).map((n: any) => (
              <View key={n.id} style={s.notifRow}>
                <Feather name="bell" size={14} color={n.isRead ? colors.mutedForeground : colors.primary} />
                <Text style={[s.notifText, !n.isRead && { fontFamily: "Inter_600SemiBold" }]}>{n.message}</Text>
              </View>
            ))
          ) : (
            <Text style={s.emptyText}>No notifications yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
