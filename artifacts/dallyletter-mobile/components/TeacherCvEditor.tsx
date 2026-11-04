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
};

const emptyCv: TeacherCv = {
  professionalSummary: "", education: "", experience: "", subjects: "",
  address: "", certifications: "", languages: "", references: "",
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

  useEffect(() => {
    let active = true;
    if (!user || !token || user.role !== "teacher") return;
    setLoading(true);
    fetch(getApiUrl("/api/users/me/teacher-cv"), { headers: { Authorization: "Bearer " + token } })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load your CV.");
        return response.json();
      })
      .then(data => { if (active) setCv({ ...emptyCv, ...(data.cv ?? {}) }); })
      .catch(() => { if (active) Alert.alert("Teacher CV", "Your CV could not be loaded. Please retry when online."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, token]);

  const save = async () => {
    if (!token || saving) return;
    setSaving(true);
    try {
      const response = await fetch(getApiUrl("/api/users/me/teacher-cv"), {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your CV.");
      setCv({ ...emptyCv, ...(data.cv ?? cv) });
      Alert.alert("CV saved", "Your teacher CV has been saved. Upload your resume/certificates and complete payment information before owner review.");
    } catch (error) {
      Alert.alert("Could not save CV", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setSaving(false);
    }
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
