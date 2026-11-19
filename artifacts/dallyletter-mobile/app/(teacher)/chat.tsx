import { FeedbackMessage } from "@/components/FeedbackMessage";
import { Feather } from "@expo/vector-icons";
import { useListMessages, useSendMessage, useListStudyGroups, getApiUrl } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { Platform, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image, Modal } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
type ChatGroup = { id: number; name: string; description?: string | null; subject?: string; creatorName?: string; memberCount?: number; createdAt?: string; isMember?: boolean; members?: Array<{ id: number; name?: string; role?: string; isPrefect?: boolean }> };
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserProfileLink } from "@/components/UserProfileLink";

export default function TeacherChat() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [text, setText] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [unreadGroups, setUnreadGroups] = useState<Array<{id:number;unread:number}>>([]);
  useEffect(() => {
    if (!token || !user?.id) { setUnreadGroups([]); return; }
    let active = true;
    const refreshUnread = async () => {
      try {
        const response = await fetch(getApiUrl("/api/messages/unread-summary"), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setUnreadGroups(Array.isArray(data.groups) ? data.groups : []);
      } catch { /* Preserve the last known counts during a temporary outage. */ }
    };
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [token, user?.id]);
  const { data: groupData, isLoading: groupsLoading } = useListStudyGroups();
  const groups = (groupData ?? []) as unknown as ChatGroup[];
  const joinedGroups = groups.filter(group => group.isMember ?? group.members?.some(member => member.id === user?.id));
  const selectedGroup = joinedGroups.find(group => group.id === selectedGroupId);
  const [groupHubOpen, setGroupHubOpen] = useState(false);
  const { data: messages, refetch } = useListMessages({ groupId: selectedGroupId }, { query: { enabled: selectedGroupId != null, refetchInterval: 5000 } as any });
  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => { setText(""); setNotice(""); refetch(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
      onError: (error: unknown) => { setNotice(error instanceof Error ? error.message : "Message could not be sent."); },
    },
  });

  useEffect(() => { if (joinedGroups.length > 0 && !joinedGroups.some(group => group.id === selectedGroupId)) setSelectedGroupId(joinedGroups[0].id); }, [joinedGroups, selectedGroupId]);

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottom = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleSend = () => {
    if (!text.trim()) return;
    if (selectedGroupId == null) { setNotice("Join a study group before sending a group message."); return; }
    setNotice("");
    sendMutation.mutate({ data: { content: text.trim(), type: "text", groupId: selectedGroupId } });
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
    groupStrip: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    groupChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  });

  const msgs = messages ?? [];
  const isMe = (msg: any) => msg.senderId === user?.id;

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <TouchableOpacity style={s.avatar} onPress={() => selectedGroup && setGroupHubOpen(true)} disabled={!selectedGroup} accessibilityRole="button" accessibilityLabel={selectedGroup ? "Open " + selectedGroup.name + " group hub" : "No group selected"}>
          <Feather name="users" size={18} color="#ffffff" />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Class Chat</Text>
          <Text style={s.headerSub}>{selectedGroup?.name || (groupsLoading ? "Loading groups…" : "Select a joined group")}</Text>
        </View>
      </View>

      <View style={s.groupStrip}><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{joinedGroups.map(group => <TouchableOpacity key={group.id} onPress={() => { setSelectedGroupId(group.id); setNotice(""); }} style={[s.groupChip,{borderColor:selectedGroupId===group.id?colors.primary:colors.border,backgroundColor:selectedGroupId===group.id?colors.primary:colors.card}]}><View style={{flexDirection:"row",alignItems:"center",gap:6}}><Text style={{color:selectedGroupId===group.id?"#fff":colors.foreground,fontWeight:"700",fontSize:12}}>{group.name}</Text>{(unreadGroups.find(item=>item.id===group.id)?.unread||0)>0&&<View style={{flexDirection:"row",alignItems:"center",gap:3,backgroundColor:"#0B1E3A",borderWidth:1.5,borderColor:"#C9A227",shadowColor:"#F2D98C",shadowOpacity:0.85,shadowRadius:5,elevation:4,borderRadius:7,paddingHorizontal:4,paddingVertical:2}} accessibilityRole="text" accessibilityLabel={(unreadGroups.find(item=>item.id===group.id)?.unread||0)+" unread group messages"}><Image source={require("../../assets/images/icon.png")} style={{width:12,height:12,borderRadius:3}}/><Text style={{color:"#FFD700",fontSize:9,fontWeight:"900"}}>{(unreadGroups.find(item=>item.id===group.id)?.unread||0)>99?"99+":unreadGroups.find(item=>item.id===group.id)?.unread}</Text></View>}</View></TouchableOpacity>)}{!groupsLoading&&joinedGroups.length===0?<Text style={{color:colors.mutedForeground,fontSize:12}}>No joined study groups. Join a group first.</Text>:null}</ScrollView></View>
      <FeedbackMessage message={notice} onDismiss={() => setNotice("")} />
      {msgs.length === 0 ? (
        <View style={s.emptyWrap}>
          <Feather name="message-circle" size={48} color={colors.border} />
          <Text style={s.emptyText}>{selectedGroupId == null ? "Choose a group to chat" : "No messages yet"}</Text>
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
                {!mine && <UserProfileLink userId={msg.senderId} name={msg.senderName ?? "Student"} compact />}
                <View style={[s.bubble, mine ? s.myBubble : s.theirBubble]}>
                  <Text style={mine ? s.myText : s.theirText}>{msg.content}</Text>
                  <View style={{flexDirection:"row",alignItems:"center",gap:6,marginTop:3}}><Text style={mine ? s.time : s.theirTime}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>{mine&&(((msg as any).readByUserIds?.length)||0)>0&&<Text style={{fontSize:9,fontWeight:"800",color:"#9A7020"}}>Seen by {(msg as any).readByUserIds.length} ✓✓</Text>}</View>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={groupHubOpen && Boolean(selectedGroup)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupHubOpen(false)}>
        <View style={{flex:1,backgroundColor:colors.background,paddingTop:insets.top+12}}>
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1,borderBottomColor:colors.border}}>
            <View style={{flex:1,paddingRight:12}}>
              <Text style={{fontSize:11,fontWeight:"800",letterSpacing:1.2,color:colors.mutedForeground}}>STUDY GROUP HUB</Text>
              <Text style={{fontSize:21,fontWeight:"900",color:colors.foreground}}>{selectedGroup?.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setGroupHubOpen(false)} accessibilityRole="button" accessibilityLabel="Close group hub" style={{padding:10,borderRadius:20,backgroundColor:colors.card}}><Feather name="x" size={20} color={colors.foreground}/></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{padding:20,gap:16}}>
            <View style={{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:18,padding:16,gap:8}}>
              <Text style={{fontSize:18,fontWeight:"800",color:colors.foreground}}>{selectedGroup?.name}</Text>
              <Text style={{fontSize:13,color:colors.mutedForeground}}>{selectedGroup?.subject || "Learning community"} · {selectedGroup?.memberCount ?? selectedGroup?.members?.length ?? 0} members</Text>
              <Text style={{fontSize:14,lineHeight:21,color:colors.foreground}}>{selectedGroup?.description?.trim() || "This group has not added a description yet."}</Text>
              <Text style={{fontSize:12,color:colors.mutedForeground}}>Created by {selectedGroup?.creatorName || "Group creator"}{selectedGroup?.createdAt ? " · " + new Date(selectedGroup.createdAt).toLocaleDateString() : ""}</Text>
            </View>
            <View style={{gap:10}}>
              <Text style={{fontSize:16,fontWeight:"800",color:colors.foreground}}>Members ({selectedGroup?.members?.length ?? 0})</Text>
              {(selectedGroup?.members || []).map(member => <View key={member.id} style={{flexDirection:"row",alignItems:"center",gap:12,padding:12,borderRadius:14,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}}>
                <View style={{width:36,height:36,borderRadius:18,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"}}><Feather name="user" size={16} color="#fff"/></View>
                <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:"700",color:colors.foreground}}>{member.name || "Group member"}</Text><Text style={{fontSize:11,color:colors.mutedForeground}}>{member.role || "Member"}{member.isPrefect ? " · Prefect" : ""}</Text></View>
              </View>)}
              {(!selectedGroup?.members || selectedGroup.members.length===0) && <Text style={{fontSize:13,color:colors.mutedForeground}}>Member details are not available.</Text>}
            </View>
            <TouchableOpacity onPress={() => setGroupHubOpen(false)} style={{backgroundColor:colors.primary,borderRadius:14,padding:15,alignItems:"center"}}><Text style={{color:"#fff",fontWeight:"800"}}>Return to group chat</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
