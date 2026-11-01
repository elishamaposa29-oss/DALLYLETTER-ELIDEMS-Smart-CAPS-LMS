import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Row = Record<string, any>;
type ReportType = "attendance_register" | "term_performance";

export default function TeacherAcademicReports() {
  const colors = useColors();
  const { token, user } = useAuth();
  const year = String(new Date().getFullYear());
  const [learners, setLearners] = useState<Row[]>([]);
  const [selectedLearner, setSelectedLearner] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [reportType, setReportType] = useState<ReportType>("term_performance");
  const [termLabel, setTermLabel] = useState("Term 1 " + year);
  const [periodStart, setPeriodStart] = useState(year + "-01-01");
  const [periodEnd, setPeriodEnd] = useState(year + "-12-31");
  const [teacherComment, setTeacherComment] = useState("");
  const [conduct, setConduct] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(getApiUrl(path), {
      ...init,
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(init.headers as Record<string, string> || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [learnerRows, draftRows] = await Promise.all([
        api("/api/academic-records/report-learners"),
        api("/api/academic-records/reports/drafts"),
      ]);
      setLearners(Array.isArray(learnerRows) ? learnerRows : []);
      setRows(Array.isArray(draftRows) ? draftRows : []);
      if (!selectedLearner && Array.isArray(learnerRows) && learnerRows.length) setSelectedLearner(String(learnerRows[0].id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load academic reports.");
    } finally {
      setLoading(false);
    }
  }, [api, selectedLearner]);

  useEffect(() => { void load(); }, [load]);

  const createDraft = async () => {
    if (!selectedLearner || !termLabel.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodStart > periodEnd) {
      setError("Choose a learner, enter a term label, and provide valid inclusive start and end dates.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const draft = await api("/api/academic-records/reports/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnerId: Number(selectedLearner), reportType, termLabel: termLabel.trim(), periodStart, periodEnd, teacherComment, conduct, result }),
      });
      Alert.alert("Report draft saved", "Report #" + draft.id + " is awaiting Senior Manager / Owner review.");
      setTeacherComment("");
      setConduct("");
      setResult("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create report.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (row: Row) => {
    try {
      const destination = (FileSystem.documentDirectory || FileSystem.cacheDirectory || "") + "dallyletter-report-" + row.id + ".pdf";
      const response = await FileSystem.downloadAsync(getApiUrl("/api/academic-records/reports/drafts/" + row.id + "/download/pdf"), destination, { headers: token ? { Authorization: "Bearer " + token } : {} });
      const uri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(response.uri) : response.uri;
      await Linking.openURL(uri);
    } catch (e) {
      Alert.alert("Report download unavailable", e instanceof Error ? e.message : "Could not download the approved report.");
    }
  };

  const field = (label: string, value: string, onChangeText: (value: string) => void, placeholder: string, multiline = false) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={{ minHeight: multiline ? 92 : 44, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 11, color: colors.foreground, backgroundColor: colors.background }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ backgroundColor: "#0f2a5a", paddingTop: 54, paddingBottom: 18, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Feather name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={{ color: "#e8c85a", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>DALLYLETTER ELIDEMS</Text><Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>Academic reports</Text></View>
        <TouchableOpacity onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Refresh reports"><Feather name="refresh-cw" size={19} color="#fff" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 17 }}>Teacher report builder</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4, marginBottom: 14 }}>Create reports for learners in your assigned classes. Saved attendance and marked academic work are used; unmarked work is not treated as zero.</Text>
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12, marginBottom: 7 }}>Learner</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : learners.length ? <View style={{ gap: 7, marginBottom: 14 }}>{learners.map(learner => {
            const active = selectedLearner === String(learner.id);
            return <TouchableOpacity key={learner.id} onPress={() => setSelectedLearner(String(learner.id))} style={{ borderWidth: 1, borderColor: active ? "#b38b00" : colors.border, backgroundColor: active ? "#b38b0018" : colors.background, borderRadius: 9, padding: 10 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>{learner.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{learner.grade || "Grade not recorded"} · Learner #{learner.id}</Text>
            </TouchableOpacity>;
          })}</View> : <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>No learners are currently assigned to your classes.</Text>}
          <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12, marginBottom: 7 }}>Report type</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {([{ value: "term_performance", label: "Term performance" }, { value: "attendance_register", label: "Attendance" }] as const).map(option => <TouchableOpacity key={option.value} onPress={() => setReportType(option.value)} style={{ flex: 1, borderWidth: 1, borderColor: reportType === option.value ? "#b38b00" : colors.border, borderRadius: 9, padding: 10, backgroundColor: reportType === option.value ? "#b38b0018" : colors.background }}><Text style={{ color: colors.foreground, textAlign: "center", fontWeight: "700", fontSize: 12 }}>{option.label}</Text></TouchableOpacity>)}
          </View>
          {field("Term / period label", termLabel, setTermLabel, "e.g. Term 1 2026")}
          {field("Start date (YYYY-MM-DD)", periodStart, setPeriodStart, "2026-01-01")}
          {field("End date (YYYY-MM-DD)", periodEnd, setPeriodEnd, "2026-04-30")}
          {field("Conduct / behaviour (optional)", conduct, setConduct, "Teacher assessment, if recorded")}
          {field("Term result / promotion (optional)", result, setResult, "School decision, if recorded")}
          {field("Teacher comment (optional)", teacherComment, setTeacherComment, "Factual comment based on recorded progress", true)}
          {error ? <Text accessibilityRole="alert" style={{ color: "#dc2626", marginBottom: 10 }}>{error}</Text> : null}
          <TouchableOpacity disabled={saving || loading || !learners.length} onPress={() => void createDraft()} style={{ backgroundColor: "#0f2a5a", padding: 13, borderRadius: 9, opacity: saving || loading || !learners.length ? 0.5 : 1 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800" }}>{saving ? "Saving report…" : "Create report draft"}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>Final approval is reserved for Senior Managers and Owners.</Text>
        </View>
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", marginBottom: 10 }}>Saved report drafts</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : rows.length ? rows.map(row => <View key={row.id} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 9 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={{ color: colors.foreground, fontWeight: "800", flex: 1 }}>#{row.id} · {row.learner_name || ("Learner #" + row.learner_id)}</Text><Text style={{ color: row.status === "approved" ? "#15803d" : row.status === "rejected" ? "#dc2626" : colors.mutedForeground, fontSize: 11, fontWeight: "800" }}>{String(row.status).replace("_", " ").toUpperCase()}</Text></View>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 5 }}>{row.term_label} · {row.report_type === "attendance_register" ? "Attendance" : "Term performance"}</Text>
          {row.draft_content?.factualRecords?.markSummary?.overall && <Text style={{ color: colors.foreground, fontSize: 12, marginTop: 6 }}>Marks: {row.draft_content.factualRecords.markSummary.overall.earnedMarks} / {row.draft_content.factualRecords.markSummary.overall.possibleMarks} · {row.draft_content.factualRecords.markSummary.overall.percentage == null ? "Percentage unavailable" : row.draft_content.factualRecords.markSummary.overall.percentage + "%"}</Text>}
          {row.status === "pending_review" && <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>Awaiting Senior Manager / Owner review.</Text>}
          {row.status === "approved" && <TouchableOpacity onPress={() => void download(row)} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, flexDirection: "row", justifyContent: "center", gap: 8 }}><Feather name="download" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800" }}>Download official PDF</Text></TouchableOpacity>}
        </View>) : <Text style={{ color: colors.mutedForeground }}>No reports have been created for your assigned learners yet.</Text>}
      </ScrollView>
    </View>
  );
}
