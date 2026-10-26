import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import FeatureHub from "@/components/FeatureHub";
import BreakElidemsShortcut from "@/components/BreakElidemsShortcut";

export default function ManagerMore(){
 const colors=useColors();
 return <View style={{flex:1,backgroundColor:colors.background}}>
  <TouchableOpacity accessibilityRole="button" onPress={()=>router.push("/(manager)/home" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="bar-chart-2" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Manager dashboard</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Teachers, learners, prefects, alerts and reports</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Manager account and security" onPress={()=>router.push("/(manager)/profile" as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
   <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="user" size={21} color={colors.primary}/></View>
   <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Account & security</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Edit profile, recovery options and password</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
  </TouchableOpacity>
  <BreakElidemsShortcut />
  <View style={{flex:1}}><FeatureHub /></View>
 </View>;
}
