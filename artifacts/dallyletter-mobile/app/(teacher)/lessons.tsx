import { Feather } from "@expo/vector-icons";
import { getApiUrl, useCreateLesson, useUpdateLesson, useDeleteLesson, useListLessons } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
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

function extractLessonLinks(value: unknown): string[] {
  const source = String(value ?? "");
  const candidates: string[] = [];
  for (const match of source.matchAll(/\b(?:href|src)\s*=\s*["\']([^"\']+)["\']/gi)) candidates.push(match[1]);
  for (const match of source.matchAll(/https?:\/\/[^\s<>"\']+/gi)) candidates.push(match[0].replace(/[),.;]+$/, ""));
  return [...new Set(candidates.map(link => link.trim()).filter(link => /^https?:\/\//i.test(link) || link.startsWith("/api/")))];
}
function isMediaReference(url: string): boolean {
  const lower = url.toLowerCase();
  return /[?&]type=(image|video|audio)\//i.test(lower) || /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|mp3|m4a|ogg|wav|pdf|docx?)(?:[?#]|$)/i.test(lower);
}

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
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [notifyingLessonId, setNotifyingLessonId] = useState<number | null>(null);

  const resetLessonForm = () => {
    setShowModal(false); setEditingLessonId(null);
    setTitle(""); setSubject(""); setMediaUrl(""); setContent(""); setGrade(""); setType("notes");
  };
  const createMutation = useCreateLesson({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetch(); resetLessonForm();
        Alert.alert("Lesson saved", editingLessonId ? "Lesson changes were saved." : "Your lesson was created.");
      },
      onError: () => Alert.alert("Error", "Could not save lesson. Please try again."),
    },
  });
  const updateMutation = useUpdateLesson({
    mutation: {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); resetLessonForm(); Alert.alert("Lesson updated", "Your changes are saved."); },
      onError: () => Alert.alert("Update failed", "Could not update this lesson. Please try again."),
    },
  });
  const deleteMutation = useDeleteLesson({
    mutation: {
      onSuccess: () => { refetch(); Alert.alert("Lesson deleted", "The lesson was removed."); },
      onError: () => Alert.alert("Delete failed", "Could not delete this lesson. Please try again."),
    },
  });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleUploadMedia = async (documentOnly = false) => {
    let asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null };
    if (documentOnly) {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      asset = { uri: picked.assets[0].uri, fileName: picked.assets[0].name, mimeType: picked.assets[0].mimeType, type: "document" };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Media permission needed", "Allow photo/video access to attach lesson media."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85, allowsEditing: false });
      if (result.canceled || !result.assets[0]) return;
      asset = result.assets[0];
    }
    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || (asset.type === "video" ? "lesson-video.mp4" : "lesson-image.jpg"),
        type: asset.mimeType || (asset.type === "document" ? (asset.fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : asset.fileName?.toLowerCase().endsWith(".doc") ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") : asset.type === "video" ? "video/mp4" : "image/jpeg"),
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
      else if (asset.type === "document") setType("mixed");
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
    const data = { title: title.trim(), subject: subject.trim(), type, mediaUrl: mediaUrl || null, content: content || null, grade: grade || null };
    if (editingLessonId !== null) updateMutation.mutate({ id: editingLessonId, data });
    else createMutation.mutate({ data });
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
        <TouchableOpacity style={s.addBtn} onPress={() => { resetLessonForm(); setShowModal(true); }}>
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
                {extractLessonLinks(lesson.content).map((url,index) => <View key={url} style={{marginTop:6}}>
                  {isMediaReference(url) ? <AuthenticatedMediaPreview url={url} height={120} accessibilityLabel={"Embedded lesson media "+(index+1)} /> : null}
                  {url.startsWith("/api/") ? <Text style={s.meta}>Protected attachment · download above to save offline</Text> : <TouchableOpacity onPress={() => void Linking.openURL(url)}><Text style={[s.meta,{color:colors.primary}]}>Open embedded link {index+1}: {url}</Text></TouchableOpacity>}
                </View>)}
                {lesson.mediaUrl ? <View style={{marginTop:6}}>
                  {!/^https?:\/\//i.test(String(lesson.mediaUrl)) ? <AuthenticatedMediaPreview url={String(lesson.mediaUrl)} height={120} accessibilityLabel={String(lesson.title || "Lesson media")} /> : null}
                  {/^https?:\/\//i.test(String(lesson.mediaUrl)) ? <TouchableOpacity onPress={() => void Linking.openURL(String(lesson.mediaUrl))}><Text style={[s.meta,{color:colors.primary}]}>Open external lesson media</Text></TouchableOpacity> : <Text style={s.meta}>Protected lesson media · use the download control to save offline</Text>}
                </View> : null}
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit lesson" onPress={() => { setEditingLessonId(lesson.id); setTitle(String(lesson.title ?? "")); setSubject(String(lesson.subject ?? "")); setType((lesson.type ?? "notes") as typeof lessonTypes[number]); setMediaUrl(String(lesson.mediaUrl ?? "")); setContent(String(lesson.content ?? "")); setGrade(String(lesson.grade ?? "")); setShowModal(true); }}><Feather name="edit-2" size={18} color={colors.primary}/></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Notify lesson followers" disabled={notifyingLessonId===lesson.id} onPress={async () => { setNotifyingLessonId(lesson.id); try { const response=await fetch(getApiUrl(`/api/lessons/${lesson.id}/notify-followers`),{method:"POST",headers:token?{Authorization:"Bearer "+token}:{}}); const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload.error||"Notification request failed"); Alert.alert("Followers notified",payload.message||"Lesson notification was queued."); } catch(error) { Alert.alert("Could not notify followers",error instanceof Error?error.message:"Please retry."); } finally { setNotifyingLessonId(null); } }}><Feather name="bell" size={18} color={colors.primary}/></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete lesson" onPress={() => Alert.alert("Delete lesson?", "This removes the lesson from your teaching list. This action cannot be undone.", [{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>deleteMutation.mutate({id:lesson.id})}])}><Feather name="trash-2" size={18} color="#dc2626"/></TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView>
            <View style={s.modal}>
              <Text style={s.modalTitle}>{editingLessonId !== null ? "Edit Lesson" : "New Lesson"}</Text>

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
              <TouchableOpacity style={[s.submitBtn,{marginBottom:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={() => void handleUploadMedia(true)} disabled={uploadingMedia}><Text style={[s.submitText,{color:colors.foreground}]}>{uploadingMedia?"Uploading media…":"Choose PDF/Word document"}</Text></TouchableOpacity>
              <Text style={s.label}>Media or embedded link</Text>
              <TextInput style={s.input} placeholder="Paste a video, audio, document or web link" placeholderTextColor={colors.mutedForeground} value={mediaUrl} onChangeText={setMediaUrl} autoCapitalize="none" />
              {mediaUrl && /^https?:\/\//i.test(mediaUrl) ? <TouchableOpacity onPress={() => void Linking.openURL(mediaUrl)}><Text style={{ color: colors.primary, fontSize: 12, marginBottom: 12 }}>Preview external media / link</Text></TouchableOpacity> : mediaUrl ? <View style={{marginBottom:12}}><AuthenticatedMediaPreview url={mediaUrl} height={140} accessibilityLabel="Lesson attachment"/><Text style={s.meta}>Protected media · download to save offline before sharing with learners.</Text></View> : null}

              <Text style={s.label}>Notes / Content</Text>
              <TextInput
                style={[s.input, { height: 80, paddingTop: 12, textAlignVertical: "top" }]}
                placeholder="Add notes or description..."
                placeholderTextColor={colors.mutedForeground}
                value={content}
                onChangeText={setContent}
                multiline
              />

              <TouchableOpacity style={s.submitBtn} onPress={handleCreate} disabled={createMutation.isPending || updateMutation.isPending}>
                <Text style={s.submitText}>{createMutation.isPending || updateMutation.isPending ? "Saving..." : editingLessonId !== null ? "Save Changes" : "Create Lesson"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={resetLessonForm}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
