import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import FeatureHub from "@/components/FeatureHub";
import BreakElidemsShortcut from "@/components/BreakElidemsShortcut";

export default function ManagerMore(){
 const colors=useColors();
 const { token }=useAuth();
 const [canReviewCv,setCanReviewCv]=useState(false);
 const [canViewTransfers,setCanViewTransfers]=useState(false);
 useEffect(()=>{let active=true;if(!token){setCanReviewCv(false);setCanViewTransfers(false);return;}void fetch(getApiUrl("/api/manager-permissions/me"),{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async response=>{const data=await response.json().catch(()=>({}));if(active){setCanReviewCv(response.ok&&data.permissions?.["teacher_cv.view"]===true);setCanViewTransfers(response.ok&&data.permissions?.["transfers.view"]===true);}}).catch(()=>{if(active){setCanReviewCv(false);setCanViewTransfers(false);}});return()=>{active=false;}},[token]);
 return <View style={{flex:1,backgroundColor:colors.background}}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open class and learning operations" onPress={()=>router.push("/operations" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="calendar" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Class & learning operations</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Attendance registers, permissions, communities and notification settings</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  <TouchableOpacity accessibilityRole="button" onPress={()=>router.push("/(manager)/home" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="bar-chart-2" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Manager dashboard</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Teachers, learners, prefects, alerts and reports</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  {canViewTransfers ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Review transfer letter requests" onPress={()=>router.push("/(manager)/transfer-requests" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="file-text" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Transfer letter requests</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Review original forms, signatures, decisions and approved PDFs</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity> : null}
  {canReviewCv ? <>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Teacher CV and survey approvals" onPress={()=>router.push("/(manager)/teacher-cv-workspace" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="file-text" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Teacher CV & survey approvals</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Available only with Owner-granted review permissions</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  </> : null}
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Manager account and security" onPress={()=>router.push("/(manager)/profile" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="user" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Account & security</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Edit profile, recovery options and password</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  <BreakElidemsShortcut />
  <View style={{flex:1}}><FeatureHub /></View>
 </View>;
}
