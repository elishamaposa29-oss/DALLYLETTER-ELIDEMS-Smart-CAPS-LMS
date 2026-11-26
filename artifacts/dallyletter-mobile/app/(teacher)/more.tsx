import FeatureHub from "@/components/FeatureHub";
import BreakElidemsShortcut from "@/components/BreakElidemsShortcut";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
export default function TeacherMore() { return <View style={{flex:1}}><BreakElidemsShortcut /><Pressable onPress={()=>router.push("/operations")} style={{margin:12,padding:14,borderRadius:12,backgroundColor:"#0f2a5a"}}><Text style={{color:"#fff",fontWeight:"800",textAlign:"center"}}>Attendance · Permissions · Communities · Notifications</Text></Pressable><View style={{flex:1}}><FeatureHub /></View></View>; }
