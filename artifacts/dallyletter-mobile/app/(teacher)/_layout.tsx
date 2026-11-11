import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
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
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
      <Tabs.Screen name="break" options={{ href: null }} />
    </Tabs>
  );
}
