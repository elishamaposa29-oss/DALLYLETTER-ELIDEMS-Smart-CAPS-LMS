import { Feather } from "@expo/vector-icons";
import { useListClasses, useRaiseHand } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function StudentClasses() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: classes, isLoading } = useListClasses();
  const raiseHandMutation = useRaiseHand();

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleJoin = (meetLink: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(meetLink);
  };

  const handleRaiseHand = (classId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    raiseHandMutation.mutate({ data: { classId } });
  };

  const statusColor: Record<string, string> = {
    scheduled: "#3b82f6",
    live: "#22c55e",
    ended: "#9ca3af",
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    subtitle: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", marginTop: 4 },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    classTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      marginLeft: 8,
    },
    statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    meta: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 },
    actions: { flexDirection: "row", gap: 10, marginTop: 14 },
    joinBtn: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 10,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
    },
    joinBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" },
    handBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyWrap: { alignItems: "center", paddingTop: 60 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginTop: 12 },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    loadText: { textAlign: "center", color: colors.mutedForeground, marginTop: 40, fontFamily: "Inter_400Regular" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Live Classes</Text>
        <Text style={s.subtitle}>Tap "Join" to open Google Meet</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <Text style={s.loadText}>Loading classes...</Text>
        ) : !classes || classes.length === 0 ? (
          <View style={s.emptyWrap}>
            <Feather name="video-off" size={48} color={colors.border} />
            <Text style={s.emptyText}>No classes scheduled</Text>
            <Text style={s.emptySubtext}>Check back soon</Text>
          </View>
        ) : (
          classes.map((cls: any) => {
            const col = statusColor[cls.status] ?? "#6b7280";
            return (
              <View key={cls.id} style={s.card}>
                <View style={s.cardTop}>
                  <Text style={s.classTitle} numberOfLines={2}>{cls.title}</Text>
                  <View style={[s.statusBadge, { backgroundColor: col + "20" }]}>
                    <Text style={[s.statusText, { color: col }]}>{cls.status.toUpperCase()}</Text>
                  </View>
                </View>
                {cls.subject && <Text style={s.meta}><Feather name="book" size={12} /> {cls.subject}</Text>}
                {cls.scheduledAt && (
                  <Text style={s.meta}>
                    <Feather name="clock" size={12} /> {new Date(cls.scheduledAt).toLocaleString()}
                  </Text>
                )}
                {cls.description && <Text style={[s.meta, { marginTop: 4 }]}>{cls.description}</Text>}
                <View style={s.actions}>
                  {cls.meetLink ? (
                    <TouchableOpacity style={s.joinBtn} onPress={() => handleJoin(cls.meetLink)}>
                      <Feather name="video" size={16} color="#ffffff" />
                      <Text style={s.joinBtnText}>Join Class</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[s.joinBtn, { backgroundColor: colors.border, flex: 1 }]}>
                      <Text style={[s.joinBtnText, { color: colors.mutedForeground }]}>No link yet</Text>
                    </View>
                  )}
                  <TouchableOpacity style={s.handBtn} onPress={() => handleRaiseHand(cls.id)}>
                    <Text style={{ fontSize: 18 }}>✋</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
