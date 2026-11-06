import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { ActivityIndicator, Alert, Linking, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type TeacherCv = {
  professionalSummary: string;
  education: string;
  experience: string;
  subjects: string;
  address: string;
  certifications: string;
  languages: string;
  references: string;
  personalDetails: string;
  photoDocumentId: string;
};

const emptyCv: TeacherCv = {
  professionalSummary: "", education: "", experience: "", subjects: "",
  address: "", certifications: "", languages: "", references: "", personalDetails: "{}", photoDocumentId: "",
};

const fields: Array<{ key: keyof TeacherCv; label: string; placeholder: string }> = [
  { key: "professionalSummary", label: "Professional summary", placeholder: "Introduce your teaching background and strengths" },
  { key: "education", label: "Education", placeholder: "Schools, qualifications, years completed" },
  { key: "experience", label: "Teaching experience", placeholder: "Roles, schools, responsibilities and dates" },
  { key: "subjects", label: "Subjects and grades", placeholder: "Subjects and grade levels you can teach" },
  { key: "address", label: "Professional location", placeholder: "Town/city and country (no private home address needed)" },
  { key: "certifications", label: "Certifications", placeholder: "Teaching licence and relevant certificates" },
  { key: "languages", label: "Languages", placeholder: "Languages you can teach or communicate in" },
  { key: "references", label: "References", placeholder: "Professional referees and contact details (with their consent)" },
];

export function TeacherCvEditor() {
  const { user, token } = useAuth();
  const colors = useColors();
  const [cv, setCv] = useState<TeacherCv>(emptyCv);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [personal, setPersonal] = useState({ idNumber: "", dob: "", phone: "", email: "" });
  const [applicationStatus, setApplicationStatus] = useState(String((user as any)?.teacherApplicationStatus || "draft"));
  const [reviewDeadline, setReviewDeadline] = useState<string | null>((user as any)?.teacherReviewDeadline || null);
  const [reviewHistory, setReviewHistory] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [surveySaving, setSurveySaving] = useState(false);
  const [surveySubmittedAt, setSurveySubmittedAt] = useState<string | null>(null);
  const [survey, setSurvey] = useState({ laptop: "", laptopType: "", smartphone: "", computer: "", online: "", internet: "", platforms: "", power: "", verificationCall: "", extra: "" });

  useEffect(() => {
    let active = true;
    if (!user || !token || user.role !== "teacher") return;
    const headers = { Authorization: "Bearer " + token };
    const load = async () => {
      setLoading(true);
      try {
        const [cvResponse, meResponse, historyResponse, chatResponse] = await Promise.all([
          fetch(getApiUrl("/api/users/me/teacher-cv"), { headers }),
          fetch(getApiUrl("/api/auth/me"), { headers }),
          fetch(getApiUrl("/api/teacher-cv-workspace/" + user.id + "/history"), { headers }),
          fetch(getApiUrl("/api/teacher-cv-workspace/" + user.id + "/chat"), { headers }),
        ]);
        if (!cvResponse.ok) throw new Error("Could not load your CV.");
        const data = await cvResponse.json();
        const nextCv = { ...emptyCv, ...(data.cv ?? {}) };
        let savedPersonal: any = {};
        let savedSurvey: any = {};
        try { savedPersonal = typeof nextCv.personalDetails === "string" ? JSON.parse(nextCv.personalDetails) : nextCv.personalDetails || {}; } catch {}
        try { savedSurvey = typeof nextCv.surveyAnswers === "string" ? JSON.parse(nextCv.surveyAnswers) : nextCv.surveyAnswers || {}; } catch {}
        if (!active) return;
        setCv(nextCv);
        setSurveySubmittedAt(nextCv.surveySubmittedAt ? String(nextCv.surveySubmittedAt) : null);
        setPersonal({
          idNumber: String(savedPersonal.idNumber || ""),
          dob: String(savedPersonal.dob || ""),
          phone: String(savedPersonal.phone || user.phone || ""),
          email: String(savedPersonal.email || user.email || ""),
        });
        setSurvey({
          laptop: String(savedSurvey.laptop || ""),
          laptopType: String(savedSurvey.laptopType || ""),
          smartphone: String(savedSurvey.smartphone || ""),
          computer: String(savedSurvey.computer || ""),
          online: String(savedSurvey.online || ""),
          internet: String(savedSurvey.internet || ""),
          platforms: Array.isArray(savedSurvey.platforms) ? savedSurvey.platforms.join(", ") : String(savedSurvey.platforms || ""),
          power: String(savedSurvey.power || ""),
          verificationCall: String(savedSurvey.verificationCall || ""),
          extra: String(savedSurvey.extra || ""),
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          if (active) { setApplicationStatus(String(me.teacherApplicationStatus || me.user?.teacherApplicationStatus || "draft")); setReviewDeadline(me.teacherReviewDeadline || me.user?.teacherReviewDeadline || null); }
        }
        if (historyResponse.ok) { const h = await historyResponse.json(); if (active) setReviewHistory(Array.isArray(h.history) ? h.history : []); }
        if (chatResponse.ok) { const c = await chatResponse.json(); if (active) setChatMessages(Array.isArray(c) ? c : c.messages || []); }
      } catch {
        if (active) Alert.alert("Teacher CV", "Your CV could not be loaded. Please retry when online.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [user?.id, token]);

  const save = async (showSuccess = true): Promise<boolean> => {
    if (!token || saving) return false;
    setSaving(true);
    try {
      const cvToSave = {
        ...cv,
        personalDetails: JSON.stringify({
          fullName: user?.name || "",
          idNumber: personal.idNumber.trim(),
          dob: personal.dob.trim(),
          phone: personal.phone.trim() || user?.phone || "",
          email: personal.email.trim() || user?.email || "",
          address: cv.address.trim(),
        }),
      };
      const response = await fetch(getApiUrl("/api/users/me/teacher-cv"), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvToSave }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your CV.");
      setCv({ ...emptyCv, ...(data.cv ?? cvToSave) });
      if (showSuccess) Alert.alert("CV saved", "Your draft is saved. Add your photo, PDF resume and qualification certificates in Profile Hub before submitting.");
      return true;
    } catch (error) {
      Alert.alert("Could not save CV", error instanceof Error ? error.message : "Please retry.");
      return false;
    } finally { setSaving(false); }
  };

  const saveSurvey = async (): Promise<boolean> => {
    if (!token || surveySaving) return false;
    setSurveySaving(true);
    try {
      const surveyAnswers = { ...survey, platforms: survey.platforms.split(",").map(value => value.trim()).filter(Boolean) };
      const response = await fetch(getApiUrl("/api/users/me/teacher-cv"), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cv: { ...cv, surveyAnswers: JSON.stringify(surveyAnswers) } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Readiness survey could not be saved.");
      setCv({ ...emptyCv, ...(data.cv ?? { ...cv, surveyAnswers: JSON.stringify(surveyAnswers) }) });
      Alert.alert("Readiness survey saved", "Your survey answers are saved independently. Completing the survey is optional for CV submission.");
      return true;
    } catch (error) { Alert.alert("Survey not saved", error instanceof Error ? error.message : "Please retry."); return false; }
    finally { setSurveySaving(false); }
  };

  const submitSurvey = async () => {
    if (!token || surveySubmittedAt) return;
    const saved = await saveSurvey();
    if (!saved) return;
    setSurveySaving(true);
    try {
      const response = await fetch(getApiUrl("/api/teacher-cv-workspace/survey/submit"), { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data.error || "Survey could not be submitted.") + (Array.isArray(data.missingFields) ? " Missing: " + data.missingFields.join(", ") : ""));
      setSurveySubmittedAt(String(data.submittedAt || new Date().toISOString()));
      setCv(previous => ({ ...previous, surveySubmittedAt: data.submittedAt } as TeacherCv));
      Alert.alert("Readiness survey submitted", "Your survey has been submitted independently. Your CV application remains in its current status.");
    } catch (error) { Alert.alert("Survey not submitted", error instanceof Error ? error.message : "Please retry."); }
    finally { setSurveySaving(false); }
  };

  const submitApplication = async () => {
    if (!token || submitting) return;
    const saved = await save(false);
    if (!saved) return;
    setSubmitting(true);
    try {
      const response = await fetch(getApiUrl("/api/teacher-cv-workspace/submit"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const missing = Array.isArray(data.missingFields) ? data.missingFields : [];
        if (data.photoUploaded === false) missing.push("profile photograph");
        if (data.resumeUploaded === false) missing.push("PDF resume");
        if (Number(data.certificatesMissing) > 0) missing.push(Number(data.certificatesMissing) + " qualification certificate(s)");
        throw new Error((data.error || "Your application could not be submitted.") + (missing.length ? " Missing or incomplete: " + missing.join(", ") + "." : ""));
      }
      setApplicationStatus("pending_review");
      const historyResponse = await fetch(getApiUrl("/api/teacher-cv-workspace/" + user?.id + "/history"), { headers: { Authorization: "Bearer " + token } });
      if (historyResponse.ok) { const h = await historyResponse.json(); setReviewHistory(Array.isArray(h.history) ? h.history : []); }
      Alert.alert("Application submitted", "Your CV has been saved and sent to the Owner's review queue.");
    } catch (error) {
      Alert.alert("Application not submitted", error instanceof Error ? error.message : "Please retry.");
    } finally { setSubmitting(false); }
  };

  const sendReviewMessage = async () => {
    if (!token || !user?.id || !chatDraft.trim() || chatSending) return;
    setChatSending(true);
    try {
      const response = await fetch(getApiUrl("/api/teacher-cv-workspace/" + user.id + "/chat"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ body: chatDraft.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      setChatMessages(previous => [...previous, data.message || data]);
      setChatDraft("");
    } catch (error) { Alert.alert("Message not sent", error instanceof Error ? error.message : "Please retry."); }
    finally { setChatSending(false); }
  };

  const downloadPdf = async () => {
    if (!token || downloading) return;
    setDownloading(true);
    try {
      const target = (FileSystem.documentDirectory || FileSystem.cacheDirectory || "") + "dallyletter-teacher-cv.pdf";
      const result = await FileSystem.downloadAsync(getApiUrl("/api/users/me/teacher-cv/pdf"), target, { headers: { Authorization: "Bearer " + token } });
      if (result.status !== 200) {
        const body = await FileSystem.readAsStringAsync(result.uri).catch(() => "");
        let message = "Could not download your CV PDF.";
        try { message = JSON.parse(body).error || message; } catch {}
        throw new Error(message);
      }
      const openUri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(result.uri) : result.uri;
      await Linking.openURL(openUri);
      Alert.alert("CV PDF ready", "Verified qualifications are clearly identified. Other CV details are labelled teacher-provided.");
    } catch (error) {
      Alert.alert("CV download failed", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setDownloading(false);
    }
  };

  if (user?.role !== "teacher") return null;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 18, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Teacher CV & professional profile</Text>
      <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }}>Complete the required sections, then upload your resume and certificates. Only the owner can approve your teaching access.</Text>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", marginTop: 8, marginBottom: 6 }}>Legal and contact details</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>Your legal name comes from your account profile. Complete the remaining details before formal submission.</Text>
      {([
        ["idNumber", "National ID / passport number", "Enter your ID or passport number"],
        ["dob", "Date of birth", "YYYY-MM-DD"],
        ["phone", "Contact phone", "+263…"],
        ["email", "Contact email", "you@example.com"],
      ] as const).map(([key, label, placeholder]) => (
        <View key={key} style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", marginBottom: 5 }}>{label}</Text>
          <TextInput testID={"teacher-cv-personal-" + key} accessibilityLabel={label} blurOnSubmit={false} value={personal[key]} onChangeText={value => setPersonal(previous => ({ ...previous, [key]: value }))} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoCapitalize={key === "email" ? "none" : "sentences"} keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, backgroundColor: colors.background }} />
        </View>
      ))}
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>Profile photo: {cv.photoDocumentId ? "uploaded" : "not linked yet — upload an image under Profile Hub → Qualifications → CV"}</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : fields.map(field => (
        <View key={field.key} style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", marginBottom: 5 }}>{field.label}</Text>
          <TextInput
            testID={"teacher-cv-" + field.key}
            accessibilityLabel={field.label}
            blurOnSubmit={false}
            value={cv[field.key]}
            onChangeText={value => setCv(previous => ({ ...previous, [field.key]: value }))}
            placeholder={field.placeholder}
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            style={{ minHeight: field.key === "professionalSummary" || field.key === "experience" ? 92 : 64, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, backgroundColor: colors.background }}
          />
        </View>
      ))}
      <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginBottom: 4 }}>Readiness survey (optional)</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 10 }}>Save these answers independently. You can leave questions blank and still save your CV draft.</Text>
        {([
          ["laptop", "Laptop access", "Yes / No"],
          ["laptopType", "Laptop type / specification", "Optional device details"],
          ["smartphone", "Smartphone access", "Yes / No and device type"],
          ["computer", "Computer skills", "Beginner / Intermediate / Advanced"],
          ["online", "Online teaching availability", "Days and times available"],
          ["internet", "Internet access", "Wi-Fi / mobile data / other"],
          ["platforms", "Communication platforms", "Separate platforms with commas"],
          ["power", "Reliable electricity", "Yes / No / Sometimes"],
          ["verificationCall", "Verification call availability", "Preferred times"],
          ["extra", "Additional information", "Anything else the reviewer should know"],
        ] as const).map(([key, label, placeholder]) => (
          <View key={key} style={{ marginBottom: 9 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
            <TextInput testID={"teacher-cv-survey-" + key} accessibilityLabel={label} blurOnSubmit={false} value={survey[key]} onChangeText={value => setSurvey(previous => ({ ...previous, [key]: value }))} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={{ minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 9, color: colors.foreground, backgroundColor: colors.background }} />
          </View>
        ))}
        <TouchableOpacity disabled={surveySaving || loading} onPress={() => void saveSurvey()} style={{ backgroundColor: colors.secondary, borderRadius: 9, padding: 11, alignItems: "center", opacity: surveySaving || loading ? 0.65 : 1 }}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>{surveySaving ? "Saving survey…" : "Save readiness survey separately"}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity disabled={saving || loading} onPress={save} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: saving || loading ? 0.65 : 1 }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={16} color="#fff" />}
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Saving…" : "Save teacher CV"}</Text>
      </TouchableOpacity>
      <TouchableOpacity disabled={saving || loading || submitting || !["draft","not_applicable"].includes(applicationStatus)} onPress={() => void submitApplication()} style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 10, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: saving || loading || submitting || !["draft","not_applicable"].includes(applicationStatus) ? 0.65 : 1 }}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
        <Text style={{ color: "#fff", fontWeight: "700" }}>{submitting ? "Submitting…" : applicationStatus === "pending_review" ? "Application submitted" : "Submit CV for review"}</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>Application status: {applicationStatus.replace(/_/g, " ")}{reviewDeadline ? " · Review deadline: " + new Date(reviewDeadline).toLocaleDateString() : ""}</Text>
      {!!reviewHistory.length && <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 6 }}>Application review history</Text>
        {reviewHistory.slice(0, 5).map((item, index) => <View key={String(item.id || item.created_at || index)} style={{ marginBottom: 7 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{String(item.action || "update").replace(/_/g, " ")} · {item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text>
          {!!item.note && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.note}</Text>}
        </View>)}
      </View>}
      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <Text style={{ color: colors.foreground, fontWeight: "700", marginBottom: 6 }}>Reviewer conversation</Text>
        {chatMessages.slice(-8).map((item, index) => <View key={String(item.id || item.created_at || index)} style={{ backgroundColor: colors.background, borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{item.sender_name || (Number(item.sender_id) === Number(user?.id) ? "You" : "Reviewer")}</Text>
          <Text style={{ color: colors.foreground, fontSize: 13 }}>{item.body}</Text>
        </View>)}
        <TextInput testID="teacher-cv-review-chat" accessibilityLabel="Message your CV reviewer" blurOnSubmit={false} multiline value={chatDraft} onChangeText={setChatDraft} placeholder="Write a private message to the authorized reviewer…" placeholderTextColor={colors.mutedForeground} style={{ minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, backgroundColor: colors.background, textAlignVertical: "top" }} />
        <TouchableOpacity disabled={!chatDraft.trim() || chatSending} onPress={() => void sendReviewMessage()} style={{ marginTop: 8, backgroundColor: colors.secondary, borderRadius: 9, padding: 10, alignItems: "center", opacity: !chatDraft.trim() || chatSending ? 0.6 : 1 }}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>{chatSending ? "Sending…" : "Send reviewer message"}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity disabled={saving || loading || downloading} onPress={() => void downloadPdf()} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: downloading ? 0.65 : 1 }}>
        {downloading ? <ActivityIndicator color={colors.primary} /> : <Feather name="download" size={16} color={colors.primary} />}
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{downloading ? "Preparing CV PDF…" : "Download verified CV PDF"}</Text>
      </TouchableOpacity>
    </View>
  );
}
