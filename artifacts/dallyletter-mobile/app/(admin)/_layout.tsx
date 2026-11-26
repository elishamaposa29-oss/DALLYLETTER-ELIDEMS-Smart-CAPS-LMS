import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View, Text, Image } from "react-native";
import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AdminTabLayout() {
  const colors = useColors();
  const { user, token, isLoading } = useAuth();
  const [unread,setUnread]=useState({messages:0,groups:0,activity:0,groupActivity:0});
  useEffect(()=>{if(!token||!user?.id){setUnread({messages:0,groups:0,activity:0,groupActivity:0});return;}let active=true;const refresh=async()=>{try{const [m,n]=await Promise.all([fetch(getApiUrl("/api/messages/unread-summary"),{headers:{Authorization:"Bearer "+token},cache:"no-store"}),fetch(getApiUrl("/api/notifications"),{headers:{Authorization:"Bearer "+token},cache:"no-store"})]);if(!m.ok||!n.ok)return;const [messages,notifications]=await Promise.all([m.json(),n.json()]);if(active)setUnread({messages:Number(messages.messageUnread||0),groups:Number(messages.groupUnread||0),activity:Array.isArray(notifications)?notifications.filter((item:any)=>!item.isRead).length:0,groupActivity:Array.isArray(notifications)?notifications.filter((item:any)=>!item.isRead&&(String(item.type||"").toLowerCase().includes("group")||String(item.link||"").toLowerCase().includes("group"))).length:0});}catch{/* Preserve last known counts during connectivity loss. */}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer);};},[token,user?.id]);
  const unreadIcon=(name:"bell"|"grid",color:string,size:number,count:number)=><View style={{position:"relative"}}><Feather name={name} size={size} color={color}/>{count>0&&<View style={{position:"absolute",right:-13,top:-9,flexDirection:"row",alignItems:"center",gap:2,backgroundColor:"#0B1E3A",borderWidth:1.5,borderColor:"#C9A227",shadowColor:"#F2D98C",shadowOpacity:0.85,shadowRadius:5,elevation:4,borderRadius:7,paddingHorizontal:3,paddingVertical:1}} accessibilityRole="text" accessibilityLabel={count+" unread"}><Image source={require("../../assets/images/icon.png")} style={{width:10,height:10,borderRadius:2}}/><Text style={{color:"#FFD700",fontSize:8,fontWeight:"900"}}>{count>99?"99+":count}</Text></View>}</View>;
  const role = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const allowed = ["owner", "admin", "platform_owner"].includes(role);
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  if (isLoading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (!allowed) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.primary,
          borderTopWidth: 0,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} />
          ),
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: "Users", tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ href: ["owner", "platform_owner"].includes(role) ? undefined : null, title: "Payments", tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts", tabBarIcon: ({ color, size }) => unreadIcon("bell",color,size,unread.activity) }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => unreadIcon("grid",color,size,unread.groups+unread.groupActivity) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }} />
      <Tabs.Screen name="tools" options={{ href: null }} />
      <Tabs.Screen name="teacher-cv-workspace" options={{ href: null }} />
      <Tabs.Screen name="transfer-requests" options={{ href: null }} />
      <Tabs.Screen name="academic-reports" options={{ href: null }} />
      <Tabs.Screen name="manager-permissions" options={{ href: null }} />
      <Tabs.Screen name="qualifications" options={{ href: null }} />
      <Tabs.Screen name="academic" options={{ href: null }} />
      <Tabs.Screen name="break" options={{ href: null }} />
    </Tabs>
  );
}
