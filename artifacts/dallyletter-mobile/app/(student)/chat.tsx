import { Feather } from "@expo/vector-icons";
import { useListMessages, useSendMessage, useListStudyGroups } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { AppState, Platform, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
type ChatGroup = { id: number; name: string; isMember?: boolean; members?: Array<{ id: number }> };
import { useAuth } from "@/contexts/AuthContext";
import { UserProfileLink } from "@/components/UserProfileLink";
import { useColors } from "@/hooks/useColors";

export default function StudentChat() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const { data: groupData, isLoading: groupsLoading } = useListStudyGroups();
  const groups = (groupData ?? []) as unknown as ChatGroup[];
  const joinedGroups = groups.filter(group => group.isMember ?? group.members?.some(member => member.id === user?.id));
  const selectedGroup = joinedGroups.find(group => group.id === selectedGroupId);
  const [queuedMessages, setQueuedMessages] = useState<any[]>([]);
  const [retrySignal, setRetrySignal] = useState(0);
  const queueKey = user?.id ? "dallyletter_mobile_chat_outbox_user_" + user.id : null;
  useEffect(() => { let active=true; if (!queueKey) { setQueuedMessages([]); return; } void AsyncStorage.getItem(queueKey).then(raw => { if(active && raw) setQueuedMessages(JSON.parse(raw)); }).catch(() => {}); return () => { active=false; }; }, [queueKey]);
  useEffect(() => { const sub=AppState.addEventListener("change", state => { if(state==="active") setRetrySignal(v=>v+1); }); return () => sub.remove(); }, []);
  useEffect(() => { if (queuedMessages.length === 0) return; const timer=setInterval(() => { if(AppState.currentState==="active") setRetrySignal(v=>v+1); }, 30000); return () => clearInterval(timer); }, [queuedMessages.length]);
  const { data: messages, refetch } = useListMessages({ groupId: selectedGroupId }, { query: { enabled: selectedGroupId != null, refetchInterval: 5000 } as any });
  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => {
        refetch();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    },
  });

  useEffect(() => { if (joinedGroups.length > 0 && !joinedGroups.some(group => group.id === selectedGroupId)) setSelectedGroupId(joinedGroups[0].id); }, [joinedGroups, selectedGroupId]);

  const persistQueue = async (next: any[]) => {
    setQueuedMessages(next);
    if (queueKey) await AsyncStorage.setItem(queueKey, JSON.stringify(next)).catch(() => {});
  };

  useEffect(() => {
    if (!queueKey || queuedMessages.length === 0 || AppState.currentState !== "active") return;
    let cancelled = false;
    void (async () => {
      const remaining = [...queuedMessages];
      while (remaining.length && !cancelled) {
        const item = remaining[0];
        try {
          if (!Number.isSafeInteger(item.groupId) || item.groupId <= 0) { if (!cancelled) setNotice("An older offline message has no saved group destination. It was not sent to the wrong conversation."); break; }
          await sendMutation.mutateAsync({ data: { content: item.content, type: "text", groupId: item.groupId } });
          remaining.shift();
          if (!cancelled) await persistQueue([...remaining]);
        } catch {
          break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [retrySignal, queueKey, queuedMessages.length]);

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottom = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !user) return;
    if (selectedGroupId == null) { setNotice("Join a study group before sending a group message."); return; }
    setNotice("");
    try {
      await sendMutation.mutateAsync({ data: { content, type: "text", groupId: selectedGroupId } });
      setText("");
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (!status && queueKey) {
        const item = { id: "queued-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8), content, groupId: selectedGroupId, createdAt: new Date().toISOString(), senderId: user.id, senderName: user.name, queued: true };
        await persistQueue([...queuedMessages, item]);
        setText("");
        setNotice("Message saved offline. It will retry for the selected group when the connection returns.");
      } else {
        setNotice(error instanceof Error ? error.message : "Message could not be sent.");
      }
    }
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
    avatarWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#ffffff" },
    headerSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular" },
    list: { flex: 1 },
    listContent: { padding: 16, gap: 8 },
    bubble: {
      maxWidth: "78%",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
    },
    myBubble: {
      backgroundColor: colors.primary,
      alignSelf: "flex-end",
      borderBottomRightRadius: 4,
    },
    theirBubble: {
      backgroundColor: colors.card,
      alignSelf: "flex-start",
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
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
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    groupStrip: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    groupChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  });

  const grouped = [...(messages ?? []), ...queuedMessages.filter(item => item.groupId === selectedGroupId)];
  const isMe = (msg: any) => msg.senderId === user?.id;

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <View style={s.avatarWrap}>
          <Feather name="users" size={18} color="#ffffff" />
        </View>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Class Chat</Text>
          <Text style={s.headerSub}>{selectedGroup?.name || (groupsLoading ? "Loading groups…" : "Select a joined group")}</Text>
        </View>
      </View>

      <View style={s.groupStrip}><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{joinedGroups.map(group => <TouchableOpacity key={group.id} onPress={() => { setSelectedGroupId(group.id); setNotice(""); }} style={[s.groupChip,{borderColor:selectedGroupId===group.id?colors.primary:colors.border,backgroundColor:selectedGroupId===group.id?colors.primary:colors.card}]}><Text style={{color:selectedGroupId===group.id?"#fff":colors.foreground,fontWeight:"700",fontSize:12}}>{group.name}</Text></TouchableOpacity>)}{!groupsLoading&&joinedGroups.length===0?<Text style={s.emptySubtext}>No joined study groups. Join a group first.</Text>:null}</ScrollView></View>
      {notice ? <Text accessibilityRole="alert" style={{paddingHorizontal:14,paddingVertical:6,color:colors.primary,fontSize:12}}>{notice}</Text> : null}
      {grouped.length === 0 ? (
        <View style={s.emptyWrap}>
          <Feather name="message-circle" size={48} color={colors.border} />
          <Text style={s.emptyText}>No messages yet</Text>
          <Text style={s.emptySubtext}>Start the conversation!</Text>
        </View>
      ) : (
        <FlatList
          data={[...grouped].reverse()}
          inverted
          style={s.list}
          contentContainerStyle={s.listContent}
          keyExtractor={(item: any) => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: msg }) => {
            const mine = isMe(msg);
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                {!mine && <View style={{marginBottom:4}}><UserProfileLink userId={msg.senderId} name={msg.senderName ?? "Unknown"} /></View>}
                <View style={[s.bubble, mine ? s.myBubble : s.theirBubble]}>
                  <Text style={mine ? s.myText : s.theirText}>{msg.content}</Text>
                  {msg.queued && <Text style={{ color: "#fde68a", fontSize: 10, marginTop: 3 }}>Saved offline · waiting to send</Text>}
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
          placeholder="Type a message..."
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="send"
          onSubmitEditing={Platform.OS !== "web" ? handleSend : undefined}
        />
        <TouchableOpacity style={s.sendBtn} onPress={handleSend} disabled={!text.trim() || selectedGroupId == null}>
          <Feather name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
