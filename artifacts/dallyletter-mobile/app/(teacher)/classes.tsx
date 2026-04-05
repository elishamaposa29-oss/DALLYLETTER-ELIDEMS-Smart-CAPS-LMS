import { Feather } from "@expo/vector-icons";
import { useCreateClass, useListClasses } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
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

const statusColor: Record<string, string> = { scheduled: "#3b82f6", live: "#22c55e", ended: "#9ca3af" };

export default function TeacherClasses() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: classes, isLoading, refetch } = useListClasses();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useCreateClass({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetch();
        setShowModal(false);
        setTitle(""); setSubject(""); setMeetLink(""); setDescription("");
      },
      onError: () => Alert.alert("Error", "Could not create class."),
    },
  });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleCreate = () => {
    if (!title.trim() || !meetLink.trim()) {
      Alert.alert("Missing fields", "Title and Google Meet link are required.");
      return;
    }
    createMutation.mutate({
      data: { title: title.trim(), meetLink: meetLink.trim(), subject: subject || undefined, description: description || undefined, status: "scheduled" },
    });
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
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    classTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginLeft: 8 },
    statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    meta: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 },
    joinBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
      marginTop: 12,
    },
    joinBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modal: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
    },
    modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6 },
    input: {
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 14,
    },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 16 },
    cancelText: { textAlign: "center", marginTop: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>My Classes</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
          <Feather name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={classes ?? []}
        style={s.list}
        contentContainerStyle={s.listContent}
        keyExtractor={(item: any) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="video-off" size={48} color={colors.border} />
            <Text style={s.emptyText}>{isLoading ? "Loading..." : "No classes yet"}</Text>
          </View>
        }
        renderItem={({ item: cls }) => {
          const col = statusColor[cls.status] ?? "#6b7280";
          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.classTitle} numberOfLines={2}>{cls.title}</Text>
                <View style={[s.statusBadge, { backgroundColor: col + "20" }]}>
                  <Text style={[s.statusText, { color: col }]}>{cls.status.toUpperCase()}</Text>
                </View>
              </View>
              {cls.subject && <Text style={s.meta}>{cls.subject}</Text>}
              {cls.description && <Text style={s.meta}>{cls.description}</Text>}
              {cls.meetLink && (
                <TouchableOpacity style={s.joinBtn} onPress={() => Linking.openURL(cls.meetLink)}>
                  <Feather name="video" size={16} color="#ffffff" />
                  <Text style={s.joinBtnText}>Open in Google Meet</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView>
            <View style={s.modal}>
              <Text style={s.modalTitle}>Schedule a Class</Text>
              <Text style={s.label}>Class Title *</Text>
              <TextInput style={s.input} placeholder="e.g. Algebra Review" placeholderTextColor={colors.mutedForeground} value={title} onChangeText={setTitle} />
              <Text style={s.label}>Subject</Text>
              <TextInput style={s.input} placeholder="e.g. Mathematics" placeholderTextColor={colors.mutedForeground} value={subject} onChangeText={setSubject} />
              <Text style={s.label}>Google Meet Link *</Text>
              <TextInput style={s.input} placeholder="https://meet.google.com/xxx-xxxx-xxx" placeholderTextColor={colors.mutedForeground} value={meetLink} onChangeText={setMeetLink} autoCapitalize="none" keyboardType="url" />
              <Text style={s.label}>Description</Text>
              <TextInput style={[s.input, { height: 70, paddingTop: 12, textAlignVertical: "top" }]} placeholder="What will you cover?" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} multiline />
              <TouchableOpacity style={s.submitBtn} onPress={handleCreate} disabled={createMutation.isPending}>
                <Text style={s.submitText}>{createMutation.isPending ? "Creating..." : "Schedule Class"}</Text>
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
