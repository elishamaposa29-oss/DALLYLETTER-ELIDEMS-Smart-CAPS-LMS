import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
        try { savedPersonal = typeof nextCv.personalDetails === "string" ? JSON.parse(nextCv.personalDetails) : nextCv.personalDetails || {}; } catch {}
        if (!active) return;
        setCv(nextCv);
        setPersonal({
          idNumber: String(savedPersonal.idNumber || ""),
          dob: String(savedPersonal.dob || ""),
          phone: String(savedPersonal.phone || user.phone || ""),
          email: String(savedPersonal.email || user.email || ""),
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          if (active) { setApplicationStatus(String(me.user?.teacherApplicationStatus || "draft")); setReviewDeadline(me.user?.teacherReviewDeadline || null); }
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
      if (!response.ok) throw new Error(data.error || "Your application could not be submitted. Check the required details and documents.");
      setApplicationStatus("pending_review");
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
      <TouchableOpacity disabled={saving || loading} onPress={save} style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: saving || loading ? 0.65 : 1 }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={16} color="#fff" />}
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Saving…" : "Save teacher CV"}</Text>
      </TouchableOpacity>
      <TouchableOpacity disabled={saving || loading || downloading} onPress={() => void downloadPdf()} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: downloading ? 0.65 : 1 }}>
        {downloading ? <ActivityIndicator color={colors.primary} /> : <Feather name="download" size={16} color={colors.primary} />}
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{downloading ? "Preparing CV PDF…" : "Download verified CV PDF"}</Text>
      </TouchableOpacity>
    </View>
  );
}
