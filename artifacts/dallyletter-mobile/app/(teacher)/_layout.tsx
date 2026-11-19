import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View, Text, Image } from "react-native";
import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function TeacherTabLayout() {
  const colors = useColors();
  const { user, token, isLoading } = useAuth();
  const allowed = String(user?.role || "").toLowerCase() === "teacher";
  const managerAccount = ["manager","senior_manager","junior_manager"].includes(String(user?.role||"").toLowerCase()) || Boolean((user as any)?.isManager);
  const [canViewRecordbook,setCanViewRecordbook]=useState(false);
  const [unread,setUnread]=useState({messages:0,groups:0,groupActivity:0});
  useEffect(()=>{if(!token||!user?.id){setUnread({messages:0,groups:0,groupActivity:0});return;}let active=true;const refresh=async()=>{try{const [m,n]=await Promise.all([fetch(getApiUrl("/api/messages/unread-summary"),{headers:{Authorization:"Bearer "+token},cache:"no-store"}),fetch(getApiUrl("/api/notifications"),{headers:{Authorization:"Bearer "+token},cache:"no-store"})]);if(!m.ok||!n.ok)return;const [messages,notifications]=await Promise.all([m.json(),n.json()]);if(active)setUnread({messages:Number(messages.messageUnread||0),groups:Number(messages.groupUnread||0),groupActivity:Array.isArray(notifications)?notifications.filter((item:any)=>!item.isRead&&(String(item.type||"").toLowerCase().includes("group")||String(item.link||"").toLowerCase().includes("group"))).length:0});}catch{/* Preserve last known counts during connectivity loss. */}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer);};},[token,user?.id]);
  const unreadIcon=(name:"message-circle"|"grid",color:string,size:number,count:number)=><View style={{position:"relative"}}><Feather name={name} size={size} color={color}/>{count>0&&<View style={{position:"absolute",right:-13,top:-9,flexDirection:"row",alignItems:"center",gap:2,backgroundColor:"#0B1E3A",borderWidth:1.5,borderColor:"#FFD700",borderRadius:7,paddingHorizontal:3,paddingVertical:1}} accessibilityRole="text" accessibilityLabel={count+" unread"}><Image source={require("../../assets/images/icon.png")} style={{width:10,height:10,borderRadius:2}}/><Text style={{color:"#FFD700",fontSize:8,fontWeight:"900"}}>{count>99?"99+":count}</Text></View>}</View>;
  useEffect(()=>{if(!managerAccount){setCanViewRecordbook(true);return;}if(!token){setCanViewRecordbook(false);return;}let active=true;fetch(getApiUrl("/api/manager-permissions/me"),{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Manager permissions unavailable");if(active)setCanViewRecordbook(data.permissions?.["recordbook.view"]===true);}).catch(()=>{if(active)setCanViewRecordbook(false);});return()=>{active=false;}},[managerAccount,token,user?.id]);
  const restrictedTeacher = allowed && ["draft","pending_review","rejected_pending_conversion"].includes(String((user as any)?.teacherApplicationStatus||"").toLowerCase());
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (restrictedTeacher) return <Redirect href="/profile-hub" />;
  if (!allowed) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border }]} />
          ),
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="lessons" options={{ title: "Lessons", tabBarIcon: ({ color, size }) => <Feather name="book" size={size} color={color} /> }} />
      <Tabs.Screen name="work" options={{ href: managerAccount&&!canViewRecordbook?null:undefined, title: "Marking", tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }} />
      <Tabs.Screen name="classes" options={{ title: "Classes", tabBarIcon: ({ color, size }) => <Feather name="video" size={size} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: ({ color, size }) => unreadIcon("message-circle",color,size,unread.messages) }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => unreadIcon("grid",color,size,unread.groups+unread.groupActivity) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
      <Tabs.Screen name="break" options={{ href: null }} />
    </Tabs>
  );
}
