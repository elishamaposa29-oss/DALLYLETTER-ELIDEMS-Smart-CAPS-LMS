import { Feather } from "@expo/vector-icons";
import { getApiUrl, useBlockUser, useListUsers, usePromoteUser } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminUsers() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [adminActionUserId, setAdminActionUserId] = useState<number | null>(null);
  const { data: users, isLoading, refetch } = useListUsers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "student" | "teacher">("all");

  const blockMutation = useBlockUser({ mutation: { onSuccess: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); refetch(); } } });
  const promoteMutation = usePromoteUser({ mutation: { onSuccess: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); refetch(); } } });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);

  const filtered = users?.filter((u: any) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filter === "all" || u.role === filter;
    return matchSearch && matchRole && u.role !== "owner";
  }) ?? [];

  const handleBlock = (userId: number, isBlocked: boolean) => {
    Alert.alert(isBlocked ? "Unblock User" : "Block User", `Are you sure?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: isBlocked ? "Unblock" : "Block",
        style: "destructive",
        onPress: () => blockMutation.mutate({ id: userId, data: { isBlocked: !isBlocked } }),
      },
    ]);
  };

  const handleTogglePrefect = (userId: number, isPrefect: boolean) => {
    promoteMutation.mutate({ id: userId, data: { isPrefect: !isPrefect } });
  };

  const ownerAction = async (userId:number, path:string, body:Record<string,unknown>, successMessage:string) => {
    setAdminActionUserId(userId);
    try {
      const response=await fetch(getApiUrl(path),{method:"PATCH",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result?.error||`Request failed (${response.status})`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
      Alert.alert("User updated",successMessage);
    } catch(e) {
      Alert.alert("Could not update user",e instanceof Error?e.message:"Please retry.");
    } finally { setAdminActionUserId(null); }
  };

  const handleToggleSuspend = (userId:number,isSuspended:boolean) => {
    Alert.alert(isSuspended?"Lift suspension":"Suspend user",isSuspended?"Restore normal access for this account?":"Suspension allows login but limits access. Continue?",[
      {text:"Cancel",style:"cancel"},
      {text:isSuspended?"Lift suspension":"Suspend",style:isSuspended?"default":"destructive",onPress:()=>void ownerAction(userId,`/api/users/${userId}/suspend`,{isSuspended:!isSuspended},isSuspended?"Suspension lifted.":"User suspended.")},
    ]);
  };

  const handleToggleManager = (userId:number,isManager:boolean) => {
    Alert.alert(isManager?"Remove manager status":"Promote to manager",isManager?"Remove manager dashboard access?":"Grant this account manager dashboard access?",[
      {text:"Cancel",style:"cancel"},
      {text:isManager?"Remove":"Promote",style:isManager?"destructive":"default",onPress:()=>void ownerAction(userId,`/api/users/${userId}/promote-manager`,{isManager:!isManager},isManager?"Manager access removed.":"Manager access granted.")},
    ]);
  };

  const roleColor: Record<string, string> = { student: "#3b82f6", teacher: "#8b5cf6", owner: "#D4AF37" };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 16,
      paddingHorizontal: 20,
    },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff", marginBottom: 12 },
    searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 12, height: 40, marginBottom: 12 },
    searchInput: { flex: 1, fontSize: 14, color: "#ffffff", fontFamily: "Inter_400Regular", marginLeft: 8 },
    filterRow: { flexDirection: "row", gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
    filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },
    filterTextActive: { color: colors.primary },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: 12 },
    info: { flex: 1 },
    userName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    roleText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    actions: { flexDirection: "row", gap: 8 },
    actionBtn: {
      flex: 1,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    actionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    blockedBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fef2f2", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
    blockedText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#dc2626" },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>User Management</Text>
        <View style={s.searchWrap}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
          <TextInput style={s.searchInput} placeholder="Search users..." placeholderTextColor="rgba(255,255,255,0.5)" value={search} onChangeText={setSearch} />
        </View>
        <View style={s.filterRow}>
          {(["all", "student", "teacher"] as const).map((f) => (
            <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        style={s.list}
        contentContainerStyle={s.listContent}
        keyExtractor={(item: any) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="users" size={48} color={colors.border} />
            <Text style={s.emptyText}>{isLoading ? "Loading..." : "No users found"}</Text>
          </View>
        }
        renderItem={({ item: u }) => {
          const col = roleColor[u.role] ?? "#6b7280";
          return (
            <View style={s.card}>
              {u.isBlocked && (
                <View style={s.blockedBanner}>
                  <Feather name="slash" size={11} color="#dc2626" />
                  <Text style={s.blockedText}>BLOCKED</Text>
                </View>
              )}
              {(u as any).isSuspended && !u.isBlocked ? <View style={[s.blockedBanner,{backgroundColor:"#fffbeb"}]}><Feather name="pause-circle" size={11} color="#a16207"/><Text style={[s.blockedText,{color:"#a16207"}]}>SUSPENDED · LIMITED ACCESS</Text></View>:null}
              <View style={s.cardTop}>
                <View style={[s.avatar, { backgroundColor: col + "20" }]}>
                  <Feather name="user" size={20} color={col} />
                </View>
                <View style={s.info}>
                  <Text style={s.userName} numberOfLines={1}>
                    {u.name}
                    {u.isPrefect ? " ⭐" : ""}
                  </Text>
                  <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                </View>
                <View style={[s.roleBadge, { backgroundColor: col + "20" }]}>
                  <Text style={[s.roleText, { color: col }]}>{u.role.toUpperCase()}</Text>
                </View>
              </View>
              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.actionBtn, { borderColor: u.isBlocked ? "#22c55e" : colors.destructive, backgroundColor: u.isBlocked ? "#f0fdf4" : "#fef2f2" }]}
                  onPress={() => handleBlock(u.id, u.isBlocked)}
                >
                  <Text style={[s.actionText, { color: u.isBlocked ? "#22c55e" : colors.destructive }]}>
                    {u.isBlocked ? "Unblock" : "Block"}
                  </Text>
                </TouchableOpacity>
                {u.role === "student" && (
                  <TouchableOpacity
                    style={[s.actionBtn, { borderColor: colors.accent, backgroundColor: u.isPrefect ? "#fffbeb" : colors.secondary }]}
                    onPress={() => handleTogglePrefect(u.id, u.isPrefect)}
                  >
                    <Text style={[s.actionText, { color: colors.primary }]}>
                      {u.isPrefect ? "Remove Prefect" : "Make Prefect"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.actionBtn,{borderColor:"#a16207",backgroundColor:(u as any).isSuspended?"#fffbeb":colors.secondary}]} disabled={adminActionUserId===u.id} onPress={()=>handleToggleSuspend(u.id,Boolean((u as any).isSuspended))}>
                  <Text style={[s.actionText,{color:(u as any).isSuspended?"#a16207":colors.foreground}]}>{adminActionUserId===u.id?"Saving…":(u as any).isSuspended?"Unsuspend":"Suspend"}</Text>
                </TouchableOpacity>
                {u.role==="teacher" && <TouchableOpacity style={[s.actionBtn,{borderColor:"#7c3aed",backgroundColor:u.isManager?"#f3e8ff":colors.secondary}]} disabled={adminActionUserId===u.id} onPress={()=>handleToggleManager(u.id,Boolean(u.isManager))}>
                  <Text style={[s.actionText,{color:u.isManager?"#7c3aed":colors.foreground}]}>{u.isManager?"Remove manager":"Make manager"}</Text>
                </TouchableOpacity>}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
