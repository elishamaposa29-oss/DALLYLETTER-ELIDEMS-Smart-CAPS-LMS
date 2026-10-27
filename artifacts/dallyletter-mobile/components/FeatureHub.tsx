import { UserProfileLink } from "@/components/UserProfileLink";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@workspace/api-client-react";
import { getListNotificationsQueryKey, useListNotifications, useMarkNotificationRead, useListStudyGroups } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { enqueueSubmission, listQueuedSubmissions, removeQueuedSubmission, updateQueuedSubmission, type QueuedSubmission } from "@/components/QueuedSubmissionStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";
import MobileDrawAnswer from "@/components/MobileDrawAnswer";
import VoiceMessageComposer, { type VoiceRecordingFile } from "@/components/VoiceMessageComposer";
import AuthenticatedAudioMessage from "@/components/AuthenticatedAudioMessage";
import NativePushControls from "@/components/NativePushControls";
import BreakElidemsShortcut from "@/components/BreakElidemsShortcut";

type Section = "assignments" | "exercises" | "polls" | "notifications" | "groups" | "messages" | "payments" | "achievements" | "prefect" | "reports" | "audit";
type Row = Record<string, any> & { id: number; title?: string; name?: string };

function stableValue(value: any): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "[" + value.map(stableValue).join(",") + "]";
  if (typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableValue(value[key])).join(",") + "}";
  return String(JSON.stringify(value));
}
function queuedExerciseAlreadyAccepted(current: any, item: QueuedSubmission): boolean {
  const status=String(current?.submission?.status||"");
  if (!["submitted","ai_partial","ai_marked_pending_return"].includes(status)) return false;
  let body:any;
  try { body=JSON.parse(item.body); } catch { return false; }
  if (!body?.newAttempt) return true;
  const queued=Array.isArray(body.answers)?body.answers:[];
  const stored=Array.isArray(current?.answers)?current.answers:[];
  if (queued.length===0 || stored.length!==queued.length) return false;
  return queued.every((answer:any)=>{
    const saved=stored.find((row:any)=>Number(row.questionId)===Number(answer.questionId));
    if (!saved) return false;
    for (const key of ["textAnswer","selectedValue","mediaReference"]) {
      if (String(saved[key]??"")!==String(answer[key]??"")) return false;
    }
    if ((answer.drawData || saved.drawData) && stableValue(saved.drawData??null)!==stableValue(answer.drawData??null)) return false;
    return true;
  });
}

const sections: { id: Section; title: string; subtitle: string; icon: string }[] = [
  { id: "assignments", title: "Assignments", subtitle: "Due dates, submissions and feedback", icon: "clipboard" },
  { id: "exercises", title: "Exercises", subtitle: "Practice, submit answers and review results", icon: "edit-3" },
  { id: "polls", title: "Polls & quizzes", subtitle: "Timed quizzes, attempts and results", icon: "check-square" },
  { id: "notifications", title: "Notifications", subtitle: "Updates and unread alerts", icon: "bell" },
  { id: "groups", title: "Study groups", subtitle: "Groups, membership and learning communities", icon: "users" },
  { id: "messages", title: "Private messages", subtitle: "Direct conversations and media attachments", icon: "message-circle" },
  { id: "payments", title: "School fees", subtitle: "Payment history and available payment methods", icon: "credit-card" },
  { id: "achievements", title: "Achievements", subtitle: "Earned badges, points and learner leaderboard", icon: "award" },
  { id: "prefect", title: "Prefect dashboard", subtitle: "Request lessons and follow teachers or prefects", icon: "star" },
  { id: "reports", title: "Safety reports", subtitle: "Confidentially report a concern to the owner", icon: "shield" },
  { id: "audit", title: "Activity audit", subtitle: "Role-scoped academic activity and owner audit history", icon: "activity" },
];

