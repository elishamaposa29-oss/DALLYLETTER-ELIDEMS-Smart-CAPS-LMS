import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Row = Record<string, any> & { id?: number };
type Panel = "reports" | "transfers" | "qualifications" | "achievements";
const panelMeta: { id: Panel; title: string; permission: string }[] = [
  { id: "reports", title: "Academic reports", permission: "reports.view" },
  { id: "transfers", title: "Transfer letters", permission: "transfers.view" },
  { id: "qualifications", title: "Qualifications", permission: "qualifications.view" },
  { id: "achievements", title: "Achievement awards", permission: "achievements.view" },
];

export default function ManagerReviewWorkspace() {
  const colors = useColors();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [panel, setPanel] = useState<Panel>("reports");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isOwner, setIsOwner] = useState(false);
  const [role, setRole] = useState("");
  const [rows, setRows] = useState<Record<Panel, Row[]>>({ reports: [], transfers: [], qualifications: [], achievements: [] });
  const [achievementCanApprove, setAchievementCanApprove] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<number, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path: string, method = "GET", body?: any) => {
    const response = await fetch(getApiUrl(path), {
      method,
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed (" + response.status + ")");
    return payload;
  }, [token]);

  const can = (key: string) => isOwner || permissions[key] === true;
  const canApproveTransfer = isOwner || (role === "senior_manager" && permissions["transfers.approve"] === true);
  const canRejectTransfer = isOwner || (role === "senior_manager" && permissions["transfers.reject"] === true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const p = await request("/api/manager-permissions/me");
      const grants = p.permissions || {};
      const owner = p.isOwner === true;
      const currentRole = String(p.role || "").toLowerCase().replace(/[ -]+/g, "_");
      setIsOwner(owner); setRole(currentRole); setPermissions(grants);
      const allowed = (key: string) => owner || grants[key] === true;
      const [reports, transfers, qualifications, achievements] = await Promise.all([
        allowed("reports.view") ? request("/api/academic-records/reports/drafts") : Promise.resolve([]),
        allowed("transfers.view") ? request("/api/academic-records/transfer-requests") : Promise.resolve([]),
        allowed("qualifications.view") ? request("/api/qualifications/pending") : Promise.resolve([]),
        allowed("achievements.view") ? request("/api/achievements/award/recommendations") : Promise.resolve({ items: [], canApprove: false }),
      ]);
      setRows({
        reports: Array.isArray(reports) ? reports : [],
        transfers: Array.isArray(transfers) ? transfers : [],
        qualifications: Array.isArray(qualifications) ? qualifications : [],
        achievements: Array.isArray(achievements?.items) ? achievements.items : [],
      });
      setAchievementCanApprove(achievements?.canApprove === true);
      const available = panelMeta.filter(item => allowed(item.permission));
      if (!available.some(item => item.id === panel)) setPanel((available[0]?.id || "reports") as Panel);
    } catch (e) { setError(e instanceof Error ? e.message : "Review workspace could not be loaded."); }
    finally { setLoading(false); }
  }, [request, token, panel]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (["reports", "transfers", "qualifications", "achievements"].includes(String(params.tab))) setPanel(params.tab as Panel); }, [params.tab]);

  const decide = async (kind: Panel, row: Row, status: string) => {
    const key = kind + ":" + row.id;
    const note = (notes[key] || "").trim();
    if (["rejected"].includes(status) && note.length < 3) { setError("Enter a rejection reason of at least 3 characters."); return; }
    setBusy(key); setError(""); setNotice("");
    try {
      const path = kind === "reports" ? "/api/academic-records/reports/drafts/" + row.id + "/review"
        : kind === "transfers" ? "/api/academic-records/transfer-requests/" + row.id + "/review"
        : kind === "qualifications" ? "/api/qualifications/" + row.id + "/verify"
        : "/api/achievements/award/recommendations/" + row.id + "/review";
      await request(path, kind === "qualifications" ? "PATCH" : "POST", kind === "qualifications" ? { status: status === "approved" ? "verified" : "rejected", reviewNote: note } : { status, note });
      setNotice((panelMeta.find(x => x.id === kind)?.title || "Review item") + " decision saved.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Decision could not be saved."); }
    finally { setBusy(null); }
  };

  const openHistory = async (row: Row) => {
    setBusy("history:" + row.id); setError("");
    try {
      const data = await request("/api/qualifications/" + row.id + "/review-history");
      setHistory(current => ({ ...current, [Number(row.id)]: Array.isArray(data.history) ? data.history : [] }));
    } catch (e) { setError(e instanceof Error ? e.message : "Review history could not be loaded."); }
    finally { setBusy(null); }
  };

  const download = async (kind: "reports" | "transfers" | "qualifications", row: Row) => {
    if (!token) return;
    const key = "download:" + row.id; setBusy(key); setError("");
    try {
      const path = kind === "reports" ? "/api/academic-records/reports/drafts/" + row.id + "/download/pdf"
        : kind === "transfers" ? "/api/academic-records/transfer-requests/" + row.id + "/download"
        : "/api/qualifications/" + (row.document_id || row.id) + "/document";
      const ext = kind === "reports" || kind === "transfers" ? ".pdf" : (String(row.document_mime_type || "").includes("pdf") ? ".pdf" : ".bin");
      const destination = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "dallyletter-review-" + row.id + ext;
      const response = await FileSystem.downloadAsync(getApiUrl(path), destination, { headers: { Authorization: "Bearer " + token } });
      if (response.status < 200 || response.status >= 300) throw new Error("Protected file download failed.");
      const uri = await FileSystem.getContentUriAsync(response.uri);
      await Linking.openURL(uri);
    } catch (e) { setError(e instanceof Error ? e.message : "File could not be opened."); }
    finally { setBusy(null); }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 10 };
  const heading = { color: colors.foreground, fontSize: 15, fontWeight: "800" as const };
  const body = { color: colors.foreground, fontSize: 13, lineHeight: 19 };
  const muted = { color: colors.mutedForeground, fontSize: 12, lineHeight: 17 };
  const button = { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, alignItems: "center" as const };
  const buttonText = { color: "#fff", fontWeight: "800" as const, fontSize: 12 };
  const renderRows = (kind: Panel) => {
    const list = rows[kind];
    if (!list.length) return <Text style={muted}>No items are currently available in this review queue.</Text>;
    return list.map(row => {
      const key = kind + ":" + row.id;
      const status = String(row.status || row.verification_status || "pending").toLowerCase();
      const pending = ["pending", "pending_review", "submitted", "pending_senior_review"].includes(status);
      const canDecide = kind === "reports" ? can("reports.review")
        : kind === "transfers" ? canApproveTransfer || canRejectTransfer
        : kind === "qualifications" ? can("qualifications.verify")
        : achievementCanApprove;
      return <View key={String(row.id)} style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border, gap: 6 }}>
        <Text style={body}>{row.learner_name || row.teacher_name || row.name || row.title || (kind === "achievements" ? "Achievement recommendation" : "Review item #" + row.id)}</Text>
        <Text style={muted}>{kind === "reports" ? (row.term_label || row.report_type || "Academic report") : kind === "transfers" ? (row.reason || "Transfer request") : kind === "qualifications" ? (row.institution || row.title || "Qualification") : (row.achievement_name || row.name || "Achievement award")}</Text>
        <Text style={muted}>Status: {status}{row.review_note ? " · " + row.review_note : ""}{row.recommendation_note ? " · " + row.recommendation_note : ""}</Text>
        {kind === "qualifications" ? <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {row.document_id ? <TouchableOpacity onPress={() => void download("qualifications", row)}><Text style={{ color: colors.primary, fontWeight: "800" }}>Open certificate</Text></TouchableOpacity> : <Text style={muted}>Certificate not attached</Text>}
          <TouchableOpacity onPress={() => void openHistory(row)}><Text style={{ color: colors.primary, fontWeight: "800" }}>Review history</Text></TouchableOpacity>
        </View> : null}
        {kind === "reports" && <TouchableOpacity onPress={() => void download("reports", row)}><Text style={{ color: colors.primary, fontWeight: "800" }}>Open report PDF</Text></TouchableOpacity>}
        {kind === "transfers" && status === "approved" ? <TouchableOpacity onPress={() => void download("transfers", row)}><Text style={{ color: colors.primary, fontWeight: "800" }}>Download approved letter</Text></TouchableOpacity> : null}
        {history[Number(row.id)]?.map((entry: Row, index: number) => <Text key={String(entry.id || index)} style={muted}>{entry.reviewer_name || "Reviewer"} · {entry.previous_status} → {entry.new_status} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""} {entry.review_note || ""}</Text>)}
        {pending && canDecide ? <>
          <TextInput value={notes[key] || ""} onChangeText={value => setNotes(current => ({ ...current, [key]: value }))} multiline placeholder="Decision note (required for rejection)" placeholderTextColor={colors.mutedForeground} style={{ minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 9, color: colors.foreground, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(kind !== "transfers" || canApproveTransfer) ? <TouchableOpacity disabled={busy === key} onPress={() => void decide(kind, row, "approved")} style={[button, { flex: 1, backgroundColor: "#15803d" }]}><Text style={buttonText}>{kind === "qualifications" ? "Verify" : "Approve"}</Text></TouchableOpacity> : null}
            {(kind !== "transfers" || canRejectTransfer) ? <TouchableOpacity disabled={busy === key} onPress={() => void decide(kind, row, "rejected")} style={[button, { flex: 1, backgroundColor: "#b91c1c" }]}><Text style={buttonText}>Decline</Text></TouchableOpacity> : null}
          </View>
        </> : null}
      </View>;
    });
  };

  const availablePanels = panelMeta.filter(item => can(item.permission));
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ backgroundColor: colors.primary, padding: 16, paddingTop: 24 }}>
      <Text style={{ color: "#fff", fontSize: 21, fontWeight: "900" }}>Manager Review Queue</Text>
      <Text style={{ color: "#dbeafe", fontSize: 12, marginTop: 5 }}>Submitters, decisions, notes, protected documents and review history.</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>
      {error ? <View style={[card, { borderColor: "#dc2626" }]}><Text style={{ color: "#dc2626" }}>{error}</Text></View> : null}
      {notice ? <View style={card}><Text style={{ color: "#15803d", fontWeight: "800" }}>{notice}</Text></View> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {availablePanels.map(item => <TouchableOpacity key={item.id} onPress={() => setPanel(item.id)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: panel === item.id ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: panel === item.id ? "#fff" : colors.foreground, fontWeight: "700" }}>{item.title} ({rows[item.id].length})</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={() => void load()} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Feather name="refresh-cw" size={15} color={colors.primary} /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={{ margin: 18 }} /> : null}
      {availablePanels.length ? <View style={card}><Text style={heading}>{panelMeta.find(item => item.id === panel)?.title || "Review queue"}</Text>{renderRows(panel)}</View> : <View style={card}><Text style={heading}>No review permissions granted</Text><Text style={muted}>Ask the Owner for the specific view and review capabilities you need. This screen does not grant permissions.</Text></View>}
      {can("teacher_cv.view") ? <TouchableOpacity onPress={() => router.push("/(manager)/teacher-cv-workspace" as any)} style={card}><Text style={{ color: colors.primary, fontWeight: "800" }}>Open teacher CV & survey review workspace</Text></TouchableOpacity> : null}
    </ScrollView>
  </View>;
}
