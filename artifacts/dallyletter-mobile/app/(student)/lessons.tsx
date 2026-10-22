import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, useListLessons } from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";
import OfflineMediaDownload from "@/components/OfflineMediaDownload";
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
function plainLessonText(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(?:li)\s*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|ul|ol|section|blockquote)\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function StudentLessons() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: lessons, isLoading, refetch } = useListLessons();
  const [search, setSearch] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<any | null>(null);
  const [cachedLessons, setCachedLessons] = useState<any[] | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unfinishedLessons, setUnfinishedLessons] = useState<Record<string, number>>({});
  const lessonCacheKey = user ? `${LESSON_CACHE_KEY}_${user.id}_${user.role}` : null;
  const progressKey = user ? `dallyletter_unfinished_lessons_v1_${user.id}_${user.role}` : null;

  useEffect(() => {
    let active = true;
    setUnfinishedLessons({});
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
  }, [lessonCacheKey, progressKey]);

  useEffect(() => {
    if (!lessonCacheKey || !lessons || lessons.length === 0) return;
    // Cache account-scoped lesson text and media references so notes remain readable offline; downloaded bytes are stored separately.
    const safeSnapshot = lessons.map((lesson: any) => ({
      id: lesson.id, title: lesson.title, subject: lesson.subject, grade: lesson.grade,
      type: lesson.type, content: lesson.content, description: lesson.description, mediaUrl: lesson.mediaUrl,
    }));
    setCachedLessons(safeSnapshot);
    AsyncStorage.setItem(lessonCacheKey, JSON.stringify(safeSnapshot)).catch(() => undefined);
  }, [lessons, lessonCacheKey]);

  const displayedLessons = lessons?.length ? lessons : cachedLessons ?? [];
  const filtered = displayedLessons.filter((l: any) =>
    String(l.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    String(l.subject ?? "").toLowerCase().includes(search.toLowerCase())
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
                <View style={[s.tag, { backgroundColor: col + "18" }]}><Text style={[s.tagText, { color: col }]}>{String(lesson.type ?? "lesson").toUpperCase()}</Text></View>
              </View>
              <Feather name={canOpenMedia && isOnline ? "chevron-right" : "download-cloud"} size={18} color={colors.mutedForeground} />
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
              <Text style={{ color: colors.mutedForeground, marginTop: 8, marginBottom: 16 }}>{[selectedLesson.subject, selectedLesson.grade ? `Grade ${selectedLesson.grade}` : null, selectedLesson.type].filter(Boolean).join(" · ")}</Text>
              {selectedLesson.description ? <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 23, marginBottom: 14 }}>{selectedLesson.description}</Text> : null}
              {selectedLesson.mediaUrl ? <AuthenticatedMediaPreview url={String(selectedLesson.mediaUrl)} accessibilityLabel={String(selectedLesson.title || "Lesson image")} /> : null}
              {selectedLesson.content ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, marginBottom: 16 }}><Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 24 }}>{plainLessonText(selectedLesson.content)}</Text></View> : <Text style={{ color: colors.mutedForeground, marginBottom: 14 }}>No written lesson notes were provided.</Text>}
              {extractLessonLinks(selectedLesson.content).map((url, index) => <View key={url} style={{marginBottom:12,padding:12,borderRadius:10,borderWidth:1,borderColor:colors.border}}>
                {isMediaReference(url) ? <AuthenticatedMediaPreview url={url} accessibilityLabel={`Embedded lesson media ${index+1}`} height={180}/> : url.startsWith("/api/") ? <OfflineMediaDownload url={url} fileName={`Lesson attachment ${index+1}`} accessibilityLabel={`Download lesson attachment ${index+1} for offline use`} /> : null}
                {url.startsWith("/api/") ? <Text style={{color:colors.mutedForeground,fontSize:12,marginTop:4}}>Protected learning attachment · download it above to open it offline.</Text> : <TouchableOpacity onPress={() => void Linking.openURL(url)} accessibilityRole="button" accessibilityLabel={`Open lesson link ${index+1}`}>
                  <Text style={{color:colors.primary,fontFamily:"Inter_600SemiBold"}}>Open embedded link {index+1}</Text>
                  <Text selectable style={{color:colors.mutedForeground,fontSize:12,marginTop:4}}>{url}</Text>
                </TouchableOpacity>}
              </View>)}
              {selectedLesson.mediaUrl && /^https?:\/\//i.test(String(selectedLesson.mediaUrl)) ? <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 15, flexDirection: "row", alignItems: "center", gap: 10 }} onPress={() => void Linking.openURL(String(selectedLesson.mediaUrl))}><Feather name="play-circle" size={22} color="#fff"/><View style={{ flex: 1 }}><Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Open external lesson media</Text><Text numberOfLines={2} style={{ color: "rgba(255,255,255,.8)", fontSize: 12, marginTop: 3 }}>{selectedLesson.mediaUrl}</Text></View><Feather name="external-link" size={17} color="#fff"/></TouchableOpacity> : null}
              {!isOnline ? <Text style={{ color: "#b45309", marginTop: 14, fontSize: 12 }}>Offline: saved written details remain available. Downloaded media opens locally; external links need internet.</Text> : null}
            </>}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
