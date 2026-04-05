import { Feather } from "@expo/vector-icons";
import { useListMessages, useSendMessage } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { Platform, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function TeacherChat() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const { data: messages, refetch } = useListMessages({});
  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => { setText(""); refetch(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
    },
  });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottom = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMutation.mutate({ data: { content: text.trim(), type: "text" } });
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 16,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#ffffff" },
    headerSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular" },
    list: { flex: 1 },
    listContent: { padding: 16, gap: 8 },
    bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
    myBubble: { backgroundColor: colors.primary, alignSelf: "flex-end", borderBottomRightRadius: 4 },
    theirBubble: { backgroundColor: colors.card, alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    myText: { color: "#ffffff", fontSize: 14, fontFamily: "Inter_400Regular" },
    theirText: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular" },
    sender: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
    time: { fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 3, textAlign: "right" },
    theirTime: { fontSize: 10, color: colors.mutedForeground, marginTop: 3 },
    inputArea: {
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      paddingBottom: bottom + 10,
      gap: 10,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      backgroundColor: colors.background,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
  });

  const msgs = messages ?? [];
  const isMe = (msg: any) => msg.senderId === user?.id;

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Feather name="users" size={18} color="#ffffff" />
        </View>
        <View>
          <Text style={s.headerTitle}>Class Chat</Text>
          <Text style={s.headerSub}>All students</Text>
        </View>
      </View>

      {msgs.length === 0 ? (
        <View style={s.emptyWrap}>
          <Feather name="message-circle" size={48} color={colors.border} />
          <Text style={s.emptyText}>No messages yet</Text>
        </View>
      ) : (
        <FlatList
          data={[...msgs].reverse()}
          inverted
          style={s.list}
          contentContainerStyle={s.listContent}
          keyExtractor={(item: any) => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg }) => {
            const mine = isMe(msg);
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                {!mine && <Text style={s.sender}>{msg.senderName ?? "Student"}</Text>}
                <View style={[s.bubble, mine ? s.myBubble : s.theirBubble]}>
                  <Text style={mine ? s.myText : s.theirText}>{msg.content}</Text>
                  <Text style={mine ? s.time : s.theirTime}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={s.inputArea}>
        <TextInput
          style={s.input}
          placeholder="Message students..."
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={s.sendBtn} onPress={handleSend}>
          <Feather name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
