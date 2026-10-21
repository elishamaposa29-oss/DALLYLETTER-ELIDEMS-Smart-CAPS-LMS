import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function BreakElidemsShortcut(){
 const colors=useColors();const {user}=useAuth();
 const role=String(user?.role||"").toLowerCase().replace(/[ -]+/g,"_");
 const route=["owner","admin","platform_owner"].includes(role)?"/(admin)/break":["manager","senior_manager"].includes(role)||(user as any)?.isManager?"/(manager)/break":role==="teacher"?"/(teacher)/break":"/(student)/break";
 return <TouchableOpacity accessibilityRole="button" onPress={()=>router.push(route as any)} style={{marginHorizontal:14,marginTop:8,marginBottom:4,padding:12,borderRadius:12,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",gap:11}}>
  <View style={{width:40,height:40,borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#f59e0b20"}}><Feather name="star" size={20} color="#d97706"/></View>
  <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:"700",color:colors.foreground}}>BREAK-ELIDEMS</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:3}}>Community sessions, volunteering and live events</Text></View>
  <Feather name="chevron-right" size={18} color={colors.mutedForeground}/>
 </TouchableOpacity>;
}
