import { Feather } from "@expo/vector-icons";
import { getApiUrl, useCreateLesson, useListLessons } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";

const lessonTypes = ["video", "image", "audio", "notes", "mixed"] as const;

export default function TeacherLessons() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { data: lessons, isLoading, refetch } = useListLessons();
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<typeof lessonTypes[number]>("notes");
  const [mediaUrl, setMediaUrl] = useState("");
  const [content, setContent] = useState("");
  const [grade, setGrade] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const createMutation = useCreateLesson({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetch();
        setShowModal(false);
        setTitle(""); setSubject(""); setMediaUrl(""); setContent(""); setGrade("");
      },
      onError: () => Alert.alert("Error", "Could not create lesson. Please try again."),
    },
  });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleUploadMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Media permission needed", "Allow photo/video access to attach lesson media.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || (asset.type === "video" ? "lesson-video.mp4" : "lesson-image.jpg"),
        type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      } as any);
      const response = await fetch(getApiUrl("/api/lessons/media"), {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : {},
        body: form,
      });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.mediaUrl) throw new Error(uploaded.error || "Media upload failed");
      setMediaUrl(String(uploaded.mediaUrl));
      if (asset.type === "video") setType("video");
      else setType("image");
      Alert.alert("Upload complete", "Media is attached to this lesson draft. Save the lesson to publish it.");
    } catch (error) {
      Alert.alert("Upload failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleCreate = () => {
    if (!title.trim() || !subject.trim()) {
      Alert.alert("Missing fields", "Title and subject are required.");
      return;
    }
    createMutation.mutate({
      data: { title: title.trim(), subject: subject.trim(), type, mediaUrl: mediaUrl || undefined, content: content || undefined, grade: grade || undefined },
    });
  };

  const typeColor: Record<string, string> = {
    video: "#8b5cf6", image: "#3b82f6", audio: "#10b981", notes: "#f59e0b", mixed: "#ef4444",
  };
  const typeIcon: Record<string, any> = {
    video: "play-circle", image: "image", audio: "headphones", notes: "file-text", mixed: "layers",
  };

  const myLessons = lessons?.filter((l: any) => l.teacherId === user?.id) ?? [];

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
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconWrap: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
    info: { flex: 1 },
    lessonTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptyBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
    emptyBtnText: { color: "#ffffff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
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
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
    typeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
    },
    submitText: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 16 },
    cancelText: { textAlign: "center", marginTop: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>My Lessons</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
          <Feather name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={myLessons}
        style={s.list}
        contentContainerStyle={s.listContent}
        keyExtractor={(item: any) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="book-open" size={48} color={colors.border} />
            <Text style={s.emptyText}>{isLoading ? "Loading..." : "No lessons yet"}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={s.emptyBtnText}>Add First Lesson</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: lesson }) => {
          const col = typeColor[lesson.type] ?? "#6b7280";
          return (
            <View style={s.card}>
              <View style={[s.iconWrap, { backgroundColor: col + "20" }]}>
                <Feather name={typeIcon[lesson.type] ?? "file"} size={20} color={col} />
              </View>
              <View style={s.info}>
                <Text style={s.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
                <Text style={s.meta}>{lesson.subject}{lesson.grade ? ` · Grade ${lesson.grade}` : ""}</Text>
                {lesson.mediaUrl && lesson.type === "image" ? <AuthenticatedMediaPreview url={String(lesson.mediaUrl)} height={140} accessibilityLabel={String(lesson.title || "Lesson image")} /> : null}
                {lesson.content ? <Text style={s.meta} numberOfLines={3}>{String(lesson.content).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</Text> : null}
                {lesson.mediaUrl ? <TouchableOpacity onPress={() => { const url = /^https?:\/\//i.test(String(lesson.mediaUrl)) ? String(lesson.mediaUrl) : `https://dallyletter-elidems-smart-caps-lms-4.onrender.com${String(lesson.mediaUrl).startsWith("/") ? "" : "/"}${lesson.mediaUrl}`; void Linking.openURL(url); }}><Text style={[s.meta, { color: colors.primary }]}>Open attached media / embedded link</Text></TouchableOpacity> : null}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView>
            <View style={s.modal}>
              <Text style={s.modalTitle}>New Lesson</Text>

              <Text style={s.label}>Title *</Text>
              <TextInput style={s.input} placeholder="Lesson title" placeholderTextColor={colors.mutedForeground} value={title} onChangeText={setTitle} />

              <Text style={s.label}>Subject *</Text>
              <TextInput style={s.input} placeholder="e.g. Mathematics" placeholderTextColor={colors.mutedForeground} value={subject} onChangeText={setSubject} />

              <Text style={s.label}>Grade</Text>
              <TextInput style={s.input} placeholder="e.g. Grade 10" placeholderTextColor={colors.mutedForeground} value={grade} onChangeText={setGrade} />

              <Text style={s.label}>Type</Text>
              <View style={s.typeRow}>
                {lessonTypes.map((t) => {
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

              <Text style={s.label}>Upload media</Text>
              <TouchableOpacity style={[s.submitBtn, { marginBottom: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]} onPress={() => void handleUploadMedia()} disabled={uploadingMedia}>
                <Text style={[s.submitText, { color: colors.foreground }]}>{uploadingMedia ? "Uploading media…" : mediaUrl ? "Replace uploaded image/video" : "Choose image or video"}</Text>
              </TouchableOpacity>
              <Text style={s.label}>Media or embedded link</Text>
              <TextInput style={s.input} placeholder="Paste a video, audio, document or web link" placeholderTextColor={colors.mutedForeground} value={mediaUrl} onChangeText={setMediaUrl} autoCapitalize="none" />
              {mediaUrl ? <TouchableOpacity onPress={() => { const url = /^https?:\/\//i.test(mediaUrl) ? mediaUrl : `https://dallyletter-elidems-smart-caps-lms-4.onrender.com${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`; void Linking.openURL(url); }}><Text style={{ color: colors.primary, fontSize: 12, marginBottom: 12 }}>Preview attached media / link</Text></TouchableOpacity> : null}

              <Text style={s.label}>Notes / Content</Text>
              <TextInput
                style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: "top" }]}
                placeholder="Add notes or description..."
                placeholderTextColor={colors.mutedForeground}
                value={content}
                onChangeText={setContent}
                multiline
              />

              <TouchableOpacity style={s.submitBtn} onPress={handleCreate} disabled={createMutation.isPending}>
                <Text style={s.submitText}>{createMutation.isPending ? "Saving..." : "Create Lesson"}</Text>
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
