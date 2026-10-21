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
  const isOwner = String(user?.role || "").toLowerCase() === "owner";
  return <View style={{flex:1,backgroundColor:colors.background}}>
    {isOwner ? <TouchableOpacity accessibilityRole="button" onPress={()=>router.push({pathname:"/(admin)/tools",params:{section:"command-center"}} as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:2,padding:13,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:12}}>
      <View style={{width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary+"18"}}><Feather name="activity" size={21} color={colors.primary}/></View>
      <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:"700",color:colors.foreground}}>Owner Command Centre</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Health, alerts, settings, AI, safety and finance</Text></View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
    </TouchableOpacity> : null}
    <BreakElidemsShortcut />
    <View style={{flex:1}}><FeatureHub /></View>
  </View>;
}
