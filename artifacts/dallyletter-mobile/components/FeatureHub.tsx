import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { useListNotifications, useMarkNotificationRead, useListStudyGroups, useJoinStudyGroup } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Section = "assignments" | "exercises" | "polls" | "notifications" | "groups";
type Row = Record<string, any> & { id: number; title?: string; name?: string };

const sections: { id: Section; title: string; subtitle: string; icon: string }[] = [
  { id: "assignments", title: "Assignments", subtitle: "Due dates, submissions and feedback", icon: "clipboard" },
  { id: "exercises", title: "Exercises", subtitle: "Practice, submit answers and review results", icon: "edit-3" },
  { id: "polls", title: "Polls & quizzes", subtitle: "Timed quizzes, attempts and results", icon: "check-square" },
  { id: "notifications", title: "Notifications", subtitle: "Updates and unread alerts", icon: "bell" },
  { id: "groups", title: "Study groups", subtitle: "Groups, membership and learning communities", icon: "users" },
];

export default function FeatureHub() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [section, setSection] = useState<Section | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [answerText, setAnswerText] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submissionMap, setSubmissionMap] = useState<Record<number, Row[]>>({});
  const { data: notifications, refetch: refetchNotifications } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const { data: studyGroups, refetch: refetchGroups } = useListStudyGroups();
  const joinGroup = useJoinStudyGroup();

  const role = String(user?.role ?? "guest").toLowerCase();
  const isStudent = role === "student";
  const isTeacher = role === "teacher";
  const isStaff = isTeacher || role === "owner" || role === "admin" || role === "manager";

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) + 12, paddingHorizontal: 20, paddingBottom: 18 },
    heading: { color: "#fff", fontSize: 23, fontFamily: "Inter_700Bold" },
    subheading: { color: "rgba(255,255,255,.78)", fontSize: 13, marginTop: 5, fontFamily: "Inter_400Regular" },
    content: { padding: 16, paddingBottom: 120, gap: 10 },
    card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
    icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" },
    grow: { flex: 1 },
    cardTitle: { fontSize: 15, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    muted: { fontSize: 12, color: colors.mutedForeground, marginTop: 4, lineHeight: 17 },
    sectionTitle: { color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 10 },
    body: { color: colors.foreground, fontSize: 14, lineHeight: 21 },
    input: { minHeight: 46, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.foreground, backgroundColor: colors.card, marginBottom: 10, fontSize: 14 },
    textArea: { minHeight: 100, textAlignVertical: "top" },
    button: { minHeight: 44, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 8 },
    buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
    secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    secondaryText: { color: colors.foreground },
    pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + "18", color: colors.primary, fontSize: 11, marginTop: 6 },
    empty: { alignItems: "center", padding: 28, gap: 8 },
    separator: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    close: { padding: 8, alignSelf: "flex-end" },
  });

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", "Bearer " + token);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(getApiUrl(path), { ...init, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload;
  }, [token]);

  const loadSection = useCallback(async (target: Section) => {
    setSection(target); setSelected(null); setDetail(null); setError(""); setLoading(true); setRows([]);
    try {
      if (target === "notifications") { await refetchNotifications(); setRows([]); }
      else if (target === "groups") { await refetchGroups(); setRows([]); }
      else {
        const endpoint = target === "assignments" ? "/api/assignments" : target === "exercises" ? "/api/exercises" : "/api/polls";
        const data = await request(endpoint);
        setRows(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load content. Retry when connected."); }
    finally { setLoading(false); }
  }, [request, refetchNotifications, refetchGroups]);

  const openRow = async (row: Row) => {
    setSelected(row); setDetail(null); setAnswers({}); setAnswerText(""); setError("");
    if (section === "assignments" && isTeacher) {
      try { const data = await request(`/api/assignments/${row.id}/submissions`); setSubmissionMap(old => ({ ...old, [row.id]: Array.isArray(data) ? data : [] })); }
      catch (e) { setError(e instanceof Error ? e.message : "Submissions unavailable"); }
    } else if (section === "exercises" || section === "polls") {
      try {
        const path = section === "exercises" ? `/api/exercises/${row.id}` : `/api/polls/${row.id}`;
        setDetail(await request(path));
      } catch (e) { setError(e instanceof Error ? e.message : "Could not open this item"); }
    }
  };

  const uploadMedia = async () => {
    if (!isTeacher) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a file."); return; }
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
    if (pick.canceled || !pick.assets[0]) return;
    const asset = pick.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "lesson-media", type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
      const result = await request("/api/lessons/media", { method: "POST", body: form });
      if (!result.mediaUrl) throw new Error("Upload completed without a media link");
      setAttachmentUrl(result.mediaUrl);
      Alert.alert("Uploaded", "Media is ready to attach to your assignment.");
    } catch (e) { Alert.alert("Upload failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setUploading(false); }
  };

  const createAssignment = async () => {
    if (!isTeacher) { Alert.alert("Preview only", "Your role cannot create assignments."); return; }
    if (!newTitle.trim() || !newSubject.trim() || !newDueDate.trim()) { Alert.alert("Missing details", "Title, subject and due date are required."); return; }
    setBusy(true);
    try {
      await request("/api/assignments", { method: "POST", body: JSON.stringify({ title: newTitle.trim(), subject: newSubject.trim(), description: newDescription, dueDate: newDueDate, totalMarks: 100, attachmentUrl: attachmentUrl || "", status: "active" }) });
      setNewTitle(""); setNewSubject(""); setNewDueDate(""); setNewDescription(""); setAttachmentUrl("");
      await loadSection("assignments");
      Alert.alert("Saved", "Assignment created.");
    } catch (e) { Alert.alert("Could not create assignment", e instanceof Error ? e.message : "Retry when connected."); }
    finally { setBusy(false); }
  };

  const submitAssignment = async () => {
    if (!isStudent || !selected || !answerText.trim()) return;
    setBusy(true);
    try {
      await request(`/api/assignments/${selected.id}/submit`, { method: "POST", body: JSON.stringify({ content: answerText.trim(), fileUrl: attachmentUrl || null, fileName: attachmentUrl ? attachmentUrl.split("/").pop() : null }) });
      setAnswerText(""); setAttachmentUrl("");
      Alert.alert("Submitted", "Your work was submitted successfully.");
      await loadSection("assignments");
    } catch (e) { Alert.alert("Submission failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  };

  const submitExercise = async () => {
    if (!isStudent || !selected || !detail?.exercise) return;
    setBusy(true);
    try {
      const packedAnswers = (detail.questions || []).map((q: any) => {
        const answer = answers[String(q.id)] || {};
        return { questionId: q.id, ...answer, ...(answer.textAnswer ? {} : { textAnswer: "" }) };
      });
      await request(`/api/exercises/${detail.exercise.id}/submit`, { method: "POST", body: JSON.stringify({ newAttempt: false, answers: packedAnswers }) });
      Alert.alert("Submitted", "Exercise attempt submitted.");
      await loadSection("exercises");
    } catch (e) { Alert.alert("Submission failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  };

  const submitPoll = async () => {
    if (!isStudent || !selected || !detail) return;
    setBusy(true);
    try {
      const pollQuestions = detail.questions || [];
      const packed = pollQuestions.map((q: any) => ({ questionId: q.id, selectedOptionId: answers[String(q.id)] }));
      if (packed.some((a: any) => !a.selectedOptionId)) throw new Error("Answer every question before submitting.");
      await request(`/api/polls/${selected.id}/submit`, { method: "POST", body: JSON.stringify({ answers: packed, resultPrivacy: "private", selectedFriendIds: [] }) });
      Alert.alert("Submitted", "Your poll answers were submitted.");
      await loadSection("polls");
    } catch (e) { Alert.alert("Submission failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  };

  const markAssignment = async (sub: Row, marks: string) => {
    if (!isTeacher || !selected) return;
    const max = Number(selected.totalMarks || 100); const score = Number(marks);
    if (!Number.isFinite(score) || score < 0 || score > max) { Alert.alert("Invalid marks", `Enter a score from 0 to ${max}.`); return; }
    try {
      await request(`/api/assignments/submissions/${sub.id}/grade`, { method: "PUT", body: JSON.stringify({ marks: score, feedback: "" }) });
      const fresh = await request(`/api/assignments/${selected.id}/submissions`);
      setSubmissionMap(old => ({ ...old, [selected.id]: Array.isArray(fresh) ? fresh : [] }));
      Alert.alert("Saved", "Marks saved.");
    } catch (e) { Alert.alert("Marking failed", e instanceof Error ? e.message : "Retry."); }
  };

  const uploadAssignmentAttachment = async () => {
    if (!isStudent) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a file."); return; }
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
    if (pick.canceled || !pick.assets[0]) return;
    const asset = pick.assets[0]; setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "submission-media", type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
      const result = await request("/api/assignments/submission-material", { method: "POST", body: form });
      setAttachmentUrl(result.attachmentUrl || result.fileUrl || "");
      if (!result.attachmentUrl && !result.fileUrl) throw new Error("Upload completed without an attachment link");
    } catch (e) { Alert.alert("Upload failed", e instanceof Error ? e.message : "Retry."); }
    finally { setUploading(false); }
  };

  const openUrl = (url: string) => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); };

  const activeNotifications = notifications || [];
  const groups = studyGroups?.items || studyGroups || [];
  const unreadCount = activeNotifications.filter((n: any) => !n.isRead).length;
  const currentTitle = sections.find(s => s.id === section)?.title || "Learning tools";

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>{section ? currentTitle : "Learning tools"}</Text>
        <Text style={styles.subheading}>{section ? "Your role controls which actions are available." : "More of Dallyletter, without changing your familiar home screen."}</Text>
      </View>
      {!section ? <ScrollView contentContainerStyle={styles.content}>
        {sections.map(item => (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => void loadSection(item.id)} accessibilityRole="button">
            <View style={styles.icon}><Feather name={item.icon as any} size={21} color={colors.primary} /></View>
            <View style={styles.grow}><Text style={styles.cardTitle}>{item.title}{item.id === "notifications" && unreadCount ? ` · ${unreadCount} unread` : ""}</Text><Text style={styles.muted}>{item.subtitle}</Text></View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => { setSection(null); setSelected(null); setDetail(null); setError(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}><Feather name="arrow-left" size={18} color={colors.primary}/><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>All learning tools</Text></TouchableOpacity>
        {section === "assignments" && isTeacher && <>
          <Text style={styles.sectionTitle}>Create assignment</Text>
          <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="Assignment title" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={styles.input} value={newSubject} onChangeText={setNewSubject} placeholder="Subject" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={styles.input} value={newDueDate} onChangeText={setNewDueDate} placeholder="Due date (YYYY-MM-DD)" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={[styles.input, styles.textArea]} multiline value={newDescription} onChangeText={setNewDescription} placeholder="Instructions and details" placeholderTextColor={colors.mutedForeground}/>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => void uploadMedia()} disabled={uploading}><Text style={[styles.buttonText, styles.secondaryText]}>{uploading ? "Uploading…" : attachmentUrl ? "Replace attachment" : "Upload image/video attachment"}</Text></TouchableOpacity>
          {attachmentUrl ? <Text style={styles.muted}>Attachment uploaded: {attachmentUrl}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={() => void createAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Saving…" : "Publish assignment"}</Text></TouchableOpacity>
          <View style={styles.separator}/>
        </>}
        {loading ? <ActivityIndicator color={colors.primary} size="large"/> : error ? <View style={styles.empty}><Text style={styles.body}>{error}</Text><TouchableOpacity style={styles.button} onPress={() => section && void loadSection(section)}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity></View> : null}
        {section === "notifications" && activeNotifications.map((n: any) => <TouchableOpacity key={n.id} style={styles.card} onPress={() => { if (!n.isRead) markRead.mutate({ id: n.id } as any); if (n.actionUrl) openUrl(n.actionUrl); }}><View style={styles.icon}><Feather name={n.isRead ? "bell" : "bell-ring"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{n.title || n.message || "Notification"}</Text><Text style={styles.muted}>{n.body || n.description || n.createdAt || ""}</Text></View>{!n.isRead && <View style={{width:8,height:8,borderRadius:4,backgroundColor:colors.accent}}/>}</TouchableOpacity>)}
        {section === "groups" && (Array.isArray(groups) ? groups : []).map((g: any) => <View key={g.id} style={styles.card}><View style={styles.icon}><Feather name="users" size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{g.name}</Text><Text style={styles.muted}>{g.subject || "Study group"} · {g.memberCount ?? g.members?.length ?? 0} members</Text><Text style={styles.muted}>{g.description || ""}</Text></View>{!g.isMember && isStudent && <TouchableOpacity onPress={() => joinGroup.mutate({ id: g.id } as any)}><Text style={{color:colors.primary,fontFamily:"Inter_600SemiBold"}}>Join</Text></TouchableOpacity>}</View>)}
        {["assignments", "exercises", "polls"].includes(section) && rows.map(row => <TouchableOpacity key={row.id} style={styles.card} onPress={() => void openRow(row)}><View style={styles.icon}><Feather name={section === "assignments" ? "clipboard" : section === "exercises" ? "edit-3" : "check-square"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{row.title || row.name || "Untitled"}</Text><Text style={styles.muted}>{[row.subject, row.grade, row.dueDate ? `Due ${String(row.dueDate).slice(0,10)}` : null, row.status].filter(Boolean).join(" · ")}</Text>{row.description ? <Text numberOfLines={3} style={styles.muted}>{row.description}</Text> : null}{row.attachmentUrl ? <Text style={{color:colors.primary,fontSize:12,marginTop:5}}>Attachment available</Text> : null}</View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/></TouchableOpacity>)}
        {section === "assignments" && isStudent && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submit: {selected.title}</Text><TextInput style={[styles.input,styles.textArea]} multiline value={answerText} onChangeText={setAnswerText} placeholder="Write your answer or submission notes" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void uploadAssignmentAttachment()} disabled={uploading}><Text style={[styles.buttonText,styles.secondaryText]}>{uploading ? "Uploading…" : attachmentUrl ? "Replace attachment" : "Attach image/video"}</Text></TouchableOpacity><TouchableOpacity style={styles.button} onPress={() => void submitAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Submitting…" : "Submit assignment"}</Text></TouchableOpacity></View></View>}
        {section === "assignments" && isTeacher && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submissions · {selected.title}</Text>{(submissionMap[selected.id] || []).map(sub => <View key={sub.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{sub.studentName || sub.student?.name || `Learner #${sub.studentId ?? "?"}`}</Text><Text style={styles.muted}>{sub.content || sub.fileName || "No written response"} · {sub.status || "Submitted"}</Text>{sub.fileUrl && <TouchableOpacity onPress={() => openUrl(sub.fileUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity>}<TextInput style={styles.input} keyboardType="numeric" placeholder={`Marks / ${selected.totalMarks || 100}`} placeholderTextColor={colors.mutedForeground} onSubmitEditing={e => void markAssignment(sub,e.nativeEvent.text)}/></View>)}</View></View>}
        {(section === "exercises" || section === "polls") && selected && detail && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>{detail.exercise?.title || detail.poll?.title || selected.title}</Text><Text style={styles.body}>{detail.exercise?.description || detail.description || ""}</Text>{(detail.questions || []).map((q: any, index: number) => <View key={q.id} style={{marginTop:16,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}><Text style={styles.cardTitle}>{index+1}. {q.question || q.prompt || "Question"}</Text>{q.imageUrl && <TouchableOpacity onPress={() => openUrl(q.imageUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open question image</Text></TouchableOpacity>}{section === "polls" ? (q.options || []).map((o:any) => <TouchableOpacity key={o.id} style={[styles.card,{marginTop:8,borderColor:answers[String(q.id)]===o.id?colors.primary:colors.border}]} onPress={() => setAnswers(a=>({...a,[String(q.id)]:o.id}))}><Feather name={answers[String(q.id)]===o.id?"check-circle":"circle"} size={18} color={colors.primary}/><Text style={[styles.body,{flex:1}]}>{o.text}</Text></TouchableOpacity>) : <TextInput style={[styles.input,styles.textArea,{marginTop:8}]} multiline value={answers[String(q.id)]?.textAnswer || ""} onChangeText={v=>setAnswers(a=>({...a,[String(q.id)]:{textAnswer:v}}))} placeholder="Your answer" placeholderTextColor={colors.mutedForeground}/>}</View>)}{isStudent && <TouchableOpacity style={styles.button} onPress={() => section==="polls"?void submitPoll():void submitExercise()} disabled={busy}><Text style={styles.buttonText}>{busy?"Submitting…":section==="polls"?"Submit quiz":"Submit exercise"}</Text></TouchableOpacity>}{!isStudent && <Text style={styles.muted}>Preview only: staff can inspect content but cannot submit as a learner.</Text>}</View></View>}
        {!loading && !error && section === "assignments" && rows.length === 0 && <Text style={styles.muted}>No assignments are available yet.</Text>}
        {!loading && !error && section === "exercises" && rows.length === 0 && <Text style={styles.muted}>No exercises are available yet.</Text>}
        {!loading && !error && section === "polls" && rows.length === 0 && <Text style={styles.muted}>No polls are available yet.</Text>}
        {section === "groups" && Array.isArray(groups) && groups.length === 0 && <Text style={styles.muted}>No study groups are available yet.</Text>}
      </ScrollView>}
    </View>
  );
}
