import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useListLessons } from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

const LESSON_CACHE_KEY = "dallyletter_cached_lessons_v1";
const typeIcon: Record<string, any> = { video: "play-circle", image: "image", audio: "headphones", notes: "file-text", mixed: "layers" };
const typeColor: Record<string, string> = { video: "#8b5cf6", image: "#3b82f6", audio: "#10b981", notes: "#f59e0b", mixed: "#ef4444" };

export default function StudentLessons() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: lessons, isLoading, refetch } = useListLessons();
  const [search, setSearch] = useState("");
  const [cachedLessons, setCachedLessons] = useState<any[] | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const lessonCacheKey = user ? `${LESSON_CACHE_KEY}_${user.id}_${user.role}` : null;

  useEffect(() => {
    let active = true;
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
  }, [lessonCacheKey]);

  useEffect(() => {
    if (!lessonCacheKey || !lessons || lessons.length === 0) return;
    // Cache only non-sensitive listing metadata. Media URLs and content stay out of local storage.
    const safeSnapshot = lessons.map((lesson: any) => ({
      id: lesson.id, title: lesson.title, subject: lesson.subject, grade: lesson.grade,
      type: lesson.type,
    }));
    setCachedLessons(safeSnapshot);
    AsyncStorage.setItem(lessonCacheKey, JSON.stringify(safeSnapshot)).catch(() => undefined);
  }, [lessons, lessonCacheKey]);

  const displayedLessons = lessons?.length ? lessons : cachedLessons ?? [];
  const filtered = displayedLessons.filter((l: any) =>
    String(l.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    String(l.subject ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const usingCache = !lessons?.length && cachedLessons !== null;
  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingTop: top + 16, paddingBottom: 20, paddingHorizontal: 20 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff", marginBottom: 14 },
    searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 12, height: 42 },
    searchInput: { flex: 1, fontSize: 14, color: "#ffffff", fontFamily: "Inter_400Regular", marginLeft: 8 },
    scroll: { flex: 1 }, content: { padding: 16, paddingBottom: 100 },
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
        {usingCache && <View style={s.offlineNotice}><Text style={s.offlineText}>Offline mode: showing saved lesson details. Opened media and new content may require internet.</Text></View>}
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
            return <TouchableOpacity key={lesson.id} style={s.card} onPress={() => {
              if (canOpenMedia && isOnline) void Linking.openURL(lesson.mediaUrl);
            }} accessibilityRole="button" accessibilityLabel={lesson.title}>
              <View style={[s.iconWrap, { backgroundColor: col + "20" }]}><Feather name={typeIcon[lesson.type] ?? "file"} size={22} color={col} /></View>
              <View style={s.info}>
                <Text style={s.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
                <Text style={s.meta}>{lesson.subject}{lesson.grade ? ` · Grade ${lesson.grade}` : ""}</Text>
                <View style={[s.tag, { backgroundColor: col + "18" }]}><Text style={[s.tagText, { color: col }]}>{String(lesson.type ?? "lesson").toUpperCase()}</Text></View>
              </View>
              <Feather name={canOpenMedia && isOnline ? "chevron-right" : "download-cloud"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>;
          })}
      </ScrollView>
    </View>
  );
}
