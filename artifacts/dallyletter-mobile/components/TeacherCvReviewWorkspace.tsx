import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import QualificationReviewWorkspaceMobile from "@/components/QualificationReviewWorkspaceMobile";

type Row = Record<string, any> & { id?: number };
export default function TeacherCvReviewWorkspace({initialTab="applications"}:{initialTab?:"applications"|"qualifications"}) {
  const colors = useColors();
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<"applications"|"qualifications">(initialTab);
  const [queue, setQueue] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [qualificationHistory, setQualificationHistory] = useState<Record<number, Row[]>>({});
  const [chat, setChat] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewDays, setReviewDays] = useState("");
  const [canEditConfig, setCanEditConfig] = useState(false);
  const [managerGrants, setManagerGrants] = useState<Record<string, boolean>>({});
  const normalizedRole = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const isOwner = ["owner", "platform_owner"].includes(normalizedRole);
  const canReview = isOwner || managerGrants["teacher_cv.review"] === true;
  const canAuthorize = isOwner || managerGrants["teacher_cv.authorize"] === true;
  const canChat = isOwner || managerGrants["teacher_cv.chat"] === true;
  const canViewQualificationDocuments = isOwner || normalizedRole === "admin" || managerGrants["qualifications.view"] === true;
  const canViewQualificationHistory = isOwner || managerGrants["qualifications.view"] === true;
  const canVerifyQualifications = isOwner || managerGrants["qualifications.verify"] === true;

  const api = useCallback(async (path: string, method = "GET", body?: any) => {
    const response = await fetch(getApiUrl("/api/teacher-cv-workspace" + path), {
      method,
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed (" + response.status + ")");
    return payload;
  }, [token]);

  const canViewApplications = isOwner || normalizedRole === "admin" || managerGrants["teacher_cv.view"] === true;
  const canViewQualifications = isOwner || managerGrants["qualifications.view"] === true;

  useEffect(() => {
    if (activeTab === "applications" && !canViewApplications && canViewQualifications) setActiveTab("qualifications");
    else if (activeTab === "qualifications" && !canViewQualifications && canViewApplications) setActiveTab("applications");
  }, [activeTab, canViewApplications, canViewQualifications]);

  const loadQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const permissionResponse = await fetch(getApiUrl("/api/manager-permissions/me"), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      const permissionData = await permissionResponse.json().catch(() => ({}));
      if (!permissionResponse.ok) throw new Error(permissionData.error || "Could not load staff verification permissions.");
      const grants = permissionData.permissions || {};
      setManagerGrants(grants);
      const viewApplications = isOwner || normalizedRole === "admin" || grants["teacher_cv.view"] === true;
      if (!viewApplications) {
        setQueue([]); setSelectedId(null); setDetail(null); setHistory([]); setChat([]); setCanEditConfig(false);
        return;
      }
      const [result, config] = await Promise.all([api("/queue"), api("/config").catch(() => null)]);
      const rows = Array.isArray(result?.applications) ? result.applications : [];
      setQueue(rows);
      if (config) { setReviewDays(config.reviewDurationDays == null ? "" : String(config.reviewDurationDays)); setCanEditConfig(config.canEdit === true); }
      if (selectedId && !rows.some((row: Row) => Number(row.id) === selectedId)) {
        setSelectedId(null); setDetail(null); setHistory([]); setChat([]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "The review queue could not be loaded."); }
    finally { setLoading(false); }
  }, [api, token, selectedId, isOwner, normalizedRole]);

  const openApplication = async (id: number) => {
    setBusy(true); setError("");
    try {
      const [d, h, messages] = await Promise.all([
        api("/" + id + "/details"),
        api("/" + id + "/history"),
        canChat ? api("/" + id + "/chat") : Promise.resolve([]),
      ]);
      setSelectedId(id); setDetail(d); setHistory(Array.isArray(h?.history) ? h.history : []);
      setChat(Array.isArray(messages) ? messages : Array.isArray(messages?.messages) ? messages.messages : []);
      setNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "Application details could not be opened."); }
    finally { setBusy(false); }
  };

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  useEffect(() => {
    if (!selectedId || !canChat) { if (!canChat) setChat([]); return; }
    let active = true;
    void api("/" + selectedId + "/chat")
      .then(messages => { if (active) setChat(Array.isArray(messages) ? messages : Array.isArray(messages?.messages) ? messages.messages : []); })
      .catch(() => { /* Keep the last successfully loaded conversation if chat access is temporarily unavailable. */ });
    return () => { active = false; };
  }, [api, selectedId, canChat]);

  const decide = async (action: "approve" | "reject") => {
    if (!selectedId) return;
    if (action === "reject" && note.trim().length < 3) { Alert.alert("Reason required", "Enter a clear rejection reason (at least 3 characters)."); return; }
    setBusy(true); setError("");
    try {
      await api("/" + selectedId + "/decision", "POST", { action, note: note.trim() });
      Alert.alert(action === "approve" ? "Teacher authorized" : "Application rejected", action === "approve" ? "Teaching access has been activated." : "The teacher can still log in; teaching access is disabled and learner conversion is scheduled.");
      setDetail(null); setSelectedId(null); await loadQueue();
    } catch (e) { setError(e instanceof Error ? e.message : "The decision could not be saved."); }
    finally { setBusy(false); }
  };

  const decideSurvey = async (action: "approve" | "reject") => {
    if (!selectedId) return;
    if (action === "reject" && note.trim().length < 3) { Alert.alert("Reason required", "Enter a clear survey review reason."); return; }
    setBusy(true); setError("");
    try {
      await api("/" + selectedId + "/survey/decision", "POST", { action, note: note.trim() });
      Alert.alert("Survey decision saved", "The independent survey decision has been recorded and the applicant notified.");
      await openApplication(selectedId); await loadQueue();
    } catch (e) { setError(e instanceof Error ? e.message : "Survey decision could not be saved."); }
    finally { setBusy(false); }
  };

  const sendMessage = async () => {
    if (!selectedId || !draft.trim() || busy) return;
    setBusy(true);
    try {
      await api("/" + selectedId + "/chat", "POST", { body: draft.trim() });
      setDraft("");
      const messages = await api("/" + selectedId + "/chat");
      setChat(Array.isArray(messages) ? messages : messages.messages || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setBusy(false); }
  };

  const saveConfig = async () => {
    const days = Number(reviewDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) { Alert.alert("Invalid duration", "Choose a whole number from 1 to 365 days."); return; }
    setBusy(true);
    try { await api("/config", "PATCH", { reviewDurationDays: days }); Alert.alert("Review duration saved", "The configured review window has been updated."); }
    catch (e) { setError(e instanceof Error ? e.message : "Review duration could not be saved."); }
    finally { setBusy(false); }
  };

  const openCvPdf = async () => {
    if (!selectedId || !token) return;
    setBusy(true); setError("");
    try {
      const destination = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "dallyletter-teacher-cv-" + selectedId + ".pdf";
      const result = await FileSystem.downloadAsync(getApiUrl("/api/users/" + selectedId + "/teacher-cv/pdf"), destination, { headers: { Authorization: "Bearer " + token } });
      if (result.status < 200 || result.status >= 300) throw new Error("The submitted CV PDF could not be generated or downloaded.");
      await Linking.openURL(result.uri);
    } catch (e) { setError(e instanceof Error ? e.message : "The professional CV PDF could not be opened."); }
    finally { setBusy(false); }
  };

  const openDocument = async (document: Row) => {
    if (!selectedId || !token || !document?.id) return;
    try {
      const destination = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "dallyletter-teacher-document-" + document.id;
      const result = await FileSystem.downloadAsync(getApiUrl("/api/users/" + selectedId + "/teacher-documents/" + document.id), destination, { headers: { Authorization: "Bearer " + token } });
      if (result.status < 200 || result.status >= 300) throw new Error("The protected document could not be downloaded.");
      await Linking.openURL(result.uri);
    } catch (e) { Alert.alert("Document unavailable", e instanceof Error ? e.message : "Please retry."); }
  };

  const qualificationRequest = async (path: string, method = "GET", body?: any) => {
    const response = await fetch(getApiUrl(path), { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Qualification request failed (" + response.status + ")");
    return payload;
  };
  const openQualificationDocument = async (qualification: Row) => {
    if (!token || !selectedId || !qualification.document_id || !canViewQualificationDocuments) return;
    try {
      const mime = String(qualification.document_mime_type || "application/pdf");
      const extension = mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : ".pdf";
      const destination = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "dallyletter-qualification-" + qualification.document_id + extension;
      const result = await FileSystem.downloadAsync(getApiUrl("/api/users/" + selectedId + "/teacher-documents/" + qualification.document_id), destination, { headers: { Authorization: "Bearer " + token } });
      if (result.status < 200 || result.status >= 300) throw new Error("The protected qualification document could not be downloaded.");
      await Linking.openURL(result.uri);
    } catch (e) { Alert.alert("Certificate unavailable", e instanceof Error ? e.message : "Please retry."); }
  };
  const loadQualificationHistory = async (qualificationId: number) => {
    if (!canViewQualificationHistory) return;
    try {
      const result = await qualificationRequest("/api/qualifications/" + qualificationId + "/review-history");
      setQualificationHistory(current => ({ ...current, [qualificationId]: Array.isArray(result.history) ? result.history : [] }));
    } catch (e) { Alert.alert("Review history unavailable", e instanceof Error ? e.message : "Please retry."); }
  };
  const verifyQualification = async (qualification: Row, status: "verified" | "rejected") => {
    if (!canVerifyQualifications) return;
    const reviewNote = note.trim();
    if (status === "rejected" && reviewNote.length < 3) { Alert.alert("Reason required", "Enter a qualification rejection reason of at least 3 characters in the reviewer note field."); return; }
    setBusy(true); setError("");
    try {
      await qualificationRequest("/api/qualifications/" + qualification.id + "/verify", "PATCH", { status, reviewNote });
      Alert.alert(status === "verified" ? "Qualification verified" : "Qualification rejected", "The verification decision and history have been saved.");
      await openApplication(Number(selectedId));
      await loadQualificationHistory(Number(qualification.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Qualification decision could not be saved."); }
    finally { setBusy(false); }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 10 };
  const heading = { color: colors.foreground, fontSize: 16, fontWeight: "800" as const };
  const body = { color: colors.foreground, fontSize: 13, lineHeight: 19 };
  const muted = { color: colors.mutedForeground, fontSize: 12, lineHeight: 17 };
  const button = { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" as const };
  const buttonText = { color: "#fff", fontWeight: "800" as const, fontSize: 13 };
  const cv = detail?.cv && typeof detail.cv === "object" ? detail.cv : {};
  const survey = (() => { try { return typeof cv.surveyAnswers === "string" ? JSON.parse(cv.surveyAnswers) : cv.surveyAnswers || {}; } catch { return {}; } })();
  const personal = (() => { try { return typeof cv.personalDetails === "string" ? JSON.parse(cv.personalDetails) : cv.personalDetails || {}; } catch { return {}; } })();

  if (!user || !token) return <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}><Text style={body}>Sign in to access the teacher review workspace.</Text></View>;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ backgroundColor: colors.primary, padding: 16, paddingTop: 24 }}>
      <Text style={{ color: "#fff", fontSize: 21, fontWeight: "900" }}>Teacher CV & Survey Review</Text>
      <Text style={{ color: "#dbeafe", fontSize: 12, marginTop: 5 }}>Review submitted evidence, record decisions, inspect history and message applicants.</Text>
    </View>
    {(canViewApplications || canViewQualifications) ? <View style={{ flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.background }}>{canViewApplications ? <TouchableOpacity onPress={() => setActiveTab("applications")} style={[button, { flex: 1, backgroundColor: activeTab === "applications" ? colors.primary : colors.card, borderWidth: activeTab === "applications" ? 0 : 1, borderColor: colors.border }]}><Text style={[buttonText, activeTab === "applications" ? {} : { color: colors.foreground }]}>CV applications & surveys</Text></TouchableOpacity> : null}{canViewQualifications ? <TouchableOpacity onPress={() => setActiveTab("qualifications")} style={[button, { flex: 1, backgroundColor: activeTab === "qualifications" ? colors.primary : colors.card, borderWidth: activeTab === "qualifications" ? 0 : 1, borderColor: colors.border }]}><Text style={[buttonText, activeTab === "qualifications" ? {} : { color: colors.foreground }]}>Qualifications & certificates</Text></TouchableOpacity> : null}</View> : null}
    {activeTab === "qualifications" && canViewQualifications ? <QualificationReviewWorkspaceMobile /> : activeTab === "applications" && canViewApplications ? <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }}> : <View style={{padding:20}}><Text style={{color:colors.mutedForeground}}>The Owner has not granted access to staff verification.</Text></View>}
      {error ? <View style={[card, { borderColor: "#dc2626" }]}><Text style={{ color: "#dc2626" }}>{error}</Text><TouchableOpacity onPress={() => void loadQueue()}><Text style={{ color: colors.primary, fontWeight: "800", marginTop: 8 }}>Retry</Text></TouchableOpacity></View> : null}
      {canEditConfig ? <View style={card}>
        <Text style={heading}>Owner review configuration</Text>
        <Text style={muted}>Review duration applies to the teacher application decision window (1–365 days).</Text>
        <TextInput value={reviewDays} onChangeText={setReviewDays} keyboardType="number-pad" placeholder="Review duration in days" placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 }} />
        <TouchableOpacity disabled={busy} onPress={() => void saveConfig()} style={[button, { marginTop: 8 }]}><Text style={buttonText}>Save review duration</Text></TouchableOpacity>
      </View> : null}
      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={heading}>Pending review ({queue.length})</Text>
          <TouchableOpacity onPress={() => void loadQueue()}><Feather name="refresh-cw" size={18} color={colors.primary} /></TouchableOpacity>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : queue.length ? queue.map((item: Row) => <TouchableOpacity key={String(item.id)} onPress={() => void openApplication(Number(item.id))} style={{ paddingVertical: 11, borderTopWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>{item.name || "Teacher applicant"}</Text>
          <Text style={muted}>{item.email || "No email"} · {item.status || "pending_review"}</Text>
          <Text style={muted}>CV: {item.has_cv_submission ? "submitted" : "not submitted"} · Survey: {item.survey_review_status || "not submitted"} · Documents: {item.document_count ?? 0}</Text>
          {item.overdue ? <Text style={{ color: "#dc2626", fontWeight: "800", fontSize: 11 }}>Review overdue</Text> : null}
        </TouchableOpacity>) : <Text style={muted}>No applications or pending survey reviews are assigned to this account.</Text>}
      </View>
      {detail && selectedId ? <View style={card}>
        <Text style={heading}>{detail.teacher?.name || "Teacher applicant"} · Full application</Text>
        <Text style={muted}>Applicant ID: {detail.teacher?.id ?? selectedId}</Text>
        <Text style={muted}>{detail.teacher?.email || ""} · Application status: {detail.teacher?.teacher_application_status || "pending_review"}</Text>
        <Text style={{ ...heading, marginTop: 12 }}>Personal / legal details</Text>
        {Object.entries(personal).map(([key, value]) => <Text key={key} style={body}>{key}: {String(value ?? "—")}</Text>)}
        <Text style={{ ...heading, marginTop: 12 }}>CV evidence</Text>
        {queue.some(row => Number(row.id) === Number(selectedId) && row.has_cv_submission) ? <TouchableOpacity disabled={busy} onPress={() => void openCvPdf()} style={[button, { marginTop: 8 }]}><Text style={buttonText}>Download professional CV PDF</Text></TouchableOpacity> : null}
        {["professionalSummary","education","experience","subjects","address","certifications","languages","references"].map(key => <View key={key} style={{ marginTop: 7 }}><Text style={{ color: colors.foreground, fontWeight: "800", textTransform: "capitalize" }}>{key.replace(/[A-Z]/g, letter => " " + letter)}</Text><Text style={body}>{String(cv[key] || "Not supplied")}</Text></View>)}
        <Text style={{ ...heading, marginTop: 12 }}>Uploaded documents</Text>
        {(detail.documents || []).map((doc: Row) => <TouchableOpacity key={String(doc.id)} onPress={() => void openDocument(doc)} style={{ paddingVertical: 9, borderTopWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="file-text" size={18} color={colors.primary} /><View style={{ flex: 1 }}><Text style={body}>{doc.original_filename || doc.file_name || ("Document #" + doc.id)}</Text><Text style={muted}>{doc.document_type || doc.mime_type || "Document"}</Text></View><Text style={{ color: colors.primary, fontWeight: "800" }}>Open</Text>
        </TouchableOpacity>)}
        <Text style={{ ...heading, marginTop: 12 }}>Qualifications & verification</Text>
        {(detail.qualifications || []).map((q: Row) => <View key={String(q.id)} style={{ paddingVertical: 9, borderTopWidth: 1, borderColor: colors.border }}>
          <Text style={body}>{q.title || "Qualification"}</Text>
          <Text style={muted}>{q.institution || "Institution not supplied"} · {q.year || "Year not supplied"} · {q.verification_status || "pending"} · {q.document_id ? (q.document_file_name || "Certificate attached") : "Certificate missing"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
            {q.document_id && canViewQualificationDocuments ? <TouchableOpacity onPress={() => void openQualificationDocument(q)} style={[button, { paddingVertical: 7 }]}><Text style={buttonText}>Open certificate</Text></TouchableOpacity> : null}
            {canViewQualificationHistory ? <TouchableOpacity onPress={() => void loadQualificationHistory(Number(q.id))} style={[button, { paddingVertical: 7, backgroundColor: colors.secondary }]}><Text style={{ ...buttonText, color: colors.foreground }}>Review history</Text></TouchableOpacity> : null}
          </View>
          {(qualificationHistory[Number(q.id)] || []).map((entry: Row) => <View key={String(entry.id)} style={{ marginTop: 6, padding: 8, backgroundColor: colors.background, borderRadius: 7 }}><Text style={muted}>{entry.reviewer_name || "Reviewer"} · {entry.previous_status} → {entry.new_status} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}</Text>{entry.review_note ? <Text style={body}>{entry.review_note}</Text> : null}</View>)}
          {q.verification_status === "pending" && canVerifyQualifications ? <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TouchableOpacity disabled={busy} onPress={() => void verifyQualification(q, "verified")} style={[button, { flex: 1, backgroundColor: "#15803d" }]}><Text style={buttonText}>Verify qualification</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => void verifyQualification(q, "rejected")} style={[button, { flex: 1, backgroundColor: "#b91c1c" }]}><Text style={buttonText}>Reject qualification</Text></TouchableOpacity>
          </View> : null}
          {!canVerifyQualifications ? <Text style={muted}>Qualification verification requires the Owner or an individually authorized Senior Manager.</Text> : null}
        </View>)}
        <Text style={{ ...heading, marginTop: 12 }}>Readiness survey</Text>
        <Text style={muted}>Submitted: {cv.surveySubmittedAt ? String(cv.surveySubmittedAt) : "Not submitted"} · Review: {cv.surveyReviewStatus || "pending"}</Text>
        {Object.entries(survey).map(([key, value]) => <Text key={key} style={body}>{key}: {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}</Text>)}
        {cv.surveyReviewNote ? <Text style={muted}>Survey reviewer note: {String(cv.surveyReviewNote)}</Text> : null}
        <Text style={{ ...heading, marginTop: 12 }}>Review history</Text>
        {history.map((item: Row, index: number) => <View key={String(item.id || index)} style={{ paddingVertical: 7, borderTopWidth: 1, borderColor: colors.border }}><Text style={body}>{item.action} · {item.new_status}</Text><Text style={muted}>{item.reviewer_name || "System"} · {item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text>{item.note ? <Text style={muted}>{item.note}</Text> : null}</View>)}
        <TextInput value={note} onChangeText={setNote} multiline placeholder="Reviewer note / reason (required for rejection)" placeholderTextColor={colors.mutedForeground} style={{ minHeight: 76, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 12 }} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {canAuthorize ? <TouchableOpacity disabled={busy} onPress={() => void decide("approve")} style={[button, { flex: 1, backgroundColor: "#15803d" }]}><Text style={buttonText}>Approve CV</Text></TouchableOpacity> : null}
          {canReview ? <TouchableOpacity disabled={busy} onPress={() => void decide("reject")} style={[button, { flex: 1, backgroundColor: "#b91c1c" }]}><Text style={buttonText}>Reject CV</Text></TouchableOpacity> : null}
        </View>
        {cv.surveySubmittedAt && cv.surveyReviewStatus === "pending" && canReview ? <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TouchableOpacity disabled={busy} onPress={() => void decideSurvey("approve")} style={[button, { flex: 1 }]}><Text style={buttonText}>Approve survey</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => void decideSurvey("reject")} style={[button, { flex: 1, backgroundColor: "#b91c1c" }]}><Text style={buttonText}>Reject survey</Text></TouchableOpacity>
        </View> : null}
        {canChat ? <><Text style={{ ...heading, marginTop: 14 }}>Private applicant conversation</Text>
        {chat.map((message: Row) => <View key={String(message.id)} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}><Text style={body}>{message.sender_name || "Participant"}: {message.body}</Text><Text style={muted}>{message.created_at ? new Date(message.created_at).toLocaleString() : ""}</Text></View>)}
        <TextInput value={draft} onChangeText={setDraft} multiline placeholder="Message the applicant…" placeholderTextColor={colors.mutedForeground} style={{ minHeight: 62, textAlignVertical: "top", color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 }} />
        <TouchableOpacity disabled={busy || !draft.trim()} onPress={() => void sendMessage()} style={[button, { marginTop: 8 }]}><Text style={buttonText}>Send message</Text></TouchableOpacity></> : null}
        <TouchableOpacity onPress={() => { setDetail(null); setSelectedId(null); setHistory([]); setChat([]); }} style={{ padding: 12, alignItems: "center" }}><Text style={{ color: colors.primary, fontWeight: "800" }}>Close application</Text></TouchableOpacity>
      </View> : null}
    </ScrollView>}
  </View>;
}