export default function FeatureHub() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const routeParams = useLocalSearchParams<{ section?: string; itemId?: string }>();
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
  const [exerciseLessons, setExerciseLessons] = useState<Row[]>([]);
  const [exerciseBuilderOpen, setExerciseBuilderOpen] = useState(false);
  const [exerciseLessonId, setExerciseLessonId] = useState("");
  const [exerciseTitle, setExerciseTitle] = useState("");
  const [exerciseInstructions, setExerciseInstructions] = useState("");
  const [exerciseDraftQuestions, setExerciseDraftQuestions] = useState<Array<{prompt:string;type:"input"|"poll"|"drawbox";marks:string;options:string[];correct:number;drawData?:Record<string,any>}>>([{prompt:"",type:"input",marks:"1",options:["Option A","Option B"],correct:0,drawData:{}}]);
  const [exerciseBuilderBusy, setExerciseBuilderBusy] = useState(false);
  const [exerciseDraftId, setExerciseDraftId] = useState<number | null>(null);
  const [exerciseQuestionsSaved, setExerciseQuestionsSaved] = useState(0);
  const [overallComment, setOverallComment] = useState("");
  const [pollTitle, setPollTitle] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollSubject, setPollSubject] = useState("");
  const [pollGrade, setPollGrade] = useState("");
  const [pollChoices, setPollChoices] = useState(["", "", "", ""]);
  const [pollCorrect, setPollCorrect] = useState(0);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollResult, setPollResult] = useState<any>(null);
  const [pollDraftReady, setPollDraftReady] = useState(false);
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
  const [messageContacts, setMessageContacts] = useState<Row[]>([]);
  const [privateRecipient, setPrivateRecipient] = useState<Row | null>(null);
  const [privateMessages, setPrivateMessages] = useState<Row[]>([]);
  const [privateDraft, setPrivateDraft] = useState("");
  const [privateBusy, setPrivateBusy] = useState(false);
  const [privateMediaBusy, setPrivateMediaBusy] = useState(false);
  const [groupSettings, setGroupSettings] = useState<any>(null);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);
  const [groupRules, setGroupRules] = useState("");
  const [paymentSettings, setPaymentSettings] = useState<any>({});
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentReported, setPaymentReported] = useState(false);
  const [prefectTeachers, setPrefectTeachers] = useState<Row[]>([]);
  const [prefectLeaderboard, setPrefectLeaderboard] = useState<Row[]>([]);
  const [prefectFollows, setPrefectFollows] = useState<Row[]>([]);
  const [prefectTeacherId, setPrefectTeacherId] = useState("");
  const [prefectTopic, setPrefectTopic] = useState("");
  const [prefectDate, setPrefectDate] = useState("");
  const [prefectNotes, setPrefectNotes] = useState("");
  const [prefectBusy, setPrefectBusy] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportSeverity, setReportSeverity] = useState("medium");
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [myBadges, setMyBadges] = useState<Row[]>([]);
  const [achievementLeaderboard, setAchievementLeaderboard] = useState<Row[]>([]);
  const [allAchievements, setAllAchievements] = useState<Row[]>([]);
  const [achievementTab, setAchievementTab] = useState<"badges" | "leaderboard" | "all">("badges");
  const [queuedSubmissions, setQueuedSubmissions] = useState<QueuedSubmission[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const queryClient = useQueryClient();
  const { data: notifications, refetch: refetchNotifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: section === "notifications" ? 30000 : false, refetchOnWindowFocus: true } });
  const markRead = useMarkNotificationRead();
  const { data: studyGroups, refetch: refetchGroups } = useListStudyGroups();


  const role = String(user?.role ?? "guest").toLowerCase().replace(/[ -]+/g, "_");
  const isStudent = role === "student" || role === "prefect";
  const managerRole = ["manager", "senior_manager"].includes(role) || Boolean((user as any)?.isManager);
  const visibleSections = sections.filter(item => (item.id !== "achievements" || isStudent) && (item.id !== "prefect" || Boolean((user as any)?.isPrefect)) && (item.id !== "reports" || isStudent) && (item.id !== "audit" || ["owner","admin","platform_owner"].includes(role) || managerRole));
  const isTeacher = role === "teacher";
  const canManageExercises = isTeacher || ["owner","admin","platform_owner"].includes(role) || Boolean((user as any)?.isManager);
  const canCreateGroups = isTeacher || Boolean((user as any)?.isPrefect || (user as any)?.isManager) || ["owner", "admin", "platform_owner"].includes(role);
  const exerciseLocked = Boolean(exerciseResult?.submission?.status) && !newAttempt;

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) + 12, paddingHorizontal: 20, paddingBottom: 18 },
    heading: { color: "#fff", fontSize: 23, fontFamily: "Inter_700Bold" },
    subheading: { color: "rgba(255,255,255,.78)", fontSize: 13, marginTop: 5, fontFamily: "Inter_400Regular" },
    content: { padding: 16, paddingBottom: 120, gap: 10, width: "100%", maxWidth: 1180, alignSelf: "center" },
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

  const saveLearningItemOffline = useCallback(async () => {
    if (!user?.id || !section || !selected || !["assignments", "exercises", "polls"].includes(section)) return;
    const key = "dallyletter_saved_learning_items_v1_" + user.id + "_" + role;
    try {
      const raw = await AsyncStorage.getItem(key);
      let saved: Record<string, any> = {};
      try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
      const itemKey = section + ":" + String(selected.id);
      saved[itemKey] = { section, item: { ...selected }, detail: detail ? { ...detail } : null, savedAt: Date.now(), accountId: user.id, role };
      await AsyncStorage.setItem(key, JSON.stringify(saved));
      Alert.alert("Saved for offline access", "This learning item and the details currently available are saved on this device. Submissions stay drafts until the server confirms them.");
    } catch {
      Alert.alert("Could not save", "Check available device storage and try again.");
    }
  }, [user?.id, role, section, selected, detail]);

  useEffect(() => {
    if (!user?.id || !isStudent) return;
    const markedExercise = section === "exercises" && selected && exerciseResult?.submission?.status === "marked";
    const markedAssignment = section === "assignments" && selected && (submissionMap[selected.id] || []).some((item: any) => item.status === "marked" || item.marks != null || Boolean(item.feedback));
    if (!markedExercise && !markedAssignment) return;
    let active = true;
    const persist = async () => {
      const key = "dallyletter_teacher_marked_activity_v1_" + user.id + "_" + role;
      const raw = await AsyncStorage.getItem(key).catch(() => null);
      let saved: Record<string, any> = {};
      try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
      if (!active) return;
      if (markedExercise) saved["exercise:" + String(selected.id)] = { item: selected, detail, result: exerciseResult, savedAt: Date.now() };
      if (markedAssignment) saved["assignment:" + String(selected.id)] = { item: selected, submissions: submissionMap[selected.id], savedAt: Date.now() };
      await AsyncStorage.setItem(key, JSON.stringify(saved)).catch(() => undefined);
    };
    void persist();
    return () => { active = false; };
  }, [user?.id, isStudent, role, section, selected?.id, detail, exerciseResult, submissionMap]);

  const refreshQueuedSubmissions = useCallback(async () => {
    if (!user?.id) { setQueuedSubmissions([]); return []; }
    const items = await listQueuedSubmissions(user.id);
    setQueuedSubmissions(items);
    return items;
  }, [user?.id]);

  const retryQueuedSubmissions = useCallback(async () => {
    if (!user?.id || queueBusy) return;
    setQueueBusy(true);
    const clearDraft = async (item:QueuedSubmission) => {
      const key = item.kind === "assignment"
        ? `dallyletter_assignment_draft_${user.id}_${item.targetId}`
        : item.kind === "poll"
          ? `dallyletter_poll_draft_${user.id}_${item.targetId}`
          : `dallyletter_exercise_draft_${user.id}_${item.targetId}`;
      await AsyncStorage.removeItem(key).catch(() => undefined);
    };
    try {
      const pending = await listQueuedSubmissions(user.id);
      for (const item of pending) {
        try {
          if (item.kind === "exercise") {
            const current = await request(`/api/exercises/${item.targetId}/result`).catch(() => null);
            if (queuedExerciseAlreadyAccepted(current,item)) {
              await clearDraft(item);
              await removeQueuedSubmission(user.id,item.id);
              continue;
            }
          }
          await request(item.path,{method:"POST",body:item.body});
          await clearDraft(item);
          await removeQueuedSubmission(user.id,item.id);
        } catch (e) {
          const message=e instanceof Error?e.message:"Retry failed";
          if (item.kind==="exercise" && /already submitted|awaiting marking|previous attempt/i.test(message)) {
            const current=await request(`/api/exercises/${item.targetId}/result`).catch(()=>null);
            if (queuedExerciseAlreadyAccepted(current,item)) {
              await clearDraft(item);
              await removeQueuedSubmission(user.id,item.id);
              continue;
            }
          }
          await updateQueuedSubmission(user.id,item.id,message);
        }
      }
    } finally {
      await refreshQueuedSubmissions();
      setQueueBusy(false);
    }
  }, [user?.id, queueBusy, request, refreshQueuedSubmissions]);

  useEffect(() => {
    void refreshQueuedSubmissions();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active" && user?.id) void retryQueuedSubmissions();
    });
    return () => subscription.remove();
  }, [refreshQueuedSubmissions, retryQueuedSubmissions, user?.id]);

  useEffect(() => {
    if (!user?.id || queuedSubmissions.length === 0 || queueBusy) return;
    const interval = setInterval(() => {
      void request("/api/healthz").then(() => retryQueuedSubmissions()).catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
  }, [user?.id, queuedSubmissions.length, queueBusy, request, retryQueuedSubmissions]);

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

  useEffect(() => {
    if (section !== "polls" || !isStudent || !selected || !detail || !user?.id) return;
    let active = true;
    setPollDraftReady(false);
    const key = `dallyletter_poll_draft_${user.id}_${selected.id}`;
    void AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          const savedAnswers = Array.isArray(saved.answers) ? Object.fromEntries(saved.answers.map((answer: any) => [String(answer.questionId), answer.selectedOptionId])) : null;
          if (savedAnswers) setAnswers(current => Object.keys(current).length ? current : savedAnswers);
          if (saved.resultPrivacy === "private" || saved.resultPrivacy === "public") setPollPrivacy(saved.resultPrivacy);
        } catch { /* Ignore an invalid poll draft and keep the live poll usable. */ }
      }
      setPollDraftReady(true);
    }).catch(() => { if (active) setPollDraftReady(true); });
    return () => { active = false; };
  }, [section, isStudent, selected?.id, detail?.poll?.id, user?.id]);

  useEffect(() => {
    if (section !== "polls" || !isStudent || !selected || !detail || !user?.id || !pollDraftReady) return;
    const packedAnswers = (detail.questions || []).map((q: any) => ({ questionId: q.id, selectedOptionId: answers[String(q.id)] })).filter((answer: any) => answer.selectedOptionId);
    const key = `dallyletter_poll_draft_${user.id}_${selected.id}`;
    void AsyncStorage.setItem(key, JSON.stringify({ item: selected, detail, answers: packedAnswers, resultPrivacy: pollPrivacy, savedAt: Date.now() })).catch(() => undefined);
  }, [section, isStudent, selected?.id, detail?.poll?.id, answers, pollPrivacy, user?.id, pollDraftReady]);

  useEffect(() => {
    if (section !== "messages" || !privateRecipient?.id) return;
    let active = true;
    const refreshConversation = async () => {
      try {
        const messages = await request("/api/messages?recipientId=" + encodeURIComponent(String(privateRecipient.id)));
        if (active) setPrivateMessages(Array.isArray(messages) ? messages : []);
      } catch {
        // Keep the last visible messages when the connection is temporarily unavailable.
      }
    };
    const interval = setInterval(() => { void refreshConversation(); }, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [section, privateRecipient?.id, request]);

  const loadSection = useCallback(async (target: Section) => {
    setSection(target); setSelected(null); setDetail(null); setSelectedSubmission(null); setSubmissionDetail(null); setError(""); setLoading(true); setRows([]);
    const cacheKey = user?.id && ["assignments", "exercises", "polls"].includes(target)
      ? `dallyletter_mobile_list_${user.id}_${role}_${target}_v1`
      : null;
    try {
      if (target === "notifications") { await refetchNotifications(); setRows([]); }
      else if (target === "groups") { await refetchGroups(); setRows([]); }
      else if (target === "messages") {
        const contacts = await request("/api/users");
        const all = Array.isArray(contacts) ? contacts : [];
        const allowed = all.filter((person:any) => Number(person.id)!==Number(user?.id) && !person.isBlocked && !person.isSuspended && (!isStudent || ["teacher","owner","admin","platform_owner"].includes(String(person.role).toLowerCase()) || Boolean(person.isPrefect)));
        setMessageContacts(allowed);
        setPrivateRecipient(null); setPrivateMessages([]); setRows(allowed);
      }
      else if (target === "audit") {
        if (!(["owner","platform_owner"].includes(role) || managerRole)) throw new Error("Only the owner or authorized managers can view activity audit records.");
        const logs = await request("/api/audit-logs?limit=200");
        setRows(Array.isArray(logs) ? logs : []);
      }
      else if (target === "reports") {
        if (!isStudent) throw new Error("Learner access is required to submit safety reports.");
        const reports = await request("/api/owner-alerts");
        setRows(Array.isArray(reports) ? reports : []);
      }
      else if (target === "prefect") {
        if (!(user as any)?.isPrefect) throw new Error("Prefect access is required.");
        const [teachers, leaderboard, requests, follows] = await Promise.all([request("/api/achievements/prefect-teachers"), request("/api/achievements/prefect-leaderboard"), request("/api/achievements/lesson-requests"), request("/api/follows")]);
        setPrefectTeachers(Array.isArray(teachers) ? teachers : []);
        setPrefectLeaderboard(Array.isArray(leaderboard) ? leaderboard : []);
        setRows(Array.isArray(requests) ? requests : []);
        setPrefectFollows(Array.isArray(follows) ? follows : []);
      }
      else if (target === "achievements") {
        if (!isStudent) throw new Error("Learner access is required to view achievements.");
        const [mine, leaderboard, all] = await Promise.all([request("/api/achievements/my"), request("/api/achievements/leaderboard"), request("/api/achievements")]);
        setMyBadges(Array.isArray(mine) ? mine : []);
        setAchievementLeaderboard(Array.isArray(leaderboard) ? leaderboard : []);
        setAllAchievements(Array.isArray(all) ? all : []);
      }
      else if (target === "payments") {
        setPaymentReported(false);
        const [paymentRows, settings] = await Promise.all([request("/api/payments"), request("/api/settings")]);
        setRows(Array.isArray(paymentRows) ? paymentRows : []);
        setPaymentSettings(settings && typeof settings === "object" ? settings : {});
      }
      else {
        let loadedRows: Row[] = [];
        if (target === "exercises") {
          const lessons = await request("/api/lessons");
          const lessonRows = Array.isArray(lessons) ? lessons : [];
          if (isTeacher || ["owner","admin","platform_owner"].includes(role) || Boolean((user as any)?.isManager)) setExerciseLessons(lessonRows);
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
        if (cacheKey && user?.id) {
          const bundleKey = "dallyletter_saved_learning_bundle_v1_" + user.id + "_" + role;
          const bundleRaw = await AsyncStorage.getItem(bundleKey).catch(() => null);
          try {
            const bundles = bundleRaw ? JSON.parse(bundleRaw) : {};
            const savedRows = Object.values(bundles).flatMap((bundle: any) => Array.isArray(bundle?.[target]) ? bundle[target] : []);
            const merged = new Map<string, any>();
            [...savedRows, ...loadedRows].forEach(item => { if (item?.id != null) merged.set(String(item.id), item); });
            loadedRows = [...merged.values()];
          } catch { /* Ignore a damaged bundle and keep server results. */ }
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
  }, [request, refetchNotifications, refetchGroups, user?.id, role, isStudent]);

  useEffect(() => {
    if ((routeParams.section === "notifications" || routeParams.section === "payments" || routeParams.section === "achievements" || routeParams.section === "prefect" || routeParams.section === "reports" || routeParams.section === "messages" || routeParams.section === "audit" || routeParams.section === "assignments" || routeParams.section === "exercises" || routeParams.section === "polls") && section !== routeParams.section) void loadSection(routeParams.section as Section);
  }, [routeParams.section, section, loadSection]);

  const openRow = async (row: Row) => {
    setSelected(row); setDetail(null); setSelectedSubmission(null); setSubmissionDetail(null); setAnswers({}); setAnswerText(""); setPollResult(null); setExerciseResult(null); setNewAttempt(false); setError("");
    // Restore saved assignment drafts before network requests so offline work survives navigation.
    if (section === "assignments" && isStudent && user?.id) {
      const draftKey = "dallyletter_assignment_draft_" + user.id + "_" + row.id;
      const savedDraft = await AsyncStorage.getItem(draftKey).catch(() => null);
      if (savedDraft !== null) setAnswerText(savedDraft);
    }
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
        if (section === "exercises" && canManageExercises) {
          const submissions = await request(`/api/exercises/${row.id}/submissions`);
          setSubmissionMap(old => ({ ...old, [row.id]: Array.isArray(submissions) ? submissions : [] }));
        }
      } catch (e) {
        const savedKey = user?.id ? "dallyletter_saved_learning_items_v1_" + user.id + "_" + role : null;
        const markedKey = user?.id ? "dallyletter_teacher_marked_activity_v1_" + user.id + "_" + role : null;
        let restored = false;
        if (savedKey) {
          const raw = await AsyncStorage.getItem(savedKey).catch(() => null);
          try {
            const registry = raw ? JSON.parse(raw) : {};
            const entry = registry[section + ":" + String(row.id)];
            if (entry?.detail) { setDetail(entry.detail); restored = true; }
          } catch { /* Ignore corrupt offline item snapshots. */ }
        }
        if (section === "exercises" && markedKey && isStudent) {
          const raw = await AsyncStorage.getItem(markedKey).catch(() => null);
          try {
            const registry = raw ? JSON.parse(raw) : {};
            const marked = registry["exercise:" + String(row.id)];
            if (marked?.result) setExerciseResult(marked.result);
          } catch { /* Ignore corrupt marked-result snapshots. */ }
        }
        if (!restored) setError(e instanceof Error ? e.message : "Could not open this item online or from its saved offline copy.");
      }
    }
  };

  useEffect(() => {
    const itemId = routeParams.itemId;
    if (!itemId || !routeParams.section || section !== routeParams.section || loading || selected?.id != null) return;
    const match = rows.find(row => String(row.id) === String(itemId));
    if (match) void openRow(match);
  }, [routeParams.itemId, routeParams.section, section, rows, loading, selected?.id]);

  const uploadMedia = async (documentOnly = false) => {
    if (!isTeacher) return;
    let asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null };
    if (documentOnly) {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      asset = { uri: picked.assets[0].uri, fileName: picked.assets[0].name, mimeType: picked.assets[0].mimeType, type: "document" };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a file."); return; }
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
      if (pick.canceled || !pick.assets[0]) return;
      asset = pick.assets[0];
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "lesson-media", type: asset.mimeType || (asset.type === "document" ? (asset.fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : asset.fileName?.toLowerCase().endsWith(".doc") ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") : asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
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
    if (!isStudent || !selected) return;
    if (!answerText.trim() && !attachmentUrl.trim()) {
      Alert.alert("Add your work", "Enter an answer or attach a file before submitting.");
      return;
    }
    setBusy(true);
    try {
      await request(`/api/assignments/${selected.id}/submit`, { method: "POST", body: JSON.stringify({ content: answerText.trim() || (attachmentUrl ? "See attached submission file." : ""), fileUrl: attachmentUrl || null, fileName: attachmentUrl ? attachmentUrl.split("/").pop() : null }) });
      setAnswerText(""); setAttachmentUrl("");
      if (user?.id) await AsyncStorage.removeItem("dallyletter_assignment_draft_" + user.id + "_" + selected.id).catch(() => undefined);
      Alert.alert("Submitted", "Your work was submitted successfully.");
      await loadSection("assignments");
    } catch (e) {
      const message=e instanceof Error?e.message:"Please retry.";
      if (/network request failed|failed to fetch|network error|offline|timed? ?out|connection lost/i.test(message)) {
        try {
          await enqueueSubmission({userId:Number(user?.id),kind:"assignment",targetId:Number(selected.id),path:`/api/assignments/${selected.id}/submit`,body:JSON.stringify({content:answerText.trim()||(attachmentUrl?"See attached submission file.":""),fileUrl:attachmentUrl||null,fileName:attachmentUrl?attachmentUrl.split("/").pop():null})});
          await refreshQueuedSubmissions();
          Alert.alert("Saved for retry","You appear to be offline. Your assignment is stored on this device and will retry when the app becomes active again.");
        } catch { Alert.alert("Submission failed",message); }
      } else Alert.alert("Submission failed",message);
    }
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

  const addExerciseQuestion = () => setExerciseDraftQuestions(old => [...old, { prompt:"", type:"input", marks:"1", options:["Option A","Option B"], correct:0, drawData:{} }]);
  const updateExerciseQuestion = (index:number, patch:Partial<{prompt:string;type:"input"|"poll"|"drawbox";marks:string;options:string[];correct:number;drawData?:Record<string,any>}>) => setExerciseDraftQuestions(old => old.map((q,i)=>i===index?{...q,...patch}:q));
  const createMobileExercise = async () => {
    if (!(isTeacher || ["owner","admin","platform_owner"].includes(role) || Boolean((user as any)?.isManager))) { Alert.alert("Preview only","Your role cannot create exercises."); return; }
    if (!exerciseLessonId || !exerciseTitle.trim() || !exerciseDraftQuestions.length || exerciseDraftQuestions.some(q=>!q.prompt.trim() || !Number.isFinite(Number(q.marks)) || Number(q.marks)<0 || Math.round(Number(q.marks)*2)!==Number(q.marks)*2)) { Alert.alert("Complete exercise","Choose a lesson, enter a title, and give every question a prompt and marks in 0.5 increments."); return; }
    if (exerciseDraftQuestions.some(q=>q.type==="poll" && (q.options.filter(o=>o.trim()).length<2 || !q.options[q.correct]?.trim()))) { Alert.alert("Complete poll options","Each choice question needs at least two options and a correct option."); return; }
    setExerciseBuilderBusy(true);
    let exerciseId:number|undefined = exerciseDraftId ?? undefined;
    try {
      if (!exerciseId) {
        const created = await request(`/api/exercises/lessons/${exerciseLessonId}/exercises`, { method:"POST", body:JSON.stringify({title:exerciseTitle.trim(),instructions:exerciseInstructions.trim()||null,layout:{version:1,page:"book"}}) });
        exerciseId = Number(created?.id);
        if (!Number.isInteger(exerciseId) || exerciseId<=0) throw new Error("The server did not return the created exercise ID.");
        setExerciseDraftId(exerciseId); setExerciseQuestionsSaved(0);
      }
      for (let index=exerciseQuestionsSaved; index<exerciseDraftQuestions.length; index++) {
        const q=exerciseDraftQuestions[index];
        const payload:any={prompt:q.prompt.trim(),type:q.type,marksAllocated:Number(q.marks),position:index,config:q.type==="drawbox"?{teacherDrawing:q.drawData||{}}:{}};
        if(q.type==="poll") payload.options=q.options.map((label,i)=>({label:label.trim(),value:label.trim(),isCorrect:i===q.correct})).filter(option=>option.label);
        await request(`/api/exercises/${exerciseId}/questions`,{method:"POST",body:JSON.stringify(payload)});
        setExerciseQuestionsSaved(index+1);
      }
      await request(`/api/exercises/${exerciseId}/publish`,{method:"POST",body:JSON.stringify({})});
      setExerciseBuilderOpen(false); setExerciseTitle(""); setExerciseInstructions(""); setExerciseLessonId(""); setExerciseDraftId(null); setExerciseQuestionsSaved(0); setExerciseDraftQuestions([{prompt:"",type:"input",marks:"1",options:["Option A","Option B"],correct:0,drawData:{}}]);
      await loadSection("exercises");
      Alert.alert("Exercise published","Your exercise and questions are published for eligible learners.");
    } catch(e) { Alert.alert(exerciseId?`Draft #${exerciseId} preserved`:"Exercise not created",e instanceof Error?e.message:"Reconnect and retry. Saved questions are tracked so retrying this builder does not intentionally recreate them."); }
    finally { setExerciseBuilderBusy(false); }
  };

  const submitExercise = async () => {
    if (!isStudent || !selected || !detail?.exercise || busy) return;
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
    } catch (e) {
      const message=e instanceof Error?e.message:"Please retry.";
      if (/network request failed|failed to fetch|network error|offline|timed? ?out|connection lost/i.test(message)) {
        try {
          const packedAnswers = (detail.questions || []).map((q:any) => { const answer=answers[String(q.id)]||{}; return {questionId:q.id,...answer,...(answer.textAnswer?{}:{textAnswer:""}),...(answer.drawData?{drawData:{...(answer.drawData as any),teacherDrawing:q.config?.teacherDrawing??null,learnerDrawing:answer.drawData}}:{})}; });
          await enqueueSubmission({userId:Number(user?.id),kind:"exercise",targetId:Number(detail.exercise.id),path:`/api/exercises/${detail.exercise.id}/submit`,body:JSON.stringify({newAttempt,answers:packedAnswers})});
          await refreshQueuedSubmissions();
          Alert.alert("Saved for retry","You appear to be offline. Your exercise attempt is stored on this device and will retry when the app becomes active again. Your draft remains available.");
        } catch { Alert.alert("Submission failed",message); }
      } else Alert.alert("Submission failed",message);
    }
    finally { setBusy(false); }
  };

  const submitPoll = async () => {
    if (!isStudent || !selected || !detail || busy) return;
    setBusy(true);
    const pollQuestions = detail.questions || [];
    const packed = pollQuestions.map((q: any) => ({ questionId: q.id, selectedOptionId: answers[String(q.id)] }));
    try {
      if (packed.some((a: any) => !a.selectedOptionId)) throw new Error("Answer every question before submitting.");
      const body = { answers: packed, resultPrivacy: pollPrivacy, selectedFriendIds: [] };
      await request(`/api/polls/${selected.id}/submit`, { method: "POST", body: JSON.stringify(body) });
      if (user?.id) await AsyncStorage.removeItem(`dallyletter_poll_draft_${user.id}_${selected.id}`).catch(() => undefined);
      const result = await request(`/api/polls/${selected.id}/my-results`);
      setPollResult(result);
      Alert.alert("Submitted", "Your poll answers were submitted successfully.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please retry.";
      if (/network request failed|failed to fetch|network error|offline|timed? ?out|connection lost/i.test(message) && user?.id) {
        try {
          const body = { answers: packed, resultPrivacy: pollPrivacy, selectedFriendIds: [] };
          await AsyncStorage.setItem(`dallyletter_poll_draft_${user.id}_${selected.id}`, JSON.stringify({ item: selected, detail, answers: packed, resultPrivacy: pollPrivacy, savedAt: Date.now() }));
          await enqueueSubmission({ userId: Number(user.id), kind: "poll", targetId: Number(selected.id), path: `/api/polls/${selected.id}/submit`, body: JSON.stringify(body) });
          await refreshQueuedSubmissions();
          Alert.alert("Saved as draft", "Your poll answers are saved on this device and will be submitted when the app reconnects. They are not published yet.");
        } catch {
          Alert.alert("Draft not saved", "Could not store this poll submission. Check device storage and try again.");
        }
      } else {
        Alert.alert("Submission failed", message);
      }
    } finally { setBusy(false); }
  };

  const openPrivateConversation = async (person:Row) => {
    if (!person?.id || Number(person.id)===Number(user?.id)) return;
    setPrivateRecipient(person); setPrivateMessages([]); setPrivateDraft(""); setPrivateBusy(true); setError("");
    try { const messages = await request("/api/messages?recipientId="+encodeURIComponent(String(person.id))); setPrivateMessages(Array.isArray(messages)?messages:[]); }
    catch(e) { setError(e instanceof Error?e.message:"Could not load private conversation."); }
    finally { setPrivateBusy(false); }
  };
  const sendPrivateMessage = async () => {
    if (!privateRecipient || !privateDraft.trim() || privateBusy) return;
    setPrivateBusy(true);
    try { await request("/api/messages",{method:"POST",body:JSON.stringify({recipientId:Number(privateRecipient.id),content:privateDraft.trim(),type:"text"})}); setPrivateDraft(""); const messages=await request("/api/messages?recipientId="+encodeURIComponent(String(privateRecipient.id))); setPrivateMessages(Array.isArray(messages)?messages:[]); }
    catch(e) { Alert.alert("Message not sent",e instanceof Error?e.message:"Reconnect and retry."); }
    finally { setPrivateBusy(false); }
  };
  const uploadPrivateMedia = async (documentOnly = false) => {
    if (!privateRecipient || privateMediaBusy) return;
    let asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null };
    if (documentOnly) {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      asset = { uri: picked.assets[0].uri, fileName: picked.assets[0].name, mimeType: picked.assets[0].mimeType, type: "document" };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", "Allow photo/video access to attach learning media."); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.82 });
      if (picked.canceled || !picked.assets[0]) return;
      asset = picked.assets[0];
    }
    setPrivateMediaBusy(true);
    try { const form=new FormData(); form.append("recipientId",String(privateRecipient.id)); form.append("file",{uri:asset.uri,name:asset.fileName||"private-learning-media",type:asset.mimeType||(asset.type==="video"?"video/mp4":"image/jpeg")} as any); const uploaded=await request("/api/messages/media",{method:"POST",body:form}); if(!uploaded.mediaUrl)throw new Error("Upload did not return a media URL."); await request("/api/messages",{method:"POST",body:JSON.stringify({recipientId:Number(privateRecipient.id),content:asset.fileName||"Shared learning media",type:"media",mediaUrl:uploaded.mediaUrl})}); const messages=await request("/api/messages?recipientId="+encodeURIComponent(String(privateRecipient.id))); setPrivateMessages(Array.isArray(messages)?messages:[]); }
    catch(e){Alert.alert("Media not sent",e instanceof Error?e.message:"Reconnect and retry.");}
    finally{setPrivateMediaBusy(false);}
  };

  const sendPrivateVoiceMessage = async (file: VoiceRecordingFile) => {
    if (!privateRecipient || privateMediaBusy) throw new Error("Choose a conversation before recording a voice message.");
    setPrivateMediaBusy(true);
    try {
      const form = new FormData();
      form.append("recipientId", String(privateRecipient.id));
      form.append("file", { uri: file.uri, name: file.fileName, type: file.mimeType } as any);
      const uploaded = await request("/api/messages/media", { method: "POST", body: form });
      if (!uploaded.mediaUrl) throw new Error("Voice upload did not return a media URL.");
      await request("/api/messages", { method: "POST", body: JSON.stringify({ recipientId: Number(privateRecipient.id), content: "Voice message", type: "voice", mediaUrl: uploaded.mediaUrl }) });
      const messages = await request("/api/messages?recipientId=" + encodeURIComponent(String(privateRecipient.id)));
      setPrivateMessages(Array.isArray(messages) ? messages : []);
    } finally { setPrivateMediaBusy(false); }
  };

  const submitSafetyReport = async () => {
    if (!isStudent || reportBusy || !reportCategory || !reportTitle.trim() || !reportDescription.trim()) { Alert.alert("Complete your report", "Choose a category and enter a title and description."); return; }
    setReportBusy(true);
    try {
      await request("/api/owner-alerts", { method: "POST", body: JSON.stringify({ category: reportCategory, severity: reportSeverity, title: reportTitle.trim(), description: reportDescription.trim() }) });
      setReportTitle(""); setReportDescription(""); setReportCategory(""); setReportSeverity("medium");
      const reports = await request("/api/owner-alerts"); setRows(Array.isArray(reports) ? reports : []);
      Alert.alert("Report sent", "Your report was submitted. If you are in immediate danger, contact local emergency services or a trusted person now.");
    } catch (e) { Alert.alert("Report not sent", e instanceof Error ? e.message : "Please try again when connected."); }
    finally { setReportBusy(false); }
  };

  const submitPrefectRequest = async () => {
    if (!(user as any)?.isPrefect || !prefectTeacherId || !prefectTopic.trim() || prefectBusy) { Alert.alert("Teacher and topic required", "Choose a teacher and enter a lesson topic."); return; }
    setPrefectBusy(true);
    try {
      await request("/api/achievements/lesson-requests", { method: "POST", body: JSON.stringify({ teacherId: Number(prefectTeacherId), topic: prefectTopic.trim(), preferredDate: prefectDate || null, notes: prefectNotes.trim() || null }) });
      setPrefectTopic(""); setPrefectDate(""); setPrefectNotes("");
      const requests = await request("/api/achievements/lesson-requests"); setRows(Array.isArray(requests) ? requests : []);
      Alert.alert("Lesson request sent", "Your teacher has received the request.");
    } catch (e) { Alert.alert("Request failed", e instanceof Error ? e.message : "Please retry when connected."); }
    finally { setPrefectBusy(false); }
  };

  const togglePrefectFollow = async (targetType: "teacher" | "prefect", targetUserId: number, targetName: string) => {
    if (!(user as any)?.isPrefect || prefectBusy) return;
    setPrefectBusy(true);
    try {
      const existing = prefectFollows.find((item: any) => item.targetType === targetType && Number(item.targetUserId) === targetUserId);
      if (existing) await request("/api/follows/" + existing.id, { method: "DELETE" });
      else await request("/api/follows", { method: "POST", body: JSON.stringify({ targetType, targetUserId, targetName }) });
      const follows = await request("/api/follows"); setPrefectFollows(Array.isArray(follows) ? follows : []);
    } catch (e) { Alert.alert("Follow update failed", e instanceof Error ? e.message : "Please retry."); }
    finally { setPrefectBusy(false); }
  };

  const deletePrefectRequest = async (id: number) => {
    if (!(user as any)?.isPrefect || prefectBusy) return;
    Alert.alert("Delete lesson request?", "This removes your request.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setPrefectBusy(true);
        try { await request("/api/achievements/lesson-requests/" + id, { method: "DELETE" }); setRows(old => old.filter(item => item.id !== id)); }
        catch (e) { Alert.alert("Could not delete request", e instanceof Error ? e.message : "Please retry."); }
        finally { setPrefectBusy(false); }
      } },
    ]);
  };

  const paymentTotalOwed = rows.filter((p: any) => p.status !== "paid").reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const startPaynow = async () => {
    if (!isStudent || paymentBusy || paymentTotalOwed <= 0) return;
    setPaymentBusy(true);
    try {
      const result = await request("/api/payments/paynow/create", { method: "POST", body: JSON.stringify({ amount: paymentTotalOwed }) });
      if (!result?.checkoutUrl) throw new Error("Secure checkout did not return a link.");
      await Linking.openURL(String(result.checkoutUrl));
    } catch (e) { Alert.alert("Payment could not start", e instanceof Error ? e.message : "Please try again when connected."); }
    finally { setPaymentBusy(false); }
  };

  const notifyPayment = async () => {
    if (!isStudent || paymentBusy) return;
    setPaymentBusy(true);
    try {
      await request("/api/payments/notify-admin", { method: "POST", body: JSON.stringify({ amount: paymentTotalOwed }) });
      setPaymentReported(true);
      Alert.alert("School notified", "Your school has been asked to verify your payment. This is not confirmation that payment has cleared.");
    } catch (e) { Alert.alert("Could not notify school", e instanceof Error ? e.message : "Please retry when connected."); }
    finally { setPaymentBusy(false); }
  };

  const refreshGroupMessages = async (groupId: number) => {
    setChatLoading(true); setChatError("");
    try {
      const result = await request(`/api/messages?groupId=${groupId}`);
      setChatMessages(Array.isArray(result) ? result : []);
    } catch (e) { setChatError(e instanceof Error ? e.message : "Could not load group messages."); }
    finally { setChatLoading(false); }
  };

  const canManageSelectedGroup = Boolean(selectedChatGroup && (selectedChatGroup.creatorId === user?.id || (user as any)?.isManager || ["owner", "admin", "platform_owner"].includes(role)));

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
    if (user?.id) {
      const savedDraft = await AsyncStorage.getItem("dallyletter_group_draft_" + user.id + "_" + group.id).catch(() => null);
      if (savedDraft !== null) setChatDraft(savedDraft);
    }
    await refreshGroupMessages(group.id);
  };

  const sendGroupMessage = async () => {
    if (!selectedChatGroup || !chatDraft.trim() || chatSending) return;
    setChatSending(true);
    try {
      await request("/api/messages", { method: "POST", body: JSON.stringify({ content: chatDraft.trim(), type: "text", groupId: selectedChatGroup.id }) });
      setChatDraft("");
      if (user?.id) await AsyncStorage.removeItem("dallyletter_group_draft_" + user.id + "_" + selectedChatGroup.id).catch(() => undefined);
      await refreshGroupMessages(selectedChatGroup.id);
    } catch (e) { Alert.alert("Message not sent", e instanceof Error ? e.message : "Please retry."); }
    finally { setChatSending(false); }
  };

  const uploadGroupMessageMedia = async (documentOnly = false) => {
    if (!selectedChatGroup) return;
    let asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null };
    if (documentOnly) {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      asset = { uri: picked.assets[0].uri, fileName: picked.assets[0].name, mimeType: picked.assets[0].mimeType, type: "document" };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a group message."); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
      if (picked.canceled || !picked.assets[0]) return;
      asset = picked.assets[0];
    }
    setChatMediaBusy(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "group-media", type: asset.mimeType || (asset.type === "document" ? (asset.fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : asset.fileName?.toLowerCase().endsWith(".doc") ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") : asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
      form.append("groupId", String(selectedChatGroup.id));
      const uploaded = await request("/api/messages/media", { method: "POST", body: form });
      if (!uploaded?.mediaUrl) throw new Error("Upload completed without a media URL.");
      await request("/api/messages", { method: "POST", body: JSON.stringify({ content: asset.fileName || "Learning media", type: "media", groupId: selectedChatGroup.id, mediaUrl: uploaded.mediaUrl }) });
      await refreshGroupMessages(selectedChatGroup.id);
    } catch (e) { Alert.alert("Media not sent", e instanceof Error ? e.message : "Please retry."); }
    finally { setChatMediaBusy(false); }
  };

  const sendGroupVoiceMessage = async (file: VoiceRecordingFile) => {
    if (!selectedChatGroup || chatMediaBusy) throw new Error("Open a group conversation before recording a voice message.");
    if (groupSettings && groupSettings.allowMedia === false) throw new Error("Media and voice messages are disabled in this group.");
    setChatMediaBusy(true);
    try {
      const form = new FormData();
      form.append("groupId", String(selectedChatGroup.id));
      form.append("file", { uri: file.uri, name: file.fileName, type: file.mimeType } as any);
      const uploaded = await request("/api/messages/media", { method: "POST", body: form });
      if (!uploaded?.mediaUrl) throw new Error("Voice upload did not return a media URL.");
      await request("/api/messages", { method: "POST", body: JSON.stringify({ content: "Voice message", type: "voice", groupId: selectedChatGroup.id, mediaUrl: uploaded.mediaUrl }) });
      await refreshGroupMessages(selectedChatGroup.id);
    } finally { setChatMediaBusy(false); }
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
    if (!canManageExercises || !selected || !selectedSubmission || !submissionDetail) return;
    const answerRows = Array.isArray(submissionDetail.answers) ? submissionDetail.answers : [];
    const marks = answerRows.map((a: any) => ({ answerId: a.id, awardedMarks: Number(exerciseMarks[a.id] ?? 0), correctionNotes: exerciseNotes[a.id] ?? "", markingData: a.markingData ?? { ticks: [] } }));
    const questionMarks = new Map<number, number>((detail?.questions || []).map((q: any) => [Number(q.id), Number(q.marksAllocated)]));
    const invalidMark = marks.some((mark: any) => {
      const answer = answerRows.find((item: any) => Number(item.id) === Number(mark.answerId));
      const maximum = answer ? questionMarks.get(Number(answer.questionId)) : undefined;
      return !Number.isFinite(mark.awardedMarks) || mark.awardedMarks < 0 ||
        Math.round(mark.awardedMarks * 2) !== mark.awardedMarks * 2 ||
        maximum === undefined || !Number.isFinite(maximum) || mark.awardedMarks > maximum;
    });
    if (invalidMark) { Alert.alert("Check marks", "Each mark must be in 0.5 increments and between zero and that question allocated marks."); return; }
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

  const uploadAssignmentAttachment = async (documentOnly = false) => {
    if (!isStudent) return;
    let asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null };
    if (documentOnly) {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      asset = { uri: picked.assets[0].uri, fileName: picked.assets[0].name, mimeType: picked.assets[0].mimeType, type: "document" };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", "Allow media access to attach a file."); return; }
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });
      if (pick.canceled || !pick.assets[0]) return;
      asset = pick.assets[0];
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.fileName || "submission-media", type: asset.mimeType || (asset.type === "document" ? (asset.fileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : asset.fileName?.toLowerCase().endsWith(".doc") ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") : asset.type === "video" ? "video/mp4" : "image/jpeg") } as any);
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
      router.push((["manager","senior_manager"].includes(role) || Boolean((user as any)?.isManager) ? "/(manager)/more" : role === "teacher" ? "/(teacher)/more" : ["student","prefect"].includes(role) ? "/(student)/more" : "/(admin)/more") as any);
      return;
    }
    if (/^\/api\/(?:lessons|messages|assignments)\/.*media/i.test(url)) {
      Alert.alert("Protected learning media", "Use the Download for offline control beside this attachment. It downloads with your signed-in access and can then be opened locally.");
      return;
    }
    void Linking.openURL(getApiUrl(url));
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
        {queuedSubmissions.length>0 ? <Text style={{color:"#fde68a",fontSize:12,marginTop:6}}>{queuedSubmissions.length} submission(s) saved for offline retry · {queueBusy?"syncing…":"will retry when app is active"}</Text> : null}
        {queuedSubmissions.length>0 ? <TouchableOpacity onPress={()=>void retryQueuedSubmissions()} disabled={queueBusy} style={{alignSelf:"flex-start",marginTop:6,paddingHorizontal:10,paddingVertical:6,borderRadius:7,backgroundColor:"#ffffff20"}}><Text style={{color:"#fff",fontSize:12,fontWeight:"600"}}>{queueBusy?"Retrying…":"Retry pending submissions"}</Text></TouchableOpacity> : null}
      </View>
      {!section ? <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open your Profile Hub" style={[styles.card,{flexDirection:"row",alignItems:"center",gap:12,borderColor:colors.primary}]} onPress={()=>router.push("/profile-hub" as any)}><View style={styles.icon}><Feather name="user" size={21} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>Profile Hub</Text><Text style={styles.muted}>Your profile, qualifications, subjects, enrollments and achievements</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/></TouchableOpacity>
        <BreakElidemsShortcut />
        {visibleSections.map(item => (
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
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => void uploadMedia(true)} disabled={uploading}><Text style={[styles.buttonText, styles.secondaryText]}>{uploading ? "Uploading…" : "Attach PDF/Word document"}</Text></TouchableOpacity>
          {attachmentUrl ? <Text style={styles.muted}>Attachment uploaded: {attachmentUrl}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={() => void createAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Saving…" : editingAssignmentId !== null ? "Save assignment changes" : "Publish assignment"}</Text></TouchableOpacity>
          <View style={styles.separator}/>
        </>}
        {loading ? <ActivityIndicator color={colors.primary} size="large"/> : error ? <View style={styles.empty}><Text style={styles.body}>{error}</Text><TouchableOpacity style={styles.button} onPress={() => section && void loadSection(section)}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity></View> : null}
        {section === "polls" && isTeacher && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Create and publish a poll</Text><TextInput style={styles.input} value={pollTitle} onChangeText={setPollTitle} placeholder="Poll title" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={pollSubject} onChangeText={setPollSubject} placeholder="Subject (optional)" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={pollGrade} onChangeText={setPollGrade} placeholder="Grade (optional)" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={pollQuestion} onChangeText={setPollQuestion} placeholder="Question" placeholderTextColor={colors.mutedForeground}/>{pollChoices.map((choice,index)=><View key={index} style={{flexDirection:"row",alignItems:"center",gap:8}}><TouchableOpacity onPress={()=>setPollCorrect(index)} style={{padding:8}}><Feather name={pollCorrect===index?"check-circle":"circle"} size={20} color={pollCorrect===index?colors.primary:colors.mutedForeground}/></TouchableOpacity><TextInput style={[styles.input,{flex:1}]} value={choice} onChangeText={value=>setPollChoices(old=>old.map((v,i)=>i===index?value:v))} placeholder={`Answer choice ${index+1}`} placeholderTextColor={colors.mutedForeground}/></View>)}<Text style={styles.muted}>Tap the circle beside the correct answer. This creates a basic multiple-choice practice poll.</Text><TouchableOpacity style={styles.button} onPress={()=>void createAndPublishPoll()} disabled={pollBusy}><Text style={styles.buttonText}>{pollBusy?"Publishing…":"Publish poll"}</Text></TouchableOpacity></View></View>}
        {section === "notifications" && <NativePushControls />}
        {section === "notifications" && activeNotifications.map((n: any) => <TouchableOpacity key={n.id} style={styles.card} onPress={() => { if (!n.isRead) markRead.mutate({ id: n.id } as any, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }); } }); if (n.actionUrl) openUrl(n.actionUrl); }}><View style={styles.icon}><Feather name={"bell"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{n.title || n.message || "Notification"}</Text><Text style={styles.muted}>{n.body || n.description || n.createdAt || ""}</Text></View>{!n.isRead && <View style={{width:8,height:8,borderRadius:4,backgroundColor:colors.accent}}/>}</TouchableOpacity>)}
        {section === "groups" && canCreateGroups && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Create a study group</Text><TextInput style={styles.input} value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={colors.mutedForeground}/><TextInput style={styles.input} value={groupSubject} onChangeText={setGroupSubject} placeholder="Subject" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={groupDescription} onChangeText={setGroupDescription} placeholder="What will your group study?" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void createStudyGroup()} disabled={groupBusy}><Text style={styles.buttonText}>{groupBusy?"Creating…":"Create group"}</Text></TouchableOpacity></View></View>}
                {section === "groups" && (Array.isArray(groups) ? groups : []).map((g: any) => <View key={g.id} style={[styles.card,{alignItems:"flex-start"}]}><View style={styles.icon}><Feather name="users" size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{g.name}</Text><Text style={styles.muted}>{g.subject || "Study group"} · {g.memberCount ?? g.members?.length ?? 0} members</Text><Text style={styles.muted}>{g.description || ""}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:8}}>{!g.isMember && isStudent && <TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={async()=>{try{await request(`/api/study-groups/${g.id}/join`,{method:"POST"});await refetchGroups();Alert.alert("Joined group",`You joined ${g.name}.`);}catch(e){Alert.alert("Could not join group",e instanceof Error?e.message:"Please retry.");}}}><Text style={styles.buttonText}>Join group</Text></TouchableOpacity>}{g.isMember && <TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={()=>void openGroupChat(g)}><Text style={styles.buttonText}>Open group chat</Text></TouchableOpacity>}{g.isMember && <TouchableOpacity style={[styles.button,styles.secondary,{marginTop:0}]} onPress={()=>leaveStudyGroup(g)}><Text style={[styles.buttonText,styles.secondaryText]}>Leave</Text></TouchableOpacity>}</View></View></View>)}
        {section === "exercises" && (isTeacher || ["owner","admin","platform_owner"].includes(role) || Boolean((user as any)?.isManager)) && <View style={styles.card}>
          <View style={styles.grow}>
            <Text style={styles.sectionTitle}>Exercise builder</Text>
            <Text style={styles.muted}>Create a published exercise with written, choice or drawing questions. The server still enforces lesson permissions.</Text>
            <TouchableOpacity style={styles.button} onPress={()=>setExerciseBuilderOpen(v=>!v)}><Text style={styles.buttonText}>{exerciseBuilderOpen?"Close builder":"Create exercise"}</Text></TouchableOpacity>
            {exerciseBuilderOpen && <View style={{marginTop:12,gap:8}}>
              <Text style={styles.cardTitle}>Lesson</Text>
              {exerciseLessons.map(lesson=><TouchableOpacity key={lesson.id} style={[styles.card,{borderColor:String(lesson.id)===exerciseLessonId?colors.primary:colors.border}]} onPress={()=>setExerciseLessonId(String(lesson.id))}><Text style={[styles.body,{flex:1}]}>{lesson.title || `Lesson ${lesson.id}`}</Text><Feather name={String(lesson.id)===exerciseLessonId?"check-circle":"circle"} size={18} color={colors.primary}/></TouchableOpacity>)}
              {exerciseLessons.length===0 && <Text style={styles.muted}>No lessons returned for your account. Refresh the list or check lesson permissions.</Text>}
              <TextInput style={styles.input} value={exerciseTitle} onChangeText={setExerciseTitle} placeholder="Exercise title" placeholderTextColor={colors.mutedForeground}/>
              <TextInput style={[styles.input,styles.textArea]} value={exerciseInstructions} onChangeText={setExerciseInstructions} multiline placeholder="Instructions (optional)" placeholderTextColor={colors.mutedForeground}/>
              {exerciseDraftQuestions.map((q,index)=><View key={index} style={[styles.card,{alignItems:"stretch",flexDirection:"column"}]}>
                <Text style={styles.cardTitle}>Question {index+1}</Text>
                <TextInput style={[styles.input,styles.textArea]} value={q.prompt} onChangeText={v=>updateExerciseQuestion(index,{prompt:v})} multiline placeholder="Question prompt" placeholderTextColor={colors.mutedForeground}/>
                <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{([{value:"input",label:"Written"},{value:"poll",label:"Multiple choice"},{value:"drawbox",label:"Drawing"}] as const).map(t=><TouchableOpacity key={t.value} style={[styles.button,{marginTop:0,backgroundColor:q.type===t.value?colors.primary:colors.card,borderWidth:q.type===t.value?0:1,borderColor:colors.border}]} onPress={()=>updateExerciseQuestion(index,{type:t.value})}><Text style={[styles.buttonText,q.type!==t.value&&styles.secondaryText]}>{t.label}</Text></TouchableOpacity>)}</View>
                <TextInput style={styles.input} value={q.marks} onChangeText={v=>updateExerciseQuestion(index,{marks:v})} keyboardType="decimal-pad" placeholder="Marks (e.g. 2 or 0.5)" placeholderTextColor={colors.mutedForeground}/>
                {q.type==="drawbox" && <View style={{marginTop:8}}><Text style={styles.muted}>Optional teacher diagram / drawing template</Text><MobileDrawAnswer value={q.drawData||{}} onChange={drawData=>updateExerciseQuestion(index,{drawData})}/></View>}
                {q.type==="poll" && <View style={{gap:8}}><Text style={styles.muted}>Options — select the correct answer</Text>{q.options.map((option,oi)=><View key={oi} style={{flexDirection:"row",alignItems:"center",gap:8}}><TouchableOpacity onPress={()=>updateExerciseQuestion(index,{correct:oi})}><Feather name={q.correct===oi?"check-circle":"circle"} size={20} color={colors.primary}/></TouchableOpacity><TextInput style={[styles.input,{flex:1,marginBottom:0}]} value={option} onChangeText={v=>updateExerciseQuestion(index,{options:q.options.map((old,j)=>j===oi?v:old)})} placeholder={`Option ${oi+1}`} placeholderTextColor={colors.mutedForeground}/><TouchableOpacity onPress={()=>updateExerciseQuestion(index,{options:q.options.filter((_,j)=>j!==oi),correct:oi===q.correct?0:oi<q.correct?q.correct-1:q.correct})} disabled={q.options.length<=2}><Feather name="trash-2" size={18} color={q.options.length<=2?colors.mutedForeground:"#dc2626"}/></TouchableOpacity></View>)}<TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>updateExerciseQuestion(index,{options:[...q.options,""]})}><Text style={[styles.buttonText,styles.secondaryText]}>Add option</Text></TouchableOpacity></View>}
                {exerciseDraftQuestions.length>1 && <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>setExerciseDraftQuestions(old=>old.filter((_,i)=>i!==index))}><Text style={[styles.buttonText,styles.secondaryText]}>Remove question</Text></TouchableOpacity>}
              </View>)}
              <TouchableOpacity style={[styles.button,styles.secondary]} onPress={addExerciseQuestion}><Text style={[styles.buttonText,styles.secondaryText]}>Add question</Text></TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={()=>void createMobileExercise()} disabled={exerciseBuilderBusy}><Text style={styles.buttonText}>{exerciseBuilderBusy?"Saving exercise…":"Save questions and publish"}</Text></TouchableOpacity>
            </View>}
          </View>
        </View>}
        {["assignments", "exercises", "polls"].includes(section) && rows.map(row => <View key={row.id} style={styles.card}><TouchableOpacity style={{flex:1,flexDirection:"row",alignItems:"center",gap:12}} onPress={() => void openRow(row)}><View style={styles.icon}><Feather name={section === "assignments" ? "clipboard" : section === "exercises" ? "edit-3" : "check-square"} size={20} color={colors.primary}/></View><View style={styles.grow}><Text style={styles.cardTitle}>{row.title || row.name || "Untitled"}</Text><Text style={styles.muted}>{[row.subject, row.grade, row.dueDate ? `Due ${String(row.dueDate).slice(0,10)}` : null, row.status].filter(Boolean).join(" · ")}</Text>{row.description ? <Text numberOfLines={3} style={styles.muted}>{row.description}</Text> : null}{row.attachmentUrl ? <Text style={{color:colors.primary,fontSize:12,marginTop:5}}>Attachment available</Text> : null}</View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/></TouchableOpacity>{section === "assignments" && isTeacher && <View style={{gap:10,justifyContent:"center"}}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit assignment" onPress={()=>editAssignment(row)}><Feather name="edit-2" size={18} color={colors.primary}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Toggle reference material visibility" onPress={()=>void toggleAssignmentReference(row)}><Feather name={row.referenceMaterialHidden?"eye":"eye-off"} size={18} color={colors.primary}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete assignment" onPress={()=>deleteAssignment(row)}><Feather name="trash-2" size={18} color="#dc2626"/></TouchableOpacity></View>}</View>)}
        {section === "exercises" && canManageExercises && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Exercise submissions · {selected.title}</Text>{(submissionMap[selected.id] || []).map(sub => <TouchableOpacity key={sub.id} onPress={() => void loadExerciseSubmission(sub)} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><UserProfileLink userId={sub.studentId ?? sub.student?.id} name={sub.studentName || sub.student?.name || `Learner #${sub.studentId ?? "?"}`} avatarUrl={sub.student?.avatarUrl} /><Text style={styles.muted}>{sub.status || "Submitted"} · {sub.totalScore != null ? `Score ${sub.totalScore}` : "Awaiting marking"}</Text></TouchableOpacity>)}{selectedSubmission && submissionDetail && <View style={{marginTop:14}}><View style={{marginBottom:8}}><UserProfileLink userId={selectedSubmission.studentId ?? selectedSubmission.student?.id} name={(selectedSubmission.studentName || selectedSubmission.student?.name || "Learner") + " · Marking"} avatarUrl={selectedSubmission.student?.avatarUrl} /></View>{(submissionDetail.answers || []).map((a:any,index:number)=><View key={a.id} style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>Question {index+1}</Text><Text style={styles.body}>{a.textAnswer || a.selectedValue || (a.mediaReference ? "Learner attached media" : a.drawData ? "Learner submitted a drawing" : "No written answer")}</Text>{a.drawData ? <MobileDrawAnswer value={a.drawData} disabled onChange={() => undefined}/> : null}{a.mediaReference ? <View style={{marginTop:8}}><AuthenticatedMediaPreview url={String(a.mediaReference)} height={160} accessibilityLabel="Learner answer media"/><TouchableOpacity onPress={() => openUrl(a.mediaReference)}><Text style={{color:colors.primary,marginTop:5}}>Open answer media</Text></TouchableOpacity></View> : null}<TextInput style={styles.input} keyboardType="numeric" value={exerciseMarks[a.id] ?? "0"} onChangeText={v=>setExerciseMarks(old=>({...old,[a.id]:v}))} placeholder="Marks awarded" placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={exerciseNotes[a.id] ?? ""} onChangeText={v=>setExerciseNotes(old=>({...old,[a.id]:v}))} placeholder="Correction / feedback" placeholderTextColor={colors.mutedForeground}/></View>)}<TextInput style={[styles.input,styles.textArea]} multiline value={overallComment} onChangeText={setOverallComment} placeholder="Overall feedback to learner" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={() => void returnExerciseMarking()} disabled={busy}><Text style={styles.buttonText}>{busy?"Saving marks…":"Save marks and return result"}</Text></TouchableOpacity></View>}</View></View>}
        {section === "assignments" && isStudent && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submit: {selected.title}</Text><TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void saveLearningItemOffline()}><Text style={[styles.buttonText,styles.secondaryText]}>Save assignment for offline access</Text></TouchableOpacity>{selected.description ? <Text style={styles.body}>{selected.description}</Text> : <Text style={styles.muted}>No additional instructions were provided.</Text>}{(submissionMap[selected.id] || []).slice(0,1).map(sub=><View key={sub.id} style={{backgroundColor:colors.background,borderRadius:10,padding:10,marginVertical:8}}><Text style={styles.cardTitle}>Previous submission: {sub.status || "Submitted"}</Text>{sub.marks != null ? <Text style={styles.muted}>Marks: {sub.marks}/{selected.totalMarks || "—"}</Text> : null}{sub.feedback ? <Text style={styles.muted}>Teacher feedback: {sub.feedback}</Text> : null}</View>)}{selected.attachmentUrl && !selected.referenceMaterialHidden ? <View style={{marginBottom:10}}><AuthenticatedMediaPreview url={String(selected.attachmentUrl)} height={180} accessibilityLabel="Assignment reference material"/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>openUrl(selected.attachmentUrl)}><Text style={[styles.buttonText,styles.secondaryText]}>Open reference material</Text></TouchableOpacity></View> : selected.referenceMaterialHidden ? <Text style={styles.muted}>Reference material is hidden by the teacher.</Text> : null}<TextInput style={[styles.input,styles.textArea]} multiline value={answerText} onChangeText={value=>{setAnswerText(value);if(user?.id&&selected?.id)void AsyncStorage.setItem("dallyletter_assignment_draft_"+user.id+"_"+selected.id,value).catch(()=>undefined);}} placeholder="Write your answer or submission notes" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void uploadAssignmentAttachment()} disabled={uploading}><Text style={[styles.buttonText,styles.secondaryText]}>{uploading ? "Uploading…" : attachmentUrl ? "Replace attachment" : "Attach image/video"}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void uploadAssignmentAttachment(true)} disabled={uploading}><Text style={[styles.buttonText,styles.secondaryText]}>{uploading ? "Uploading…" : "Attach PDF/Word document"}</Text></TouchableOpacity><TouchableOpacity style={styles.button} onPress={() => void submitAssignment()} disabled={busy}><Text style={styles.buttonText}>{busy ? "Submitting…" : "Submit assignment"}</Text></TouchableOpacity></View></View>}
        {section === "assignments" && isTeacher && selected && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Submissions · {selected.title}</Text>{(submissionMap[selected.id] || []).map(sub => <View key={sub.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{sub.studentName || sub.student?.name || `Learner #${sub.studentId ?? "?"}`}</Text><Text style={styles.muted}>{sub.content || sub.fileName || "No written response"} · {sub.status || "Submitted"}</Text>{sub.fileUrl && <TouchableOpacity onPress={() => openUrl(sub.fileUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity>}<TextInput style={styles.input} keyboardType="numeric" value={assignmentMarks[sub.id] ?? String(sub.marks ?? "")} onChangeText={v=>setAssignmentMarks(old=>({...old,[sub.id]:v}))} placeholder={`Marks / ${selected.totalMarks || 100}`} placeholderTextColor={colors.mutedForeground}/><TextInput style={[styles.input,styles.textArea]} multiline value={assignmentFeedback[sub.id] ?? String(sub.feedback ?? "")} onChangeText={v=>setAssignmentFeedback(old=>({...old,[sub.id]:v}))} placeholder="Feedback for learner" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void markAssignment(sub,assignmentMarks[sub.id] ?? String(sub.marks ?? ""),assignmentFeedback[sub.id] ?? String(sub.feedback ?? ""))}><Text style={styles.buttonText}>Save marks and feedback</Text></TouchableOpacity></View>)}</View></View>}
        {(section === "exercises" || section === "polls") && selected && detail && <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>{detail.exercise?.title || detail.poll?.title || selected.title}</Text><TouchableOpacity style={[styles.button,styles.secondary]} onPress={() => void saveLearningItemOffline()}><Text style={[styles.buttonText,styles.secondaryText]}>Save {section === "exercises" ? "exercise" : "poll"} for offline access</Text></TouchableOpacity><Text style={styles.body}>{detail.exercise?.description || detail.description || ""}</Text>{section === "exercises" && isStudent && exerciseLocked && <View style={{marginTop:12,padding:12,borderRadius:10,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={styles.cardTitle}>Previous attempt: {exerciseResult?.submission?.status || "Submitted"}</Text>{exerciseResult?.submission?.totalScore != null ? <Text style={styles.muted}>Score: {exerciseResult.submission.totalScore}/{detail.exercise?.totalMarks ?? "—"}</Text> : <Text style={styles.muted}>Your attempt is saved. Start a new attempt if retries are available.</Text>}{exerciseResult?.submission?.status === "marked" && <View style={{marginTop:10,gap:8}}><Text style={styles.cardTitle}>Teacher feedback</Text>{exerciseResult.submission.overallComment ? <Text style={styles.body}>{exerciseResult.submission.overallComment}</Text> : <Text style={styles.muted}>No overall comment was provided.</Text>}{(exerciseResult.answers || []).map((answer:any,index:number)=><View key={answer.id} style={{padding:10,borderRadius:8,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}}><Text style={styles.cardTitle}>Question {index+1}: {answer.awardedMarks ?? 0}/{detail.questions?.find((q:any)=>Number(q.id)===Number(answer.questionId))?.marksAllocated ?? "—"}</Text>{answer.correctionNotes ? <Text style={styles.body}>{answer.correctionNotes}</Text> : <Text style={styles.muted}>No per-question comment.</Text>}</View>)}</View>}{exerciseResult?.submission?.status === "marked" ? <TouchableOpacity style={[styles.button,styles.secondary]} onPress={async()=>{if(draftKey) await AsyncStorage.removeItem(draftKey).catch(()=>undefined);setAnswers({});setNewAttempt(true);setExerciseResult(null);setDraftKey(user?.id&&detail?.exercise?.id?`dallyletter_exercise_draft_${user.id}_${detail.exercise.id}`:null);}}><Text style={[styles.buttonText,styles.secondaryText]}>Start new attempt</Text></TouchableOpacity> : <Text style={styles.muted}>Your attempt is awaiting teacher marking. A new attempt will be available after the result is returned.</Text>}</View>}{section === "polls" && isStudent && !pollResult && <View style={{marginTop:12,padding:12,borderRadius:10,backgroundColor:colors.background}}><Text style={styles.cardTitle}>Result privacy</Text><Text style={styles.muted}>Choose who can see your poll results.</Text><View style={{flexDirection:"row",gap:8,marginTop:8}}>{(["private","public"] as const).map(option=><TouchableOpacity key={option} onPress={()=>setPollPrivacy(option)} style={{flex:1,padding:10,borderRadius:8,borderWidth:1,borderColor:pollPrivacy===option?colors.primary:colors.border,backgroundColor:pollPrivacy===option?colors.primary+"18":colors.card}}><Text style={{color:colors.foreground,textAlign:"center",fontWeight:"600"}}>{option==="private"?"Private":"Public"}</Text></TouchableOpacity>)}</View></View>}{(detail.questions || []).map((q: any, index: number) => <View key={q.id} style={{marginTop:16,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border}}><Text style={styles.cardTitle}>{index+1}. {q.question || q.prompt || "Question"}</Text>{q.imageUrl && <View style={{ marginTop: 8 }}><AuthenticatedMediaPreview url={String(q.imageUrl)} height={180} accessibilityLabel={String(q.question || "Question image")} /><TouchableOpacity onPress={() => openUrl(q.imageUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open question media</Text></TouchableOpacity></View>}{q.config?.attachment?.url ? <View style={{marginTop:8,padding:10,borderRadius:10,borderWidth:1,borderColor:colors.border}}><AuthenticatedMediaPreview url={String(q.config.attachment.url)} height={160} accessibilityLabel={String(q.config.attachment.fileName || q.question || "Question attachment")}/><Text style={styles.muted}>{q.config.attachment.fileName || "Question attachment"}</Text><TouchableOpacity onPress={()=>openUrl(String(q.config.attachment.url))}><Text style={{color:colors.primary,marginTop:5}}>Open question attachment</Text></TouchableOpacity></View> : null}{section === "polls" ? (q.options || []).map((o:any) => <TouchableOpacity key={o.id} disabled={Boolean(pollResult)} style={[styles.card,{marginTop:8,borderColor:answers[String(q.id)]===o.id?colors.primary:colors.border,opacity:pollResult?0.65:1}]} onPress={() => setAnswers(a=>({...a,[String(q.id)]:o.id}))}><Feather name={answers[String(q.id)]===o.id?"check-circle":"circle"} size={18} color={colors.primary}/><Text style={[styles.body,{flex:1}]}>{o.text}</Text></TouchableOpacity>) : q.type === "poll" ? ((detail.options || []).filter((o:any)=>Number(o.questionId)===Number(q.id))).map((o:any)=><TouchableOpacity key={o.id} disabled={exerciseLocked} style={[styles.card,{marginTop:8,borderColor:answers[String(q.id)]?.selectedValue===o.value?colors.primary:colors.border,opacity:exerciseLocked?0.65:1}]} onPress={()=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],selectedValue:o.value}}))}><Feather name={answers[String(q.id)]?.selectedValue===o.value?"check-circle":"circle"} size={18} color={colors.primary}/><Text style={[styles.body,{flex:1}]}>{o.label || o.value}</Text></TouchableOpacity>) : q.type === "drawbox" ? <MobileDrawAnswer value={{...(answers[String(q.id)]?.drawData || {}), teacherDrawing: q.config?.teacherDrawing}} disabled={!isStudent || exerciseLocked} onChange={drawData=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],drawData}}))} /> : <><TextInput style={[styles.input,styles.textArea,{marginTop:8}]} multiline value={answers[String(q.id)]?.textAnswer || ""} editable={!exerciseLocked} onChangeText={v=>setAnswers(a=>({...a,[String(q.id)]:{...a[String(q.id)],textAnswer:v}}))} placeholder="Your answer" placeholderTextColor={colors.mutedForeground}/>{isStudent && <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadExerciseAnswerMedia(q.id)} disabled={exerciseLocked || uploadingAnswerId===q.id}><Text style={[styles.buttonText,styles.secondaryText]}>{uploadingAnswerId===q.id?"Uploading answer…":answers[String(q.id)]?.mediaReference?"Replace attached media":"Attach image/video answer"}</Text></TouchableOpacity>}{answers[String(q.id)]?.mediaReference ? <Text style={styles.muted}>Answer media attached.</Text> : null}</>}</View>)}{isStudent && (section === "polls" ? !pollResult : !exerciseLocked) && <TouchableOpacity style={styles.button} onPress={() => section==="polls"?void submitPoll():void submitExercise()} disabled={busy}><Text style={styles.buttonText}>{busy?"Submitting…":section==="polls"?"Submit quiz":"Submit exercise"}</Text></TouchableOpacity>}{section === "polls" && pollResult && <View style={{marginTop:16,padding:14,borderRadius:12,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={styles.sectionTitle}>Your result</Text><Text style={styles.body}>{pollResult.score != null ? `Score: ${pollResult.score}/${pollResult.totalQuestions ?? "—"}` : "Your submission was recorded."}</Text>{pollResult.percentage != null ? <Text style={styles.cardTitle}>{pollResult.percentage}%</Text> : null}</View>}{!isStudent && <Text style={styles.muted}>Preview only: staff can inspect content but cannot submit as a learner.</Text>}</View></View>}
        {section === "messages" && <View style={{gap:12}}>
          <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Private conversations</Text><Text style={styles.muted}>Conversations are fetched from the authenticated API. The server enforces who can message whom and who can read each conversation.</Text></View></View>
          {!privateRecipient && messageContacts.map(person=><View key={person.id} style={styles.card}><View style={styles.grow}><UserProfileLink userId={person.id} name={person.name||"User"} avatarUrl={person.avatarUrl}/><Text style={styles.muted}>{person.role||"Member"}{person.subject?" · "+person.subject:""}{person.grade?" · "+person.grade:""}</Text></View><TouchableOpacity style={styles.button} onPress={()=>void openPrivateConversation(person)}><Text style={styles.buttonText}>Open chat</Text></TouchableOpacity></View>)}
          {!privateRecipient && messageContacts.length===0 && <Text style={styles.muted}>No eligible contacts are available for this account.</Text>}
          {privateRecipient && <View style={[styles.card,{alignItems:"stretch"}]}>
            <TouchableOpacity style={styles.close} onPress={()=>{setPrivateRecipient(null);setPrivateMessages([]);setPrivateDraft("");setError("");}}><Text style={{color:colors.primary,fontWeight:"600"}}>← All contacts</Text></TouchableOpacity>
            <Text style={styles.sectionTitle}>Chat with {privateRecipient.name||"User"}</Text>
            {privateBusy && <ActivityIndicator color={colors.primary}/>}
            {!privateBusy && privateMessages.length===0 && <Text style={styles.muted}>No messages yet. Start a private conversation.</Text>}
            {privateMessages.map(message=><View key={message.id} style={{padding:10,borderRadius:10,marginTop:8,backgroundColor:Number(message.senderId)===Number(user?.id)?colors.primary+"18":colors.background,alignSelf:Number(message.senderId)===Number(user?.id)?"flex-end":"stretch",maxWidth:"100%"}}><Text style={styles.muted}>{Number(message.senderId)===Number(user?.id)?"You":privateRecipient.name} · {message.createdAt?new Date(message.createdAt).toLocaleString():""}</Text><Text style={styles.body}>{message.type==="voice"?"Voice message":message.type==="media"?"Shared media":message.content}</Text>{message.type==="voice"&&message.mediaUrl?<AuthenticatedAudioMessage url={String(message.mediaUrl)}/>:message.type==="media"&&message.mediaUrl?<><AuthenticatedMediaPreview url={String(message.mediaUrl)} height={170} accessibilityLabel="Private message attachment"/><TouchableOpacity onPress={()=>openUrl(message.mediaUrl)}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity></>:null}</View>)}
            {error ? <Text style={{color:"#dc2626",marginTop:8}}>{error}</Text>:null}
            <TextInput style={[styles.input,styles.textArea,{marginTop:12}]} value={privateDraft} onChangeText={setPrivateDraft} multiline placeholder="Write a private message…" placeholderTextColor={colors.mutedForeground}/>
            <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadPrivateMedia()} disabled={privateMediaBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{privateMediaBusy?"Uploading and sending…":"Attach image/video"}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadPrivateMedia(true)} disabled={privateMediaBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{privateMediaBusy?"Uploading and sending…":"Attach PDF/Word document"}</Text></TouchableOpacity>
            <VoiceMessageComposer disabled={privateBusy||privateMediaBusy} onSend={sendPrivateVoiceMessage}/>
            <TouchableOpacity style={styles.button} onPress={()=>void sendPrivateMessage()} disabled={privateBusy||!privateDraft.trim()}><Text style={styles.buttonText}>{privateBusy?"Sending…":"Send private message"}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void openPrivateConversation(privateRecipient)} disabled={privateBusy}><Text style={[styles.buttonText,styles.secondaryText]}>Refresh conversation</Text></TouchableOpacity>
          </View>}
        </View>}
        {section === "audit" && <View style={{gap:10}}>
          <View style={styles.card}><View style={styles.grow}><Text style={styles.sectionTitle}>Activity audit</Text><Text style={styles.muted}>{role === "owner" ? "Owner view: authorized audit details are visible." : "Manager view: only allowed academic/activity categories are shown; sensitive operational, owner/admin, payment, app/system, authentication, security and data-management logs are excluded by the API."}</Text></View></View>
          {rows.map((log:any)=><View key={log.id} style={styles.card}><View style={styles.grow}><Text style={styles.cardTitle}>{log.action || "Activity"} · {log.category || "uncategorized"}</Text><Text style={styles.muted}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}{log.performerName ? " · "+log.performerName : ""}{log.performerRole ? " ("+log.performerRole+")" : ""}</Text>{log.targetType ? <Text style={styles.muted}>Target: {log.targetType}{log.targetId ? " #"+log.targetId : ""}</Text> : null}{role === "owner" && log.details ? <Text selectable style={styles.body}>{String(log.details)}</Text> : null}</View></View>)}
          {!loading && rows.length===0 ? <Text style={styles.muted}>No audit records are available to this account.</Text> : null}
          <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void loadSection("audit")} disabled={loading}><Text style={[styles.buttonText,styles.secondaryText]}>{loading?"Refreshing…":"Refresh audit history"}</Text></TouchableOpacity>
        </View>}
        {section === "reports" && isStudent && <View style={{gap:12}}>
          <View style={[styles.card,{alignItems:"stretch"}]}>
            <Text style={styles.sectionTitle}>Report to the owner</Text>
            <Text style={styles.muted}>Use this for cyberbullying, threats, abuse, fraud, teacher concerns or other serious platform issues. Share only the details needed to explain what happened.</Text>
            <Text style={styles.cardTitle}>Category</Text>
            {([{value:"cyberbullying",label:"Cyberbullying"},{value:"threat",label:"Threat"},{value:"abuse",label:"Abuse"},{value:"fraud",label:"Fraud"},{value:"teacher",label:"Teacher concern"},{value:"general",label:"General report"}]).map((item:any)=><TouchableOpacity key={item.value} style={[styles.card,{borderColor:reportCategory===item.value?colors.primary:colors.border}]} onPress={()=>setReportCategory(item.value)}><Text style={[styles.body,{flex:1}]}>{item.label}</Text><Feather name={reportCategory===item.value?"check-circle":"circle"} size={18} color={colors.primary}/></TouchableOpacity>)}
            <Text style={styles.cardTitle}>Severity</Text>
            <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{([{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"},{value:"critical",label:"Critical / emergency"}]).map((item:any)=><TouchableOpacity key={item.value} style={[styles.button,{marginTop:0,backgroundColor:reportSeverity===item.value?colors.primary:colors.card,borderWidth:reportSeverity===item.value?0:1,borderColor:colors.border}]} onPress={()=>setReportSeverity(item.value)}><Text style={[styles.buttonText,reportSeverity!==item.value&&styles.secondaryText]}>{item.label}</Text></TouchableOpacity>)}</View>
            <TextInput style={styles.input} value={reportTitle} onChangeText={setReportTitle} placeholder="Short report title" placeholderTextColor={colors.mutedForeground}/>
            <TextInput style={[styles.input,styles.textArea]} multiline value={reportDescription} onChangeText={setReportDescription} placeholder="Describe what happened, when, and any relevant context" placeholderTextColor={colors.mutedForeground}/>
            <TouchableOpacity style={styles.button} onPress={()=>void submitSafetyReport()} disabled={reportBusy}><Text style={styles.buttonText}>{reportBusy?"Sending report…":"Send confidential report"}</Text></TouchableOpacity>
          </View>
          <Text style={styles.sectionTitle}>My reports and owner responses</Text>
          {rows.length===0?<Text style={styles.muted}>No reports are available yet.</Text>:rows.map((item:any)=><View key={item.id} style={styles.card}><View style={styles.grow}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.muted}>{item.category||"Report"} · {item.severity||"medium"} · {item.status||"submitted"}</Text><Text style={styles.body}>{item.description}</Text>{item.resolution?<Text style={[styles.muted,{marginTop:6}]}>Owner response: {item.resolution}</Text>:null}</View></View>)}
        </View>}
        {section === "prefect" && Boolean((user as any)?.isPrefect) && <View style={{gap:12}}>
          <View style={[styles.card,{alignItems:"stretch"}]}>
            <Text style={styles.sectionTitle}>Request a lesson</Text>
            <Text style={styles.muted}>Choose a teacher and suggest a topic. Date and notes are optional.</Text>
            {prefectTeachers.map((teacher:any)=><View key={teacher.id} style={[styles.card,{borderColor:String(teacher.id)===prefectTeacherId?colors.primary:colors.border}]}><View style={styles.grow}><UserProfileLink userId={teacher.id} name={teacher.name} avatarUrl={teacher.avatarUrl}/><Text style={styles.muted}>{teacher.subject||"Teacher"}</Text></View><TouchableOpacity style={styles.button} onPress={()=>setPrefectTeacherId(String(teacher.id))}><Text style={styles.buttonText}>{String(teacher.id)===prefectTeacherId?"Selected":"Choose teacher"}</Text></TouchableOpacity></View>)}
            <TextInput style={styles.input} value={prefectTopic} onChangeText={setPrefectTopic} placeholder="Lesson topic" placeholderTextColor={colors.mutedForeground}/>
            <TextInput style={styles.input} value={prefectDate} onChangeText={setPrefectDate} placeholder="Preferred date (YYYY-MM-DD)" placeholderTextColor={colors.mutedForeground}/>
            <TextInput style={[styles.input,styles.textArea]} multiline value={prefectNotes} onChangeText={setPrefectNotes} placeholder="Notes for the teacher (optional)" placeholderTextColor={colors.mutedForeground}/>
            <TouchableOpacity style={styles.button} onPress={()=>void submitPrefectRequest()} disabled={prefectBusy||prefectTeachers.length===0}><Text style={styles.buttonText}>{prefectBusy?"Sending…":"Send lesson request"}</Text></TouchableOpacity>
          </View>
          <Text style={styles.sectionTitle}>My lesson requests</Text>
          {rows.length===0?<Text style={styles.muted}>No lesson requests yet.</Text>:rows.map((item:any)=><View key={item.id} style={styles.card}><View style={styles.grow}><Text style={styles.cardTitle}>{item.topic}</Text><Text style={styles.muted}>Status: {item.status}{item.preferredDate?" · Preferred "+item.preferredDate:""}</Text>{item.teacherReply?<Text style={styles.body}>Teacher reply: {item.teacherReply}</Text>:null}</View><TouchableOpacity onPress={()=>void deletePrefectRequest(Number(item.id))} disabled={prefectBusy}><Feather name="trash-2" size={18} color="#dc2626"/></TouchableOpacity></View>)}
          <Text style={styles.sectionTitle}>Teachers to follow</Text>
          {prefectTeachers.map((person:any)=>{const following=prefectFollows.some((item:any)=>item.targetType==="teacher"&&Number(item.targetUserId)===Number(person.id));return <View key={"teacher-"+person.id} style={styles.card}><View style={styles.grow}><UserProfileLink userId={person.id} name={person.name} avatarUrl={person.avatarUrl} /><Text style={styles.muted}>{person.subject||"Teacher"}</Text></View><TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={()=>void togglePrefectFollow("teacher",Number(person.id),String(person.name))} disabled={prefectBusy}><Text style={styles.buttonText}>{following?"Unfollow":"Follow"}</Text></TouchableOpacity></View>;})}
          <Text style={styles.sectionTitle}>Other prefects</Text>
          {prefectLeaderboard.map((person:any)=>{const following=prefectFollows.some((item:any)=>item.targetType==="prefect"&&Number(item.targetUserId)===Number(person.id));return <View key={"prefect-"+person.id} style={styles.card}><View style={styles.grow}><UserProfileLink userId={person.id} name={person.name+(Number(person.id)===Number(user?.id)?" (You)":"")} avatarUrl={person.avatarUrl} /><Text style={styles.muted}>{person.grade||"Learner"} · {person.badgeCount??0} badges</Text></View>{Number(person.id)!==Number(user?.id)&&<TouchableOpacity style={[styles.button,{marginTop:0}]} onPress={()=>void togglePrefectFollow("prefect",Number(person.id),String(person.name))} disabled={prefectBusy}><Text style={styles.buttonText}>{following?"Unfollow":"Follow"}</Text></TouchableOpacity>}</View>;})}
        </View>}
        {section === "achievements" && <View style={{gap:12}}>
          <View style={styles.card}><View style={styles.grow}><Text style={styles.cardTitle}>Badges earned</Text><Text style={styles.sectionTitle}>{myBadges.length}</Text><Text style={styles.muted}>Performance points: {Number((user as any)?.performanceScore ?? 0)}</Text></View></View>
          <View style={{flexDirection:"row",gap:8}}>{(["badges","leaderboard","all"] as const).map(tab=><TouchableOpacity key={tab} style={[styles.button,{flex:1,marginTop:0,backgroundColor:achievementTab===tab?colors.primary:colors.card,borderWidth:achievementTab===tab?0:1,borderColor:colors.border}]} onPress={()=>setAchievementTab(tab)}><Text style={[styles.buttonText,achievementTab!==tab&&styles.secondaryText]}>{tab==="badges"?"My badges":tab==="leaderboard"?"Leaderboard":"All badges"}</Text></TouchableOpacity>)}</View>
          {achievementTab==="badges" && (myBadges.length===0?<Text style={styles.muted}>No badges earned yet. Keep learning to unlock achievements.</Text>:myBadges.map((item:any)=><View key={item.id} style={styles.card}><Text style={{fontSize:30}}>{item.achievement?.icon||"🏆"}</Text><View style={styles.grow}><Text style={styles.cardTitle}>{item.achievement?.name||"Badge"}</Text><Text style={styles.muted}>{item.achievement?.description||""}</Text><Text style={styles.muted}>+{item.achievement?.pointsValue??0} points · {item.earnedAt?new Date(item.earnedAt).toLocaleDateString():""}</Text></View></View>))}
          {achievementTab==="leaderboard" && (achievementLeaderboard.length===0?<Text style={styles.muted}>Leaderboard is empty.</Text>:achievementLeaderboard.map((item:any,index:number)=><View key={item.id} style={[styles.card,{borderColor:Number(item.id)===Number(user?.id)?colors.primary:colors.border}]}><Text style={styles.cardTitle}>#{index+1}</Text><View style={styles.grow}><UserProfileLink userId={item.id} name={item.name+(Number(item.id)===Number(user?.id)?" (You)":"")+(item.isPrefect?" ⭐":"")} avatarUrl={item.avatarUrl} /><Text style={styles.muted}>{item.grade||"General"} · {item.streakDays??0} day streak · {item.badgeCount??0} badges</Text></View><Text style={styles.cardTitle}>{item.performanceScore??0} pts</Text></View>))}
          {achievementTab==="all" && allAchievements.map((item:any)=>{const earned=myBadges.some((badge:any)=>Number(badge.achievementId)===Number(item.id));return <View key={item.id} style={[styles.card,{opacity:earned?1:0.7}]}><Text style={{fontSize:28}}>{item.icon||"🏆"}</Text><View style={styles.grow}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.muted}>{item.description||""}</Text><Text style={styles.muted}>{earned?"Earned ✓":"Available · "+(item.pointsValue??0)+" points"}</Text></View></View>;})}
        </View>}
        {section === "payments" && <View style={{gap:12}}>
          <View style={[styles.card,{alignItems:"stretch"}]}>
            <View style={styles.grow}>
              <Text style={styles.sectionTitle}>School fee summary</Text>
              <Text style={styles.body}>Outstanding: ${paymentTotalOwed.toFixed(2)}</Text>
              <Text style={styles.muted}>{rows.filter((p:any)=>p.status==="paid").length} paid · {rows.filter((p:any)=>p.status==="overdue").length} overdue · {rows.filter((p:any)=>p.status==="pending").length} pending</Text>
            </View>
            {isStudent && paymentTotalOwed > 0 && paymentSettings.paynow_url && <TouchableOpacity style={styles.button} onPress={()=>void startPaynow()} disabled={paymentBusy}><Text style={styles.buttonText}>{paymentBusy?"Opening secure checkout…":"Pay securely with Paynow"}</Text></TouchableOpacity>}
            {isStudent && paymentSettings.paypal_url ? <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>{const value=String(paymentSettings.paypal_url);void Linking.openURL(value.startsWith("http")?value:"https://paypal.me/"+value);}}><Text style={[styles.buttonText,styles.secondaryText]}>Open PayPal</Text></TouchableOpacity>:null}
            {isStudent && paymentSettings.ecocash_number ? <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void Linking.openURL("tel:"+String(paymentSettings.ecocash_number))}><Text style={[styles.buttonText,styles.secondaryText]}>Call / open EcoCash: {String(paymentSettings.ecocash_number)}</Text></TouchableOpacity>:null}
            {isStudent && paymentSettings.trust_wallet ? <View style={{padding:10,borderWidth:1,borderColor:colors.border,borderRadius:10,marginTop:8}}><Text style={styles.cardTitle}>Wallet payment address</Text><Text selectable style={styles.body}>{String(paymentSettings.trust_wallet)}</Text></View>:null}
            {isStudent && paymentSettings.payment_instructions ? <Text style={styles.muted}>{String(paymentSettings.payment_instructions)}</Text>:null}
            {isStudent ? ((paymentSettings.paynow_url || paymentSettings.paypal_url || paymentSettings.ecocash_number || paymentSettings.trust_wallet) ? <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void notifyPayment()} disabled={paymentBusy||paymentReported}><Text style={[styles.buttonText,styles.secondaryText]}>{paymentReported?"School notified":"I have paid — notify school"}</Text></TouchableOpacity> : <Text style={styles.muted}>Payment methods are not configured. Please contact your school.</Text>) : null}
            {isStudent ? <Text style={styles.muted}>Payment options need an internet connection. A notification to school is a report, not proof that funds have cleared.</Text> : <Text style={styles.muted}>Staff view: payment records are read-only here.</Text>}
          </View>
          <Text style={styles.sectionTitle}>Payment history</Text>
          {rows.length===0 ? <Text style={styles.muted}>No payment records are available.</Text> : rows.map((payment:any)=><View key={payment.id} style={styles.card}><View style={styles.grow}><Text style={styles.cardTitle}>{payment.month} {payment.year}</Text><Text style={styles.muted}>{payment.createdAt?new Date(payment.createdAt).toLocaleDateString():""}{payment.notes?" · "+payment.notes:""}</Text></View><View style={{alignItems:"flex-end"}}><Text style={styles.cardTitle}>${Number(payment.amount||0).toFixed(2)}</Text><Text style={[styles.pill,{color:payment.status==="paid"?"#15803d":payment.status==="overdue"?"#b91c1c":"#a16207"}]}>{String(payment.status||"unknown").toUpperCase()}</Text></View></View>)}
        </View>}
        {section === "groups" && selectedChatGroup && <View style={[styles.card,{alignItems:"stretch",marginTop:10}]}><View style={styles.grow}><View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8}}><Text style={styles.sectionTitle}>{selectedChatGroup.name} · Chat</Text><TouchableOpacity onPress={()=>setSelectedChatGroup(null)} accessibilityRole="button" accessibilityLabel="Close group chat"><Feather name="x" size={20} color={colors.mutedForeground}/></TouchableOpacity></View><Text style={styles.muted}>Messages are visible to members of this group only.</Text>{canManageSelectedGroup && <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void loadGroupSettings()} disabled={groupSettingsBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{groupSettingsBusy?"Loading settings…":"Group settings"}</Text></TouchableOpacity>}{groupSettingsOpen && groupSettings && <View style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:10,marginTop:8}}><Text style={styles.cardTitle}>Group rules</Text><TextInput style={[styles.input,styles.textArea,{marginTop:8}]} multiline value={groupRules} onChangeText={setGroupRules} editable={!groupSettingsBusy} placeholder="Add group rules…" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={styles.button} onPress={()=>void saveGroupSettings({rules:groupRules})} disabled={groupSettingsBusy}><Text style={styles.buttonText}>Save rules</Text></TouchableOpacity>{([{key:"announcementsOnly",label:"Announcements only"},{key:"allowPolls",label:"Allow polls"},{key:"allowMedia",label:"Allow image/video media"}] as const).map(setting=><TouchableOpacity key={setting.key} style={[styles.button,styles.secondary,{flexDirection:"row",justifyContent:"space-between"}]} disabled={groupSettingsBusy} onPress={()=>void saveGroupSettings({[setting.key]:!groupSettings[setting.key]})}><Text style={[styles.buttonText,styles.secondaryText]}>{setting.label}</Text><Text style={{color:groupSettings[setting.key]?"#16a34a":"#dc2626",fontWeight:"700"}}>{groupSettings[setting.key]?"ON":"OFF"}</Text></TouchableOpacity>)}</View>}<TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void refreshGroupMessages(selectedChatGroup.id)} disabled={chatLoading}><Text style={[styles.buttonText,styles.secondaryText]}>{chatLoading?"Refreshing…":"Refresh messages"}</Text></TouchableOpacity>{chatError ? <Text style={{color:"#dc2626",marginTop:8}}>{chatError}</Text> : null}{chatLoading && chatMessages.length===0 ? <ActivityIndicator color={colors.primary} style={{margin:14}}/> : chatMessages.length===0 ? <Text style={styles.muted}>No messages yet. Start the conversation.</Text> : chatMessages.map(message=><View key={message.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={styles.cardTitle}>{message.senderName || "Group member"}</Text><Text style={styles.body}>{message.type==="media"?"Shared learning media":message.content}</Text>{message.type==="voice" && message.mediaUrl ? <AuthenticatedAudioMessage url={String(message.mediaUrl)}/> : message.type==="media" && message.mediaUrl ? <View style={{marginTop:8}}><AuthenticatedMediaPreview url={String(message.mediaUrl)} height={160} accessibilityLabel="Group message media"/><TouchableOpacity onPress={()=>openUrl(String(message.mediaUrl))}><Text style={{color:colors.primary,marginTop:5}}>Open attachment</Text></TouchableOpacity></View>:null}<Text style={styles.muted}>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</Text></View>)}<TextInput style={[styles.input,styles.textArea,{marginTop:12}]} multiline value={chatDraft} onChangeText={value=>{setChatDraft(value);if(user?.id&&selectedChatGroup?.id)void AsyncStorage.setItem("dallyletter_group_draft_"+user.id+"_"+selectedChatGroup.id,value).catch(()=>undefined);}} placeholder="Write a group message…" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadGroupMessageMedia()} disabled={chatMediaBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{chatMediaBusy?"Uploading media…":"Attach image/video"}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.button,styles.secondary]} onPress={()=>void uploadGroupMessageMedia(true)} disabled={chatMediaBusy}><Text style={[styles.buttonText,styles.secondaryText]}>{chatMediaBusy?"Uploading media…":"Attach PDF/Word document"}</Text></TouchableOpacity>
            <VoiceMessageComposer disabled={chatSending||chatMediaBusy} onSend={sendGroupVoiceMessage}/><TouchableOpacity style={styles.button} onPress={()=>void sendGroupMessage()} disabled={chatSending||!chatDraft.trim()}><Text style={styles.buttonText}>{chatSending?"Sending…":"Send message"}</Text></TouchableOpacity></View></View>}
        {!loading && !error && section === "assignments" && rows.length === 0 && <Text style={styles.muted}>No assignments are available yet.</Text>}
        {!loading && !error && section === "exercises" && rows.length === 0 && <Text style={styles.muted}>No exercises are available yet.</Text>}
        {!loading && !error && section === "polls" && rows.length === 0 && <Text style={styles.muted}>No polls are available yet.</Text>}
        {section === "groups" && Array.isArray(groups) && groups.length === 0 && <Text style={styles.muted}>No study groups are available yet.</Text>}
      </ScrollView>}
    </View>
  );
}
