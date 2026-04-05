import { Feather } from "@expo/vector-icons";
import { useCreateNotification, useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const notifTypes = ["general", "payment", "class", "lesson", "system"] as const;

export default function AdminNotifications() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: notifications, isLoading, refetch } = useListNotifications();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<typeof notifTypes[number]>("general");

  const createMutation = useCreateNotification({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetch();
        setShowModal(false);
        setTitle(""); setMessage("");
      },
      onError: () => Alert.alert("Error", "Could not send notification."),
    },
  });

  const markReadMutation = useMarkNotificationRead({ mutation: { onSuccess: () => refetch() } });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const unread = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  const handleCreate = () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert("Missing fields", "Title and message are required.");
      return;
    }
    createMutation.mutate({ data: { title: title.trim(), message: message.trim(), type } });
  };

  const typeIcon: Record<string, any> = {
    general: "bell", payment: "credit-card", class: "video", lesson: "book", system: "settings",
  };
  const typeColor: Record<string, string> = {
    general: "#3b82f6", payment: "#22c55e", class: "#8b5cf6", lesson: "#f59e0b", system: "#6b7280",
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 16,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: {},
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    subtitle: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular", marginTop: 2 },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    unreadCard: { borderColor: colors.primary, backgroundColor: colors.secondary },
    iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
    info: { flex: 1 },
    notifTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    notifMsg: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3, lineHeight: 18 },
    notifMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 6 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modal: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
    modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6 },
    input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, height: 48, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
    typeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 16 },
    cancelText: { textAlign: "center", marginTop: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.subtitle}>{unread} unread</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
          <Feather name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications ?? []}
        style={s.list}
        contentContainerStyle={s.listContent}
        keyExtractor={(item: any) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="bell-off" size={48} color={colors.border} />
            <Text style={s.emptyText}>{isLoading ? "Loading..." : "No notifications"}</Text>
          </View>
        }
        renderItem={({ item: n }) => {
          const col = typeColor[n.type] ?? "#6b7280";
          return (
            <TouchableOpacity style={[s.card, !n.isRead && s.unreadCard]} onPress={() => !n.isRead && markReadMutation.mutate({ id: n.id })}>
              <View style={[s.iconWrap, { backgroundColor: col + "20" }]}>
                <Feather name={typeIcon[n.type] ?? "bell"} size={18} color={col} />
              </View>
              <View style={s.info}>
                <Text style={s.notifTitle}>{n.title}</Text>
                <Text style={s.notifMsg}>{n.message}</Text>
                <Text style={s.notifMeta}>{new Date(n.createdAt).toLocaleDateString()}</Text>
              </View>
              {!n.isRead && <View style={s.unreadDot} />}
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView>
            <View style={s.modal}>
              <Text style={s.modalTitle}>Send Notification</Text>
              <Text style={s.label}>Title *</Text>
              <TextInput style={s.input} placeholder="Notification title" placeholderTextColor={colors.mutedForeground} value={title} onChangeText={setTitle} />
              <Text style={s.label}>Message *</Text>
              <TextInput
                style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: "top" }]}
                placeholder="Notification message..."
                placeholderTextColor={colors.mutedForeground}
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <Text style={s.label}>Type</Text>
              <View style={s.typeRow}>
                {notifTypes.map((t) => {
                  const selected = t === type;
                  const col = typeColor[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeChip, { borderColor: selected ? col : colors.border, backgroundColor: selected ? col + "20" : "transparent" }]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[s.typeChipText, { color: selected ? col : colors.mutedForeground }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={s.submitBtn} onPress={handleCreate} disabled={createMutation.isPending}>
                <Text style={s.submitText}>{createMutation.isPending ? "Sending..." : "Send to All Users"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
