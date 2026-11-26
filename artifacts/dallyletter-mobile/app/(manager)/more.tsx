import ManagerMore from "@/components/ManagerMore";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
export default function ManagerMoreScreen() { return <View style={{flex:1}}><Pressable onPress={()=>router.push("/operations")} style={{margin:12,padding:14,borderRadius:12,backgroundColor:"#0f2a5a"}}><Text style={{color:"#fff",fontWeight:"800",textAlign:"center"}}>Attendance · Permission requests · Communities</Text></Pressable><View style={{flex:1}}><ManagerMore /></View></View>; }
