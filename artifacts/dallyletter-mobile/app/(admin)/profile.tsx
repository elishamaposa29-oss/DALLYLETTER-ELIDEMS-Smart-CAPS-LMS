import { Feather } from "@expo/vector-icons";
import { useGetDashboardStats } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AdminProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { data: stats } = useGetDashboardStats();

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Sign out of the admin panel?", [
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
    avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    name: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    email: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", marginTop: 4 },
    ownerBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 },
    ownerText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
    statCard: { width: "47%", backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    statNum: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.primary },
    statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    card: { backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 20 },
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    rowValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    logoutBtn: { backgroundColor: "#fef2f2", borderRadius: colors.radius, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#fecaca" },
    logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
  });

  const statsData = [
    { label: "Students", value: stats?.totalStudents },
    { label: "Teachers", value: stats?.totalTeachers },
    { label: "Lessons", value: stats?.totalLessons },
    { label: "Classes", value: stats?.totalClasses },
  ];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Feather name="shield" size={40} color={colors.primary} />
        </View>
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.email}>{user?.email}</Text>
        <View style={s.ownerBadge}>
          <Feather name="shield" size={13} color={colors.primary} />
          <Text style={s.ownerText}>Platform Owner</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>Platform Overview</Text>
        <View style={s.statsGrid}>
          {statsData.map((item) => (
            <View key={item.label} style={s.statCard}>
              <Text style={s.statNum}>{item.value ?? "—"}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

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
          {user?.phone && (
            <View style={[s.row, s.rowLast]}>
              <Feather name="phone" size={16} color={colors.mutedForeground} />
              <Text style={s.rowLabel}>Phone</Text>
              <Text style={s.rowValue}>{user.phone}</Text>
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
