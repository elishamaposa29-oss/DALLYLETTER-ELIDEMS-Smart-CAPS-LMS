import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, useListLessons } from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import { Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

const LESSON_CACHE_KEY = "dallyletter_cached_lessons_v1";
const typeIcon: Record<string, any> = { video: "play-circle", image: "image", audio: "headphones", notes: "file-text", mixed: "layers" };
const typeColor: Record<string, string> = { video: "#8b5cf6", image: "#3b82f6", audio: "#10b981", notes: "#f59e0b", mixed: "#ef4444" };

function extractLessonLinks(value: unknown): string[] {
  const source = String(value ?? "");
  const candidates: string[] = [];
  for (const match of source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) candidates.push(match[1]);
  for (const match of source.matchAll(/https?:\/\/[^\s<>"']+/gi)) candidates.push(match[0].replace(/[),.;]+$/, ""));
  return [...new Set(candidates.map(link => link.trim()).filter(link => /^https?:\/\//i.test(link) || link.startsWith("/api/")))];
}
function isMediaReference(url: string): boolean {
  const lower = url.toLowerCase();
  return /[?&]type=(image|video|audio|application)\//i.test(lower) || /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|mp3|m4a|ogg|wav|pdf|docx?)(?:[?#]|$)/i.test(lower);
}
function RichLessonText({ value, colors }: { value: unknown; colors: any }) {
  const source = String(value ?? "");
  const tokens = source.match(/<[^>]*>|[^<]+/g) ?? [source];
  const nodes: any[] = [];
  let bold = 0, italic = 0, underline = 0, heading = 0, link: string | null = null;
  const decode = (text: string) => text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "\'");
  tokens.forEach((token, index) => {
    if (token.startsWith("<")) {
      const closing = /^<\s*\//.test(token);
      const name = (token.match(/^<\s*\/?\s*([a-z0-9]+)/i)?.[1] ?? "").toLowerCase();
      if (["p", "div", "section", "blockquote", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "li"].includes(name)) nodes.push("\n");
      if (name === "br") nodes.push("\n");
      if (name === "li" && !closing) nodes.push("• ");
      if (name === "strong" || name === "b") bold = Math.max(0, bold + (closing ? -1 : 1));
      if (name === "em" || name === "i") italic = Math.max(0, italic + (closing ? -1 : 1));
      if (name === "u") underline = Math.max(0, underline + (closing ? -1 : 1));
      if (/^h[1-6]$/.test(name)) heading = closing ? 0 : Math.max(1, 7 - Number(name.slice(1)));
      if (name === "a") {
        if (closing) link = null;
        else link = token.match(/href\s*=\s*["\']([^"\']+)["\']/i)?.[1] ?? null;
      }
      continue;
    }
    const text = decode(token);
    if (!text) return;
    const style: any = {};
    if (bold) style.fontWeight = "700";
    if (italic) style.fontStyle = "italic";
    if (underline) style.textDecorationLine = "underline";
    if (heading) { style.fontSize = 14 + heading; style.fontWeight = "700"; }
    if (link) { style.color = colors.primary; style.textDecorationLine = "underline"; }
    nodes.push(<Text key={"rich-" + index} style={style} onPress={link ? () => void Linking.openURL(link as string) : undefined}>{text}</Text>);
  });
  return <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 24 }}>{nodes}</Text>;
}

export default function StudentLessons() {
  const colors = useColors();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: lessons, isLoading, refetch } = useListLessons();
  const [search, setSearch] = useState("");
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedBundles, setSavedBundles] = useState<Record<string, any>>({});
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);
  const [cachedLessons, setCachedLessons] = useState<any[] | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unfinishedLessons, setUnfinishedLessons] = useState<Record<string, number>>({});
  const [savedForOffline, setSavedForOffline] = useState<Record<string, number>>({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const lessonCacheKey = user ? `${LESSON_CACHE_KEY}_${user.id}_${user.role}` : null;
  const progressKey = user ? `dallyletter_unfinished_lessons_v1_${user.id}_${user.role}` : null;
  const savedOfflineKey = user ? `dallyletter_saved_learning_bundle_v1_${user.id}_${user.role}` : null;

  useEffect(() => {
    let active = true;
    setUnfinishedLessons({});
    setSavedForOffline({});
    if (savedOfflineKey) {
      void AsyncStorage.getItem(savedOfflineKey).then(raw => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            setSavedBundles(parsed);
            setSavedForOffline(Object.fromEntries(Object.entries(parsed).map(([id, value]: [string, any]) => [id, Number(value && typeof value === "object" ? value.savedAt : value || 0)])));
          }
        } catch { /* Ignore invalid local bundle index. */ }
      }).catch(() => undefined);
    }
    if (progressKey) {
      void AsyncStorage.getItem(progressKey).then(raw => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setUnfinishedLessons(parsed);
        } catch { /* Recover from invalid progress data without blocking lessons. */ }
      }).catch(() => undefined);
    }
    setCachedLessons(null);
    setCacheReady(false);
    if (!lessonCacheKey) { setCacheReady(true); return () => { active = false; }; }
    AsyncStorage.getItem(lessonCacheKey).then(raw => {
      if (active && raw) {
        try { setCachedLessons(JSON.parse(raw)); } catch { /* Ignore corrupt cache and keep network results usable. */ }
      }
    }).catch(() => undefined).finally(() => { if (active) setCacheReady(true); });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const update = () => setIsOnline(navigator.onLine);
      update();
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => { active = false; window.removeEventListener("online", update); window.removeEventListener("offline", update); };
    }
    return () => { active = false; };
  }, [lessonCacheKey, progressKey, savedOfflineKey]);

  useEffect(() => {
    if (!lessonCacheKey || !lessons || lessons.length === 0) return;
    // Cache account-scoped lesson text and media references so notes remain readable offline; downloaded bytes are stored separately.
    // Preserve the full authorized lesson payload, including available attached activity and teacher feedback metadata.
    const safeSnapshot = lessons.map((lesson: any) => ({ ...lesson }));
    setCachedLessons(safeSnapshot);
    AsyncStorage.setItem(lessonCacheKey, JSON.stringify(safeSnapshot)).catch(() => undefined);
  }, [lessons, lessonCacheKey]);

  const displayedLessons = lessons?.length ? lessons : cachedLessons ?? [];
  const filtered = displayedLessons.filter((l: any) =>
    (!showSavedOnly || Boolean(savedForOffline[String(l.id)])) &&
    (String(l.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    String(l.subject ?? "").toLowerCase().includes(search.toLowerCase()))
  ).sort((a: any, b: any) => {
    const aTouched = Number(unfinishedLessons[String(a.id)] || 0);
    const bTouched = Number(unfinishedLessons[String(b.id)] || 0);
    if (aTouched && bTouched) return bTouched - aTouched;
    if (aTouched) return -1;
    if (bTouched) return 1;
    return String(a.subject ?? "").localeCompare(String(b.subject ?? "")) || String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
  const openLesson = (lesson: any) => {
    setSelectedLesson(lesson);
    if (!user?.id || !progressKey) return;
    const next = { ...unfinishedLessons, [String(lesson.id)]: Date.now() };
    setUnfinishedLessons(next);
    void AsyncStorage.setItem(progressKey, JSON.stringify(next)).catch(() => undefined);
  };
  const saveLessonBundleForOffline = async (lesson: any) => {
    if (!user || !savedOfflineKey || !lesson?.id) return;
    try {
      const raw = await AsyncStorage.getItem(savedOfflineKey);
      let bundles: Record<string, any> = {};
      try { bundles = raw ? JSON.parse(raw) : {}; } catch { bundles = {}; }
      const savedAt = Date.now();
      const headers: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
      const readList = async (path: string) => {
        const response = await fetch(getApiUrl(path), { headers });
        if (!response.ok) throw new Error("Could not cache attached learning activities.");
        const payload = await response.json();
        return Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
      };
      const [exercises, assignments, polls] = await Promise.all([
        readList("/api/exercises/lessons/" + encodeURIComponent(String(lesson.id)) + "/exercises").catch(() => []),
        readList("/api/assignments").catch(() => []),
        readList("/api/polls").catch(() => []),
      ]);
      const belongsToLesson = (item: any) => String(item.lessonId ?? item.lesson_id ?? item.lesson?.id ?? "") === String(lesson.id);
      const lessonAssignments = assignments.filter(belongsToLesson);
      const lessonPolls = polls.filter(belongsToLesson);
      bundles[String(lesson.id)] = { lesson: { ...lesson }, exercises, assignments: lessonAssignments, polls: lessonPolls, savedAt, accountId: user.id, role: user.role };
      for (const [section, incoming] of [["exercises", exercises], ["assignments", lessonAssignments], ["polls", lessonPolls]] as const) {
        const cacheKey = "dallyletter_mobile_list_" + user.id + "_" + user.role + "_" + section + "_v1";
        const existingRaw = await AsyncStorage.getItem(cacheKey).catch(() => null);
        let existing: any[] = [];
        try { const parsed = existingRaw ? JSON.parse(existingRaw) : []; existing = Array.isArray(parsed) ? parsed : []; } catch { existing = []; }
        const merged = new Map<string, any>();
        [...existing, ...incoming].forEach(item => { if (item?.id != null) merged.set(String(item.id), item); });
        await AsyncStorage.setItem(cacheKey, JSON.stringify([...merged.values()]));
      }
      await AsyncStorage.setItem(savedOfflineKey, JSON.stringify(bundles));
      setSavedBundles(previous => ({ ...previous, [String(lesson.id)]: bundles[String(lesson.id)] }));
      setSavedForOffline(previous => ({ ...previous, [String(lesson.id)]: savedAt }));
      setSaveFeedback("Saved on this device for offline preview. Answers and submissions remain drafts until the server confirms them.");
    } catch {
      setSaveFeedback("Could not save this lesson. Check device storage and try again.");
    }
  };

  const markLessonComplete = (lessonId: string | number) => {
    const next = { ...unfinishedLessons };
    delete next[String(lessonId)];
    setUnfinishedLessons(next);
    if (progressKey) void AsyncStorage.setItem(progressKey, JSON.stringify(next)).catch(() => undefined);
    setSelectedLesson(null);
  };
  const usingCache = !lessons?.length && cachedLessons !== null;
  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: top + 16, paddingBottom: 20, paddingHorizontal: 20 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff", marginBottom: 14 },
    searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 12, height: 42 },
    searchInput: { flex: 1, fontSize: 14, color: "#ffffff", fontFamily: "Inter_400Regular", marginLeft: 8 },
    scroll: { flex: 1 }, content: { padding: 16, paddingBottom: 100, width: "100%", maxWidth: 1180, alignSelf: "center" },
    offlineNotice: { backgroundColor: usingCache ? "#fff7ed" : "#ecfdf5", borderRadius: 10, padding: 11, marginBottom: 12 },
    offlineText: { fontSize: 12, color: usingCache ? "#9a3412" : "#166534", fontFamily: "Inter_500Medium" },
    card: { backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
    iconWrap: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 14 },
    info: { flex: 1 }, lessonTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6, alignSelf: "flex-start" },
    tagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    emptyWrap: { alignItems: "center", paddingTop: 60 }, emptyIcon: { marginBottom: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    loadText: { textAlign: "center", color: colors.mutedForeground, marginTop: 40, fontFamily: "Inter_400Regular" },
    retry: { alignSelf: "center", padding: 12 }, retryText: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Lessons</Text>
        <View style={s.searchWrap}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput style={s.searchInput} placeholder="Search lessons..." placeholderTextColor="rgba(255,255,255,0.5)" value={search} onChangeText={setSearch} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !showSavedOnly }} onPress={() => setShowSavedOnly(false)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, backgroundColor: !showSavedOnly ? "#FFC72C" : "rgba(255,255,255,0.12)" }}>
            <Text style={{ color: !showSavedOnly ? "#0A1931" : "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>All lessons</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: showSavedOnly }} onPress={() => setShowSavedOnly(true)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, backgroundColor: showSavedOnly ? "#FFC72C" : "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="bookmark" size={13} color={showSavedOnly ? "#0A1931" : "#fff"} />
            <Text style={{ color: showSavedOnly ? "#0A1931" : "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Saved offline ({Object.keys(savedForOffline).length})</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {usingCache && <View style={s.offlineNotice}><Text style={s.offlineText}>Offline mode: saved lesson notes are available. Download direct media before going offline; external links and new content need internet.</Text></View>}
        {!usingCache && !isOnline && <View style={s.offlineNotice}><Text style={s.offlineText}>You are offline. Saved lesson details remain available.</Text></View>}
        {isLoading && filtered.length === 0 && !cacheReady ? <Text style={s.loadText}>Loading saved lessons...</Text> :
          filtered.length === 0 ? <View style={s.emptyWrap}>
            <Feather name="book-open" size={48} color={colors.border} style={s.emptyIcon} />
            <Text style={s.emptyText}>No saved lessons found</Text>
            <Text style={s.emptySubtext}>Connect to the internet to load lessons for offline use.</Text>
            <TouchableOpacity style={s.retry} onPress={() => { void refetch(); }}><Text style={s.retryText}>Try again</Text></TouchableOpacity>
          </View> : filtered.map((lesson: any) => {
            const col = typeColor[lesson.type] ?? "#6b7280";
            const canOpenMedia = Boolean(lesson.mediaUrl) && !usingCache;
            return <TouchableOpacity key={lesson.id} style={s.card} onPress={() => openLesson(lesson)} accessibilityRole="button" accessibilityLabel={lesson.title}>
              <View style={[s.iconWrap, { backgroundColor: col + "20" }]}><Feather name={typeIcon[lesson.type] ?? "file"} size={22} color={col} /></View>
              <View style={s.info}>
                <Text style={s.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
                <Text style={s.meta}>{lesson.subject}{lesson.grade ? ` · Grade ${lesson.grade}` : ""}</Text>
                {unfinishedLessons[String(lesson.id)] ? <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 5 }}>Continue learning · saved automatically</Text> : null}
                {savedForOffline[String(lesson.id)] ? <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 }}>Saved for offline access</Text> : null}
                <View style={[s.tag, { backgroundColor: col + "18" }]}><Text style={[s.tagText, { color: col }]}>{String(lesson.type ?? "lesson").toUpperCase()}</Text></View>
              </View>
              <Feather name={savedForOffline[String(lesson.id)] ? "bookmark" : "chevron-right"} size={18} color={savedForOffline[String(lesson.id)] ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>;
          })}
      </ScrollView>
      <Modal visible={Boolean(selectedLesson)} animationType="slide" onRequestClose={() => setSelectedLesson(null)}>
        <View style={{ flex:  1, backgroundColor: colors.background, paddingTop: insets.top + 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => setSelectedLesson(null)} accessibilityRole="button" accessibilityLabel="Close lesson" style={{ padding: 8, marginRight: 8 }}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={{ flex: 1, color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Lesson details</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            {selectedLesson && <>
              <Text style={{ color: colors.foreground, fontSize: 23, lineHeight: 30, fontFamily: "Inter_700Bold" }}>{selectedLesson.title}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 8 }}>
                <TouchableOpacity accessibilityRole="button" onPress={() => void Share.share({ title: String(selectedLesson.title || "Dallyletter lesson"), message: [String(selectedLesson.title || "Dallyletter lesson"), String(selectedLesson.subject || ""), String(selectedLesson.description || ""), extractLessonLinks(selectedLesson.content).join("\n")].filter(Boolean).join("\n\n") })} style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
                  <Feather name="share-2" size={15} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Share lesson</Text>
                </TouchableOpacity>
                {savedForOffline[String(selectedLesson.id)] ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.card }}><Feather name="check-circle" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Available offline</Text></View> : null}
              </View>
              <Text style={{ color: colors.mutedForeground, marginTop: 8, marginBottom: 16 }}>{[selectedLesson.subject, selectedLesson.grade ? `Grade ${selectedLesson.grade}` : null, selectedLesson.type].filter(Boolean).join(" · ")}</Text>
              {selectedLesson.description ? <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 23, marginBottom: 14 }}>{selectedLesson.description}</Text> : null}
              {selectedLesson.mediaUrl ? <AuthenticatedMediaPreview url={String(selectedLesson.mediaUrl)} accessibilityLabel={String(selectedLesson.title || "Lesson image")} /> : null}
              {selectedLesson.content ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, marginBottom: 16 }}><RichLessonText value={selectedLesson.content} colors={colors} /></View> : <Text style={{ color: colors.mutedForeground, marginBottom: 14 }}>No written lesson notes were provided.</Text>}
              {extractLessonLinks(selectedLesson.content).map((url, index) => <View key={url} style={{marginBottom:12,padding:12,borderRadius:10,borderWidth:1,borderColor:colors.border}}>
                {isMediaReference(url) ? <AuthenticatedMediaPreview url={url} accessibilityLabel={`Embedded lesson media ${index+1}`} height={180}/> : null}
                {url.startsWith("/api/") ? <Text style={{color:colors.mutedForeground,fontSize:12,marginTop:4}}>Protected learning content is included in the saved lesson record where available. Linked media may require an online connection unless the app has already cached it.</Text> : <TouchableOpacity onPress={() => void Linking.openURL(url)} accessibilityRole="button" accessibilityLabel={`Open lesson link ${index+1}`}>
                  <Text style={{color:colors.primary,fontFamily:"Inter_600SemiBold"}}>Open embedded link {index+1}</Text>
                  <Text selectable style={{color:colors.mutedForeground,fontSize:12,marginTop:4}}>{url}</Text>
                </TouchableOpacity>}
              </View>)}
              {selectedLesson.mediaUrl && /^https?:\/\//i.test(String(selectedLesson.mediaUrl)) ? <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 15, flexDirection: "row", alignItems: "center", gap: 10 }} onPress={() => void Linking.openURL(String(selectedLesson.mediaUrl))}><Feather name="play-circle" size={22} color="#fff"/><View style={{ flex: 1 }}><Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Open external lesson media</Text><Text numberOfLines={2} style={{ color: "rgba(255,255,255,.8)", fontSize: 12, marginTop: 3 }}>{selectedLesson.mediaUrl}</Text></View><Feather name="external-link" size={17} color="#fff"/></TouchableOpacity> : null}
              <TouchableOpacity accessibilityRole="button" onPress={() => void saveLessonBundleForOffline(selectedLesson)} style={{ backgroundColor: savedForOffline[String(selectedLesson.id)] ? colors.card : colors.primary, borderColor: colors.primary, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><Feather name={savedForOffline[String(selectedLesson.id)] ? "check-circle" : "bookmark"} size={18} color={savedForOffline[String(selectedLesson.id)] ? colors.primary : "#fff"} /><Text style={{ color: savedForOffline[String(selectedLesson.id)] ? colors.primary : "#fff", fontFamily: "Inter_600SemiBold" }}>{savedForOffline[String(selectedLesson.id)] ? "Saved for offline access · Update saved copy" : "Save lesson & activities for offline access"}</Text></TouchableOpacity>
              {savedBundles[String(selectedLesson.id)] ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, marginTop: 12 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 8 }}>Included learning activities</Text>
                {[
                  ["Exercises", savedBundles[String(selectedLesson.id)].exercises?.length || 0],
                  ["Assignments", savedBundles[String(selectedLesson.id)].assignments?.length || 0],
                  ["Polls", savedBundles[String(selectedLesson.id)].polls?.length || 0],
                ].map(([label, count]: any) => <View key={label} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 }}><Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{label}</Text><Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{count}</Text></View>)}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 6 }}>Saved activity details can be previewed offline. Responses stay on this device as drafts until the server confirms submission.</Text>
              </View> : null}
              {saveFeedback ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 8 }}>{saveFeedback}</Text> : null}
              <TouchableOpacity accessibilityRole="button" onPress={() => markLessonComplete(selectedLesson.id)} style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 14, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><Feather name="check-circle" size={18} color="#fff" /><Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Mark lesson complete</Text></TouchableOpacity>
              {!isOnline ? <Text style={{ color: "#b45309", marginTop: 14, fontSize: 12 }}>Offline: saved written details remain available. Downloaded media opens locally; external links need internet.</Text> : null}
            </>}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
