import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@workspace/api-client-react";
import { getListNotificationsQueryKey, useListNotifications, useMarkNotificationRead, useListStudyGroups } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";
import MobileDrawAnswer from "@/components/MobileDrawAnswer";

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
  const [exerciseResult, setExerciseResult] = useState<any>(null);
  const [newAttempt, setNewAttempt] = useState(false);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingAnswerId, setUploadingAnswerId] = useState<number | null>(null);
  const [submissionMap, setSubmissionMap] = useState<Record<number, Row[]>>({});
  const [assignmentMarks, setAssignmentMarks] = useState<Record<number, string>>({});
  const [assignmentFeedback, setAssignmentFeedback] = useState<Record<number, string>>({});
  const [selectedSubmission, setSelectedSubmission] = useState<Row | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<any>(null);
  const [exerciseMarks, setExerciseMarks] = useState<Record<number, string>>({});
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});
  const [overallComment, setOverallComment] = useState("");
  const [pollTitle, setPollTitle] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollSubject, setPollSubject] = useState("");
  const [pollGrade, setPollGrade] = useState("");
  const [pollChoices, setPollChoices] = useState(["", "", "", ""]);
  const [pollCorrect, setPollCorrect] = useState(0);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollResult, setPollResult] = useState<any>(null);
  const [pollPrivacy, setPollPrivacy] = useState<"private" | "public">("private");
  const [groupName, setGroupName] = useState("");
  const [groupSubject, setGroupSubject] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [selectedChatGroup, setSelectedChatGroup] = useState<Row | null>(null);
  const [chatMessages, setChatMessages] = useState<Row[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatMediaBusy, setChatMediaBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [groupSettings, setGroupSettings] = useState<any>(null);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);
  const [groupRules, setGroupRules] = useState("");
  const queryClient = useQueryClient();
  const { data: notifications, refetch: refetchNotifications } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const { data: studyGroups, refetch: refetchGroups } = useListStudyGroups();


  const role = String(user?.role ?? "guest").toLowerCase();
  const isStudent = role === "student";
  const isTeacher = role === "teacher";
  const canCreateGroups = isTeacher || Boolean(user?.isPrefect || user?.isManager) || ["owner", "admin", "platform_owner"].includes(role);
  const exerciseLocked = Boolean(exerciseResult?.submission?.status) && !newAttempt;

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

  useEffect(() => {
    if (section !== "exercises" || !isStudent || !selected || !detail?.exercise?.id || !user?.id) return;
    let active = true;
    const key = `dallyletter_exercise_draft_${user.id}_${detail.exercise.id}`;
    setDraftKey(null);
    void AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      if (raw) {
        try { setAnswers(JSON.parse(raw)); } catch { /* Ignore a corrupt draft rather than blocking the exercise. */ }
      }
      setDraftKey(key);
    }).catch(() => { if (active) setDraftKey(key); });
    return () => { active = false; };
  }, [section, isStudent, selected?.id, detail?.exercise?.id, user?.id]);

  useEffect(() => {
    if (draftKey) void AsyncStorage.setItem(draftKey, JSON.stringify(answers)).catch(() => undefined);
  }, [answers, draftKey]);

  const loadSection = useCallback(async (target: Section) => {
    setSection(target); setSelected(null); setDetail(null); setSelectedSubmission(null); setSubmissionDetail(null); setError(""); setLoading(true); setRows([]);
    const cacheKey = user?.id && ["assignments", "exercises", "polls"].includes(target)
      ? `dallyletter_mobile_list_${user.id}_${role}_${target}_v1`
      : null;
    try {
      if (target === "notifications") { await refetchNotifications(); setRows([]); }
      else if (target === "groups") { await refetchGroups(); setRows([]); }
      else {
        let loadedRows: Row[] = [];
        if (target === "exercises") {
          const lessons = await request("/api/lessons");
          const lessonRows = Array.isArray(lessons) ? lessons : [];
          const perLesson = await Promise.all(lessonRows.map(async (lesson: any) => {
            try {
              const items = await request(`/api/exercises/lessons/${lesson.id}/exercises`);
              return (Array.isArray(items) ? items : []).map((item: any) => ({ ...item, lessonTitle: lesson.title, lessonId: lesson.id }));
            } catch { return []; }
          }));
          loadedRows = perLesson.flat();
        } else {
          const endpoint = target === "assignments" ? "/api/assignments" : "/api/polls";
          const data = await request(endpoint);
          loadedRows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        }
        setRows(loadedRows);
        if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify(loadedRows)).catch(() => undefined);
      }
    } catch (e) {
      if (cacheKey) {
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (cached) {
          try {
            const saved = JSON.parse(cached);
            if (Array.isArray(saved)) {
              setRows(saved);
              setError("Offline mode: showing this account's saved list. Reconnect to refresh details and submit changes.");
              return;
            }
          } catch { /* Ignore invalid cached data and show the real load error. */ }
        }
      }
      setError(e instanceof Error ? e.message : "Could not load content. Retry when connected.");
    } finally { setLoading(false); }
  }, [request, refetchNotifications, refetchGroups, user?.id, role]);

  const openRow = async (row: Row) => {
    setSelected(row); setDetail(null); setSelectedSubmission(null); setSubmissionDetail(null); setAnswers({}); setAnswerText(""); setPollResult(null); setExerciseResult(null); setNewAttempt(false); setError("");
    if (section === "assignments" && (isTeacher || isStudent)) {
      try { const data = await request(`/api/assignments/${row.id}/submissions`); setSubmissionMap(old => ({ ...old, [row.id]: Array.isArray(data) ? data : [] })); }
      catch (e) { setError(e instanceof Error ? e.message : "Submissions unavailable"); }
    }
    if (section === "exercises" || section === "polls") {
      try {
        const path = section === "exercises" ? `/api/exercises/${row.id}` : `/api/polls/${row.id}`;
        setDetail(await request(path));
        if (section === "exercises" && isStudent) {
          const result = await request(`/api/exercises/${row.id}/result`).catch(() => null);
          setExerciseResult(result);
        }
        if (section === "exercises" && isTeacher) {
          const submissions = await request(`/api/exercises/${row.id}/submissions`);
          setSubmissionMap(old => ({ ...old, [row.id]: Array.isArray(submissions) ? submissions : [] }));
        }
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
      const result = await request("/api/assignments/material", { method: "POST", body: form });
      if (!result.attachmentUrl) throw new Error("Upload completed without an attachment link");
      setAttachmentUrl(result.attachmentUrl);
      Alert.alert("Uploaded", "Media is ready to attach to your assignment.");
    } catch (e) { Alert.alert("Upload failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setUploading(false); }
  };

  const createAssignment = async () => {
    if (!isTeacher) { Alert.alert("Preview only", "Your role cannot create assignments."); return; }
    if (!newTitle.trim() || !newSubject.trim() || !newDueDate.trim()) { Alert.alert("Missing details", "Title, subject and due date are required."); return; }
    setBusy(true);
    try {
      const payload = { title: newTitle.trim(), subject: newSubject.trim(), description: newDescription, dueDate: newDueDate, totalMarks: 100, attachmentUrl: attachmentUrl || "", status: "active" };
      if (editingAssignmentId !== null) await request(`/api/assignments/${editingAssignmentId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await request("/api/assignments", { method: "POST", body: JSON.stringify(payload) });
      setNewTitle(""); setNewSubject(""); setNewDueDate(""); setNewDescription(""); setAttachmentUrl(""); setEditingAssignmentId(null);
      await loadSection("assignments");
      Alert.alert("Saved", editingAssignmentId !== null ? "Assignment updated." : "Assignment created.");
    } catch (e) { Alert.alert("Could not create assignment", e instanceof Error ? e.message : "Retry when connected."); }
    finally { setBusy(false); }
  };

  const editAssignment = (row: Row) => {
    if (!isTeacher) return;
    setEditingAssignmentId(row.id);
    setNewTitle(String(row.title ?? "")); setNewSubject(String(row.subject ?? ""));
    setNewDueDate(String(row.dueDate ?? "").slice(0, 10)); setNewDescription(String(row.description ?? ""));
    setAttachmentUrl(String(row.attachmentUrl ?? ""));
    setSelected(null);
    setSection("assignments");
  };

  const toggleAssignmentReference = async (row: Row) => {
    if (!isTeacher) return;
    const hidden = !Boolean(row.referenceMaterialHidden);
    try {
      await request(`/api/assignments/${row.id}/reference-visibility`, { method: "PATCH", body: JSON.stringify({ hidden }) });
      setRows(old => old.map(item => item.id === row.id ? { ...item, referenceMaterialHidden: hidden } : item));
      if (selected?.id === row.id) setSelected(old => old ? { ...old, referenceMaterialHidden: hidden } : old);
      Alert.alert("Reference visibility updated", hidden ? "Learners can no longer see this material." : "Reference material is visible to learners.");
    } catch (e) { Alert.alert("Could not update visibility", e instanceof Error ? e.message : "Please retry."); }
  };

  const deleteAssignment = (row: Row) => {
    if (!isTeacher) return;
    Alert.alert("Delete assignment?", "Deleting an assignment may also remove its submissions. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await request(`/api/assignments/${row.id}`, { method: "DELETE" });
          setRows(old => old.filter(item => item.id !== row.id));
          if (selected?.id === row.id) setSelected(null);
          Alert.alert("Assignment deleted", "The assignment was removed.");
        } catch (e) { Alert.alert("Delete failed", e instanceof Error ? e.message : "Please retry."); }
      } },
    ]);
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

  const uploadExerciseAnswerMedia = async (questionId: number) => {
    if (!isStudent) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Media permission needed", "Allow photo/video access to attach an answer."); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUploadingAnswerId(questionId);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "exercise-answer", type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
      const result = await request("/api/exercises/answer-media", { method: "POST", body: form });
      if (!result.mediaUrl) throw new Error("Upload completed without a media link");
      setAnswers(old => ({ ...old, [String(questionId)]: { ...(old[String(questionId)] || {}), mediaReference: result.mediaUrl } }));
    } catch (e) { Alert.alert("Answer upload failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setUploadingAnswerId(null); }
  };

  const submitExercise = async () => {
    if (!isStudent || !selected || !detail?.exercise) return;
    setBusy(true);
    try {
      const packedAnswers = (detail.questions || []).map((q: any) => {
        const answer = answers[String(q.id)] || {};
        return { questionId: q.id, ...answer, ...(answer.textAnswer ? {} : { textAnswer: "" }), ...(answer.drawData ? { drawData: { ...(answer.drawData as any), teacherDrawing: q.config?.teacherDrawing ?? null, learnerDrawing: answer.drawData } } : {}) };
      });
      await request(`/api/exercises/${detail.exercise.id}/submit`, { method: "POST", body: JSON.stringify({ newAttempt, answers: packedAnswers }) });
      if (draftKey) await AsyncStorage.removeItem(draftKey).catch(() => undefined);
      setDraftKey(null);
      setNewAttempt(false);
      const result = await request(`/api/exercises/${detail.exercise.id}/result`).catch(() => null);
      setExerciseResult(result || { submission: { status: "submitted" } });
      Alert.alert("Submitted", "Exercise attempt submitted.");
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
      await request(`/api/polls/${selected.id}/submit`, { method: "POST", body: JSON.stringify({ answers: packed, resultPrivacy: pollPrivacy, selectedFriendIds: [] }) });
      const result = await request(`/api/polls/${selected.id}/my-results`);
      setPollResult(result);
      Alert.alert("Submitted", "Your poll answers were submitted. Results are shown below.");
    } catch (e) { Alert.alert("Submission failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  };

  const refreshGroupMessages = async (groupId: number) => {
    setChatLoading(true); setChatError("");
    try {
      const result = await request(`/api/messages?groupId=${groupId}`);
      setChatMessages(Array.isArray(result) ? result : []);
    } catch (e) { setChatError(e instanceof Error ? e.message : "Could not load group messages."); }
    finally { setChatLoading(false); }
  };

  const canManageSelectedGroup = Boolean(selectedChatGroup && (selectedChatGroup.creatorId === user?.id || user?.isManager || ["owner", "admin", "platform_owner"].includes(role)));

  const loadGroupSettings = async () => {
    if (!selectedChatGroup || !canManageSelectedGroup) return;
    setGroupSettingsBusy(true);
    try {
      const result = await request(`/api/study-groups/${selectedChatGroup.id}/settings`);
      setGroupSettings(result); setGroupRules(String(result.rules || "")); setGroupSettingsOpen(true);
    } catch (e) { Alert.alert("Group settings unavailable", e instanceof Error ? e.message : "Your role cannot manage this group's settings."); }
    finally { setGroupSettingsBusy(false); }
  };

  const saveGroupSettings = async (patch: Record<string, unknown> = {}) => {
    if (!selectedChatGroup || !canManageSelectedGroup || groupSettingsBusy) return;
    setGroupSettingsBusy(true);
    try {
      const result = await request(`/api/study-groups/${selectedChatGroup.id}/settings`, { method: "PATCH", body: JSON.stringify({ ...patch, ...(Object.prototype.hasOwnProperty.call(patch, "rules") ? {} : { rules: groupRules }) }) });
      setGroupSettings(result); setGroupRules(String(result.rules || ""));
      Alert.alert("Settings saved", "The study group settings were updated.");
    } catch (e) { Alert.alert("Could not save settings", e instanceof Error ? e.message : "Please retry."); }
    finally { setGroupSettingsBusy(false); }
  };

  const openGroupChat = async (group: Row) => {
    if (!group.isMember) { Alert.alert("Join this group first", "Group conversations are only available to members."); return; }
    setSelectedChatGroup(group); setChatMessages([]); setChatDraft(""); setGroupSettings(null); setGroupSettingsOpen(false);
    await refreshGroupMessages(group.id);
  };

  const sendGroupMessage = async () => {
    if (!selectedChatGroup || !chatDraft.trim() || chatSending) return;
    setChatSending(true);
    try {
      await request("/api/messages", { method: "POST", body: JSON.stringify({ content: chatDraft.trim(), type: "text", groupId: selectedChatGroup.id }) });
      setChatDraft(""); await refreshGroupMessages(selectedChatGroup.id);
    } catch (e) { Alert.alert("Message not sent", e instanceof Error ? e.message : "Please retry."); }
    finally { setChatSending(false); }
  };

  const uploadGroupMessageMedia = async () => {
    if (!selectedChatGroup) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a group message."); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0]; setChatMediaBusy(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "group-media", type: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
      form.append("groupId", String(selectedChatGroup.id));
      const uploaded = await request("/api/messages/media", { method: "POST", body: form });
      if (!uploaded?.mediaUrl) throw new Error("Upload completed without a media URL.");
      await request("/api/messages", { method: "POST", body: JSON.stringify({ content: asset.fileName || "Learning media", type: "media", groupId: selectedChatGroup.id, mediaUrl: uploaded.mediaUrl }) });
      await refreshGroupMessages(selectedChatGroup.id);
    } catch (e) { Alert.alert("Media not sent", e instanceof Error ? e.message : "Please retry."); }
    finally { setChatMediaBusy(false); }
  };

  const leaveStudyGroup = async (group: Row) => {
    Alert.alert("Leave study group?", `You will leave ${group.name}. You can join again later if membership is open.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Leave group", style: "destructive", onPress: async () => {
        try { await request(`/api/study-groups/${group.id}/leave`, { method: "POST" }); setSelectedChatGroup(null); await refetchGroups(); }
        catch (e) { Alert.alert("Could not leave group", e instanceof Error ? e.message : "Please retry."); }
      } },
    ]);
  };

  const createStudyGroup = async () => {
    if (!canCreateGroups) { Alert.alert("Permission denied", "Your role cannot create study groups."); return; }
    if (!groupName.trim() || !groupSubject.trim()) { Alert.alert("Missing details", "Enter a group name and subject."); return; }
    setGroupBusy(true);
    try {
      await request("/api/study-groups", { method: "POST", body: JSON.stringify({ name: groupName.trim(), subject: groupSubject.trim(), description: groupDescription.trim() || null }) });
      setGroupName(""); setGroupSubject(""); setGroupDescription("");
      await refetchGroups();
      Alert.alert("Group created", "Your study group was created.");
    } catch (e) { Alert.alert("Could not create group", e instanceof Error ? e.message : "Please retry."); }
    finally { setGroupBusy(false); }
  };

  const createAndPublishPoll = async () => {
    if (!isTeacher) return;
    if (!pollTitle.trim() || !pollQuestion.trim() || pollChoices.filter(x => x.trim()).length < 2) { Alert.alert("Complete the poll", "Enter a title, question and at least two answer choices."); return; }
    setPollBusy(true);
    try {
      const questions = [{ question: pollQuestion.trim(), difficulty: "medium", options: pollChoices.map((text, index) => ({ text: text.trim(), isCorrect: index === pollCorrect })).filter(option => option.text) }];
      const created = await request("/api/polls", { method: "POST", body: JSON.stringify({ title: pollTitle.trim(), subject: pollSubject.trim() || undefined, grade: pollGrade.trim() || undefined, mode: "practice", type: "manual", questions }) });
      if (!created?.id) throw new Error("Poll creation returned no ID");
      await request(`/api/polls/${created.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      setPollTitle(""); setPollQuestion(""); setPollSubject(""); setPollGrade(""); setPollChoices(["", "", "", ""]); setPollCorrect(0);
      Alert.alert("Poll published", "Your poll is now available to learners.");
      await loadSection("polls");
    } catch (e) { Alert.alert("Could not publish poll", e instanceof Error ? e.message : "Please retry."); }
    finally { setPollBusy(false); }
  };

  const markAssignment = async (sub: Row, marks: string, feedback: string) => {
    if (!isTeacher || !selected) return;
    const max = Number(selected.totalMarks || 100); const score = Number(marks);
    if (!Number.isFinite(score) || score < 0 || score > max) { Alert.alert("Invalid marks", `Enter a score from 0 to ${max}.`); return; }
    try {
      await request(`/api/assignments/submissions/${sub.id}/grade`, { method: "PUT", body: JSON.stringify({ marks: score, feedback }) });
      const fresh = await request(`/api/assignments/${selected.id}/submissions`);
      setSubmissionMap(old => ({ ...old, [selected.id]: Array.isArray(fresh) ? fresh : [] }));
      Alert.alert("Saved", "Marks saved.");
    } catch (e) { Alert.alert("Marking failed", e instanceof Error ? e.message : "Retry."); }
  };

  const loadExerciseSubmission = async (submission: Row) => {
    if (!isTeacher || !selected) return;
    setSelectedSubmission(submission); setSubmissionDetail(null); setExerciseMarks({}); setExerciseNotes({}); setOverallComment("");
    try {
      const data = await request(`/api/exercises/${selected.id}/submissions/${submission.id}`);
      setSubmissionDetail(data);
      const answerRows = Array.isArray(data?.answers) ? data.answers : [];
      setExerciseMarks(Object.fromEntries(answerRows.map((a: any) => [a.id, String(a.awardedMarks ?? 0)])));
      setExerciseNotes(Object.fromEntries(answerRows.map((a: any) => [a.id, String(a.correctionNotes ?? "")])));
      setOverallComment(String(data?.submission?.overallComment ?? ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load submission"); }
  };

  const returnExerciseMarking = async () => {
    if (!isTeacher || !selected || !selectedSubmission || !submissionDetail) return;
    const answerRows = Array.isArray(submissionDetail.answers) ? submissionDetail.answers : [];
    const marks = answerRows.map((a: any) => ({ answerId: a.id, awardedMarks: Number(exerciseMarks[a.id] ?? 0), correctionNotes: exerciseNotes[a.id] ?? "", markingData: a.markingData ?? { ticks: [] } }));
    if (marks.some((m: any) => !Number.isFinite(m.awardedMarks) || m.awardedMarks < 0)) { Alert.alert("Check marks", "Marks must be zero or greater."); return; }
    setBusy(true);
    try {
      await request(`/api/exercises/${selected.id}/submissions/${selectedSubmission.id}/mark`, { method: "POST", body: JSON.stringify({ marks, overallComment }) });
      Alert.alert("Marked", "The result and feedback were returned to the learner.");
      const fresh = await request(`/api/exercises/${selected.id}/submissions`);
      setSubmissionMap(old => ({ ...old, [selected.id]: Array.isArray(fresh) ? fresh : [] }));
      await loadExerciseSubmission(selectedSubmission);
    } catch (e) { Alert.alert("Marking failed", e instanceof Error ? e.message : "Could not save marking."); }
    finally { setBusy(false); }
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

  const openUrl = (url: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) { void Linking.openURL(url); return; }
    if (/^\/(student|teacher|admin)\//i.test(url)) {
      router.push((role === "teacher" ? "/(teacher)/more" : role === "student" ? "/(student)/more" : "/(admin)/more") as any);
      return;
    }
    const absolute = "https://dallyletter-elidems-smart-caps-lms-4.onrender.com" + (url.startsWith("/") ? "" : "/") + url;
    void Linking.openURL(absolute);
  };

  const activeNotifications = notifications || [];
  const groups = studyGroups || [];
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
          <Text style={styles.sectionTitle}>{editingAssignmentId !== null ? "Edit assignment" : "Create assignment"}</Text>
          <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="Assignment title" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={styles.input} value={newSubject} onChangeText={setNewSubject} placeholder="Subject" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={styles.input} value={newDueDate} onChangeText={setNewDueDate} placeholder="Due date (YYYY-MM-DD)" placeholderTextColor={colors.mutedForeground}/>
          <TextInput style={[styles.input, styles.textArea]} multiline value={newDescription} onChangeText={setNewDescription} placeholder="Instructions and details" placeholderTextColor={colors.mutedForeground}/>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => void uploadMedia()} disabled={uploading}><Text style={[styles.buttonText, styles.secondaryText]}>{uploading ? "Uploading…" : attachmentUrl ? "Replace attachment" : "Upload image/video attachment"}</Text></TouchableOpacity>
          {attachmentUrl ? <Text style={styles.muted}>Attachment uploaded: {attachmentUrl}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={() => void createAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Saving…" : editingAssignmentId !== null ? "Save assignment changes" : "Publish assignment"}</Text></TouchableOpacity>
          <View style={styles.separator}/>
        </>}
        {loading ? <ActivityIndicator color={colors.primary} size="large"/> : error ? <View style={styles.empty}><Text style={styles.body}>{error}</Text><TouchableOpacity style={styles.button} onPress={() => section && void loadSection(section)}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity></View> : null}
        {section === "polls" && isTeacher && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Create and publish a poll</Text><TextInput style={styles.input} value={pollTitle} onChangeText={setPollTitle} placeholder="Poll title" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={pollSubject} onChangeText={setPollSubject} placeholder="Subject (optional)" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={pollGrade} onChangeText={setPollGrade} placeholder="Grade (optional)" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={pollQuestion} onChangeText={setPollQuestion} placeholder="Question" placeholderTextColor={colors.mutedForeground}/>{pollChoices.map((choice,index)=><View key={index} style={{flexDirection:"row",alignItems:"center",gap:8}}><TouchableOpacity onPress={()=>setPollCorrect(index)} style={{padding:8}}><Feather name={pollCorrect===index?"check-circle":"circle"} size={20} color={pollCorrect===index?colors.primary:colors.mutedForeground}/></TouchableOpacity><TextInput style={[styles.input,{flex:1}]} value={choice} onChangeText={value=>setPollChoices(old=>old.map((v,i)=>i===index?value:v))} placeholder={`Answer choice ${index+1}`} placeholderTextColor={colors.mutedForeground}/></View>)}<Text style={styles.muted}>Tap the circle beside the correct answer. This creates a basic multiple-choice practice poll.</Text><TouchableOpacity style={styles.button} onPress={()=>void createAndPublishPoll()} disabled={pollBusy}><Text style={styles.buttonText}>{pollBusy?"Publishing…":"Publish poll"}</Text></TouchableOpacity></View></View>}
        {section === "notifications" && activeNotifications.map((n: any) => <TouchableOpacity key={n.id} style={styles.card} onPress={() => { if (!n.isRead) markRead.mutate({ id: n.id } as any, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }); } }); if (n.actionUrl) openUrl(n.actionUrl); }}><View style={styles.icon}><Feather name={"bell"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{n.title || n.message || "Notification"}</Text><Text style={styles.muted}>{n.body || n.description || n.createdAt || ""}</Text></View>{!n.isRead && <View style={{width:8,height:8,borderRadius:4,backgroundColor:colors.accent}}/>}</TouchableOpacity>)}
        {section === "groups" && canCreateGroups && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Create a study group</Text><TextInput style={styles.input} value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={groupSubject} onChangeText={setGroupSubject} placeholder="Subject" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={groupDescription} onChangeText={setGroupDescription} placeholder="What will your group study?" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void createStudyGroup()} disabled={groupBusy}><Text style={styles.buttonText}>{groupBusy?"Creating…":"Create group"}</Text></TouchableOpacity></View></View>}
                {section === "groups" && (Array.isArray(groups) ? groups : []).map((g: any) => <View key={g.id} style={[styles.card,{alignItems:"flex-start"}]}><View style={styles.icon}><Feather name="users" size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{g.name}</Text><Text style={styles.muted}>{g.subject || "Study group"} · {g.memberCount ?? g.members?.length ?? 0} members</Text><Text style={styles.muted}>{g.description || ""}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:8}}>{!g.isMember && isStudent && <TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={async()=>{try{await request(`/api/study-groups/${g.id}/join`,{method:"POST"});await refetchGroups();Alert.alert("Joined group",`You joined ${g.name}.`);}catch(e){Alert.alert("Could not join group",e instanceof Error?e.message:"Please retry.");}}}><Text style={styles.buttonText}>Join group</Text></TouchableOpacity>}{g.isMember && <TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={()=>void openGroupChat(g)}><Text style={styles.buttonText}>Open group chat</Text></TouchableOpacity>}{g.isMember && <TouchableOpacity style={[styles.button,styles.secondary,{marginTop:0}]} onPress={()=>leaveStudyGroup(g)}><Text style={[styles.buttonText,styles.secondaryText]}>Leave</Text></TouchableOpacity>}</View></View></View>)}
        {["assignments", "exercises", "polls"].includes(section) && rows.map(row => <View key={row.id} style={styles.card}><TouchableOpacity style={{flex:1,flexDirection:"row",alignItems:"center",gap:12}} onPress={() => void openRow(row)}><View style={styles.icon}><Feather name={section === "assignments" ? "clipboard" : section === "exercises" ? "edit-3" : "check-square"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{row.title || row.name || "Untitled"}</Text><Text style={styles.muted}>{[row.subject, row.grade, row.dueDate ? `Due ${String(row.dueDate).slice(0,10)}` : null, row.status].filter(Boolean).join(" · ")}</Text>{row.description ? <Text numberOfLines={3} style={styles.muted}>{row.description}</Text> : null}{row.attachmentUrl ? <Text style={{color:colors.primary,fontSize:12,marginTop:5}}>Attachment available</Text> : null}</View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/></TouchableOpacity>{section === "assignments" && isTeacher && <View style={{gap:10,justifyContent:"center"}}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit assignment" onPress={()=>editAssignment(row)}><Feather name="edit-2" size={18} color={colors.primary}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Toggle reference material visibility" onPress={()=>void toggleAssignmentReference(row)}><Feather name={row.referenceMaterialHidden?"eye":"eye-off"} size={18} color={colors.primary}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete assignment" onPress={()=>deleteAssignment(row)}><Feather name="trash-2" size={18} color="#dc2626"/></TouchableOpacity></View>}</View>)}
        {section === "exercises" && isTeacher && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Exercise submissions · {selected.title}</Text>{(submissionMap[selected.id] || []).map(sub => <TouchableOpacity key={sub.id} onPress={() => void loadExerciseSubmission(sub)} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{sub.studentName || sub.student?.name || `Learner #${sub.studentId ?? "?"}`}</Text><Text style={styles.muted}>{sub.status || "Submitted"} · {sub.totalScore != null ? `Score ${sub.totalScore}` : "Awaiting marking"}</Text></TouchableOpacity>)}{selectedSubmission && submissionDetail && <View style={{marginTop:14}}><Text style={styles.cardTitle}>Marking · {selectedSubmission.studentName || selectedSubmission.student?.name || "Learner"}</Text>{(submissionDetail.answers || []).map((a:any,index:number)=><View key={a.id} style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>Question {index+1}</Text><Text style={styles.body}>{a.textAnswer || a.selectedValue || (a.mediaReference ? "Learner attached media" : a.drawData ? "Learner submitted a drawing" : "No written answer")}</Text>{a.drawData ? <MobileDrawAnswer value={a.drawData} disabled onChange={() => undefined}/> : null}{a.mediaReference ? <View style={{marginTop:8}}><AuthenticatedMediaPreview url={String(a.mediaReference)} height={160} accessibilityLabel="Learner answer media"/><TouchableOpacity onPress={() => openUrl(a.mediaReference)}><Text style={{color:colors.primary,marginTop:5}}>Open answer media</Text></TouchableOpacity></View> : null}<TextInput style={styles.input} keyboardType="numeric" value={exerciseMarks[a.id] ?? "0"} onChangeText={v=>setExerciseMarks(old=>({...old,[a.id]:v}))} placeholder="Marks awarded" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={exerciseNotes[a.id] ?? ""} onChangeText={v=>setExerciseNotes(old=>({...old,[a.id]:v}))} placeholder="Correction / feedback" placeholderTextColor={colors.mutedForeground}/></View>)}<TextInput style={[styles.input,styles.textArea]} multiline value={overallComment} onChangeText={setOverallComment} placeholder="Overall feedback to learner" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={() => void returnExerciseMarking()} disabled={busy}><Text style={styles.buttonText}>{busy?"Saving marks…":"Save marks and return result"}</Text></TouchableOpacity></View>}</View></View>}
        {section === "assignments" && isStudent && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submit: {selected.title}</Text>{selected.description ? <Text style={styles.body}>{selected.description}</Text> : <Text style={styles.muted}>No additional instructions were provided.</Text>}{(submissionMap[selected.id] || []).slice(0,1).map(sub=><View key={sub.id} style={{backgroundColor:colors.background,borderRadius:10,padding:10,marginVertical:8}}><Text style={styles.cardTitle}>Previous submission: {sub.status || "Submitted"}</Text>{sub.marks != null ? <Text style={styles.muted}>Marks: {sub.marks}/{selected.totalMarks || "—"}</Text> : null}{sub.feedback ? <Text style={styles.muted}>Teacher feedback: {sub.feedback}</Text> : null}</View>)}{selected.attachmentUrl && !selected.referenceMaterialHidden ? <View style={{marginBottom:10}}><AuthenticatedMediaPreview url={String(selected.attachmentUrl)} height={180} accessibilityLabel="Assignment reference material"/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>openUrl(selected.attachmentUrl)}><Text style={[styles.buttonText,styles.secondaryText]}>Open reference material</Text></TouchableOpacity></View> : selected.referenceMaterialHidden ? <Text style={styles.muted}>Reference material is hidden by the teacher.</Text> : null}<TextInput style={[styles.input,styles.textArea]} multiline value={answerText} onChangeText={setAnswerText} placeholder="Write your answer or submission notes" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void uploadAssignmentAttachment()} disabled={uploading}><Text style={[styles.buttonText,styles.secondaryText]}>{uploading ? "Uploading…" : attachmentUrl ? "Replace attachment" : "Attach image/video"}</Text></TouchableOpacity><TouchableOpacity style={styles.button} onPress={() => void submitAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Submitting…" : "Submit assignment"}</Text></TouchableOpacity></View></View>}
        {section === "assignments" && isTeacher && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submissions · {selected.title}</Text>{(submissionMap[selected.id] || []).map(sub => <View key={sub.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{sub.studentName || sub.student?.name || `Learner #${sub.studentId ?? "?"}`}</Text><Text style={styles.muted}>{sub.content || sub.fileName || "No written response"} · {sub.status || "Submitted"}</Text>{sub.fileUrl && <TouchableOpacity onPress={() => openUrl(sub.fileUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity>}<TextInput style={styles.input} keyboardType="numeric" value={assignmentMarks[sub.id] ?? String(sub.marks ?? "")} onChangeText={v=>setAssignmentMarks(old=>({...old,[sub.id]:v}))} placeholder={`Marks / ${selected.totalMarks || 100}`} placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={assignmentFeedback[sub.id] ?? String(sub.feedback ?? "")} onChangeText={v=>setAssignmentFeedback(old=>({...old,[sub.id]:v}))} placeholder="Feedback for learner" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void markAssignment(sub,assignmentMarks[sub.id] ?? String(sub.marks ?? ""),assignmentFeedback[sub.id] ?? String(sub.feedback ?? ""))}><Text style={styles.buttonText}>Save marks and feedback</Text></TouchableOpacity></View>)}</View></View>}
        {(section === "exercises" || section === "polls") && selected && detail && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>{detail.exercise?.title || detail.poll?.title || selected.title}</Text><Text style={styles.body}>{detail.exercise?.description || detail.description || ""}</Text>{section === "exercises" && isStudent && exerciseLocked && <View style={{marginTop:12,padding:12,borderRadius:10,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={styles.cardTitle}>Previous attempt: {exerciseResult?.submission?.status || "Submitted"}</Text>{exerciseResult?.submission?.totalScore != null ? <Text style={styles.muted}>Score: {exerciseResult.submission.totalScore}/{detail.exercise?.totalMarks ?? "—"}</Text> : <Text style={styles.muted}>Your attempt is saved. Start a new attempt if retries are available.</Text>}<TouchableOpacity style={[styles.button,styles.secondary]} onPress={async()=>{if(draftKey) await AsyncStorage.removeItem(draftKey).catch(()=>undefined);setAnswers({});setNewAttempt(true);setExerciseResult(null);setDraftKey(user?.id&&detail?.exercise?.id?`dallyletter_exercise_draft_${user.id}_${detail.exercise.id}`:null);}}><Text style={[styles.buttonText,styles.secondaryText]}>Start new attempt</Text></TouchableOpacity></View>}{section === "polls" && isStudent && !pollResult && <View style={{marginTop:12,padding:12,borderRadius:10,backgroundColor:colors.background}}><Text style={styles.cardTitle}>Result privacy</Text><Text style={styles.muted}>Choose who can see your poll results.</Text><View style={{flexDirection:"row",gap:8,marginTop:8}}>{(["private","public"] as const).map(option=><TouchableOpacity key={option} onPress={()=>setPollPrivacy(option)} style={{flex:1,padding:10,borderRadius:8,borderWidth:1,borderColor:pollPrivacy===option?colors.primary:colors.border,backgroundColor:pollPrivacy===option?colors.primary+"18":colors.card}}><Text style={{color:colors.foreground,textAlign:"center",fontWeight:"600"}}>{option==="private"?"Private":"Public"}</Text></TouchableOpacity>)}</View></View>}{(detail.questions || []).map((q: any, index: number) => <View key={q.id} style={{marginTop:16,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}><Text style={styles.cardTitle}>{index+1}. {q.question || q.prompt || "Question"}</Text>{q.imageUrl && <View style={{ marginTop: 8 }}><AuthenticatedMediaPreview url={String(q.imageUrl)} height={180} accessibilityLabel={String(q.question || "Question image")} /><TouchableOpacity onPress={() => openUrl(q.imageUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open question media</Text></TouchableOpacity></View>}{q.config?.attachment?.url ? <View style={{marginTop:8,padding:10,borderRadius:10,borderWidth:1,borderColor:colors.border}}><AuthenticatedMediaPreview url={String(q.config.attachment.url)} height={160} accessibilityLabel={String(q.config.attachment.fileName || q.question || "Question attachment")}/><Text style={styles.muted}>{q.config.attachment.fileName || "Question attachment"}</Text><TouchableOpacity onPress={()=>openUrl(String(q.config.attachment.url))}><Text style={{color:colors.primary,marginTop:5}}>Open question attachment</Text></TouchableOpacity></View> : null}{section === "polls" ? (q.options || []).map((o:any) => <TouchableOpacity key={o.id} disabled={Boolean(pollResult)} style={[styles.card,{marginTop:8,borderColor:answers[String(q.id)]===o.id?colors.primary:colors.border,opacity:pollResult?0.65:1}]} onPress={() => setAnswers(a=>({...a,[String(q.id)]:o.id}))}><Feather name={answers[String(q.id)]===o.id?"check-circle":"circle"} size={18} color={colors.primary}/><Text style={[styles.body,{flex:1}]}>{o.text}</Text></TouchableOpacity>) : q.type === "poll" ? ((detail.options || []).filter((o:any)=>Number(o.questionId)===Number(q.id))).map((o:any)=><TouchableOpacity key={o.id} disabled={exerciseLocked} style={[styles.card,{marginTop:8,borderColor:answers[String(q.id)]?.selectedValue===o.value?colors.primary:colors.border,opacity:exerciseLocked?0.65:1}]} onPress={()=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],selectedValue:o.value}}))}><Feather name={answers[String(q.id)]?.selectedValue===o.value?"check-circle":"circle"} size={18} color={colors.primary}/><Text style={[styles.body,{flex:1}]}>{o.label || o.value}</Text></TouchableOpacity>) : q.type === "drawbox" ? <MobileDrawAnswer value={{...(answers[String(q.id)]?.drawData || {}), teacherDrawing: q.config?.teacherDrawing}} disabled={!isStudent || exerciseLocked} onChange={drawData=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],drawData}}))} /> : <><TextInput style={[styles.input,styles.textArea,{marginTop:8}]} multiline value={answers[String(q.id)]?.textAnswer || ""} editable={!exerciseLocked} onChangeText={v=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],textAnswer:v}}))} placeholder="Your answer" placeholderTextColor={colors.mutedForeground}/>{isStudent && <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadExerciseAnswerMedia(q.id)} disabled={exerciseLocked || uploadingAnswerId===q.id}><Text style={[styles.buttonText,styles.secondaryText]}>{uploadingAnswerId===q.id?"Uploading answer…":answers[String(q.id)]?.mediaReference?"Replace attached media":"Attach image/video answer"}</Text></TouchableOpacity>}{answers[String(q.id)]?.mediaReference ? <Text style={styles.muted}>Answer media attached.</Text> : null}</>}</View>)}{isStudent && (section === "polls" ? !pollResult : !exerciseLocked) && <TouchableOpacity style={styles.button} onPress={() => section==="polls"?void submitPoll():void submitExercise()} disabled={busy}><Text style={styles.buttonText}>{busy?"Submitting…":section==="polls"?"Submit quiz":"Submit exercise"}</Text></TouchableOpacity>}{section === "polls" && pollResult && <View style={{marginTop:16,padding:14,borderRadius:12,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={styles.sectionTitle}>Your result</Text><Text style={styles.body}>{pollResult.score != null ? `Score: ${pollResult.score}/${pollResult.totalQuestions ?? "—"}` : "Your submission was recorded."}</Text>{pollResult.percentage != null ? <Text style={styles.cardTitle}>{pollResult.percentage}%</Text> : null}</View>}{!isStudent && <Text style={styles.muted}>Preview only: staff can inspect content but cannot submit as a learner.</Text>}</View></View>}
        {section === "groups" && selectedChatGroup && <View style={[styles.card,{alignItems:"stretch",marginTop:10}]}><View style={styles.grow}><View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8}}><Text style={styles.sectionTitle}>{selectedChatGroup.name} · Chat</Text><TouchableOpacity onPress={()=>setSelectedChatGroup(null)} accessibilityRole="button" accessibilityLabel="Close group chat"><Feather name="x" size={20} color={colors.mutedForeground}/></TouchableOpacity></View><Text style={styles.muted}>Messages are visible to members of this group only.</Text>{canManageSelectedGroup && <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void loadGroupSettings()} disabled={groupSettingsBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{groupSettingsBusy?"Loading settings…":"Group settings"}</Text></TouchableOpacity>}{groupSettingsOpen && groupSettings && <View style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:10,marginTop:8}}><Text style={styles.cardTitle}>Group rules</Text><TextInput style={[styles.input,styles.textArea,{marginTop:8}]} multiline value={groupRules} onChangeText={setGroupRules} editable={!groupSettingsBusy} placeholder="Add group rules…" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void saveGroupSettings({rules:groupRules})} disabled={groupSettingsBusy}><Text style={styles.buttonText}>Save rules</Text></TouchableOpacity>{([{key:"announcementsOnly",label:"Announcements only"},{key:"allowPolls",label:"Allow polls"},{key:"allowMedia",label:"Allow image/video media"}] as const).map(setting=><TouchableOpacity key={setting.key} style={[styles.button,styles.secondary,{flexDirection:"row",justifyContent:"space-between"}]} disabled={groupSettingsBusy} onPress={()=>void saveGroupSettings({[setting.key]:!groupSettings[setting.key]})}><Text style={[styles.buttonText,styles.secondaryText]}>{setting.label}</Text><Text style={{color:groupSettings[setting.key]?"#16a34a":"#dc2626",fontWeight:"700"}}>{groupSettings[setting.key]?"ON":"OFF"}</Text></TouchableOpacity>)}</View>}<TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void refreshGroupMessages(selectedChatGroup.id)} disabled={chatLoading}><Text style={[styles.buttonText,styles.secondaryText]}>{chatLoading?"Refreshing…":"Refresh messages"}</Text></TouchableOpacity>{chatError ? <Text style={{color:"#dc2626",marginTop:8}}>{chatError}</Text> : null}{chatLoading && chatMessages.length===0 ? <ActivityIndicator color={colors.primary} style={{margin:14}}/> : chatMessages.length===0 ? <Text style={styles.muted}>No messages yet. Start the conversation.</Text> : chatMessages.map(message=><View key={message.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{message.senderName || "Group member"}</Text><Text style={styles.body}>{message.type==="media"?"Shared learning media":message.content}</Text>{message.type==="media" && message.mediaUrl ? <View style={{marginTop:8}}><AuthenticatedMediaPreview url={String(message.mediaUrl)} height={160} accessibilityLabel="Group message media"/><TouchableOpacity onPress={()=>openUrl(String(message.mediaUrl))}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity></View>:null}<Text style={styles.muted}>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</Text></View>)}<TextInput style={[styles.input,styles.textArea,{marginTop:12}]} multiline value={chatDraft} onChangeText={setChatDraft} placeholder="Write a group message…" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadGroupMessageMedia()} disabled={chatMediaBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{chatMediaBusy?"Uploading media…":"Attach image/video"}</Text></TouchableOpacity><TouchableOpacity style={styles.button} onPress={()=>void sendGroupMessage()} disabled={chatSending||!chatDraft.trim()}><Text style={styles.buttonText}>{chatSending?"Sending…":"Send message"}</Text></TouchableOpacity></View></View>}
        {!loading && !error && section === "assignments" && rows.length === 0 && <Text style={styles.muted}>No assignments are available yet.</Text>}
        {!loading && !error && section === "exercises" && rows.length === 0 && <Text style={styles.muted}>No exercises are available yet.</Text>}
        {!loading && !error && section === "polls" && rows.length === 0 && <Text style={styles.muted}>No polls are available yet.</Text>}
        {section === "groups" && Array.isArray(groups) && groups.length === 0 && <Text style={styles.muted}>No study groups are available yet.</Text>}
      </ScrollView>}
    </View>
  );
}
