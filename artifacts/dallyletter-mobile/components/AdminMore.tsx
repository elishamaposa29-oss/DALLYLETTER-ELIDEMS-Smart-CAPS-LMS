import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import FeatureHub from "@/components/FeatureHub";
import BreakElidemsShortcut from "@/components/BreakElidemsShortcut";

export default function AdminMore() {
  const colors = useColors();
  const { user } = useAuth();
  const normalizedRole = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const isOwner = ["owner", "platform_owner"].includes(normalizedRole);
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open class and learning operations" onPress={()=>router.push("/operations" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
      <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="calendar" size={21} color={colors.primary}/></View>
      <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Class & learning operations</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Attendance registers, permissions, communities and notification settings</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
    </TouchableOpacity>
    {isOwner ? <TouchableOpacity accessibilityRole="button" onPress={()=>router.push({pathname:"/(admin)/tools",params:{section:"command-center"}} as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
      <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="activity" size={21} color={colors.primary}/></View>
      <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Owner Command Centre</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Health, alerts, settings, AI, safety and finance</Text></View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
    </TouchableOpacity> : null}
    {isOwner ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Teacher CV and survey approvals" onPress={()=>router.push("/(admin)/teacher-cv-workspace" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
      <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="file-check" size={21} color={colors.primary}/></View>
      <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Teacher CV & survey approvals</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Review evidence, qualifications, decisions, history and applicant messages</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
    </TouchableOpacity> : null}
    {isOwner ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Achievements and badges" onPress={()=>router.push({pathname:"/(admin)/tools",params:{section:"achievements"}} as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
      <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#f59e0b20"}}><Feather name="award" size={21} color="#d97706"/></View>
      <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Achievements & Badges</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Create learner badges and award achievements</Text></View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
    </TouchableOpacity> : null}
    <BreakElidemsShortcut />
    <View style={{flex:1}}><FeatureHub /></View>
  </View>;
}
