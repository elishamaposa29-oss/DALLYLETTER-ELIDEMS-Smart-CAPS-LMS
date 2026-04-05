import { Feather } from "@expo/vector-icons";
import { useListLessons } from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useState } from "react";

const typeIcon: Record<string, any> = {
  video: "play-circle",
  image: "image",
  audio: "headphones",
  notes: "file-text",
  mixed: "layers",
};

const typeColor: Record<string, string> = {
  video: "#8b5cf6",
  image: "#3b82f6",
  audio: "#10b981",
  notes: "#f59e0b",
  mixed: "#ef4444",
};

export default function StudentLessons() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: lessons, isLoading, refetch } = useListLessons();
  const [search, setSearch] = useState("");

  const filtered = lessons?.filter((l: any) =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.subject.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff", marginBottom: 14 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
    },
    searchInput: { flex: 1, fontSize: 14, color: "#ffffff", fontFamily: "Inter_400Regular", marginLeft: 8 },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    info: { flex: 1 },
    lessonTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    meta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },
    tag: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginTop: 6,
      alignSelf: "flex-start",
    },
    tagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    emptyWrap: { alignItems: "center", paddingTop: 60 },
    emptyIcon: { marginBottom: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    loadText: { textAlign: "center", color: colors.mutedForeground, marginTop: 40, fontFamily: "Inter_400Regular" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Lessons</Text>
        <View style={s.searchWrap}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search lessons..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <Text style={s.loadText}>Loading lessons...</Text>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Feather name="book-open" size={48} color={colors.border} style={s.emptyIcon} />
            <Text style={s.emptyText}>No lessons found</Text>
            <Text style={s.emptySubtext}>Check back later for new content</Text>
          </View>
        ) : (
          filtered.map((lesson: any) => {
            const col = typeColor[lesson.type] ?? "#6b7280";
            return (
              <TouchableOpacity
                key={lesson.id}
                style={s.card}
                onPress={() => lesson.mediaUrl && Linking.openURL(lesson.mediaUrl)}
              >
                <View style={[s.iconWrap, { backgroundColor: col + "20" }]}>
                  <Feather name={typeIcon[lesson.type] ?? "file"} size={22} color={col} />
                </View>
                <View style={s.info}>
                  <Text style={s.lessonTitle} numberOfLines={2}>{lesson.title}</Text>
                  <Text style={s.meta}>{lesson.subject}{lesson.grade ? ` · Grade ${lesson.grade}` : ""}</Text>
                  <View style={[s.tag, { backgroundColor: col + "18" }]}>
                    <Text style={[s.tagText, { color: col }]}>{lesson.type.toUpperCase()}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
