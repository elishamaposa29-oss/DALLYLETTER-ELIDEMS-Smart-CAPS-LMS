import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ProfileAvatarEditor } from "@/components/ProfileAvatarEditor";
import { ProfileDetailsEditor } from "@/components/ProfileDetailsEditor";

export default function ManagerProfile() {
  const colors=useColors();
  const insets=useSafeAreaInsets();
  const {user,logout}=useAuth();
  const top=insets.top+(Platform.OS==="web"?67:0);
  const signOut=()=>Alert.alert("Sign out","Sign out of the manager account?",[
    {text:"Cancel",style:"cancel"},
    {text:"Sign out",style:"destructive",onPress:()=>{void logout().finally(()=>router.replace("/login"));}},
  ]);
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <View style={{paddingTop:top+12,paddingHorizontal:18,paddingBottom:18,backgroundColor:colors.primary,flexDirection:"row",alignItems:"center",gap:12}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to manager dashboard" onPress={()=>router.replace("/(manager)/home" as any)} style={{padding:8}}><Feather name="arrow-left" size={20} color="#fff"/></TouchableOpacity>
      <View style={{flex:1}}><Text style={{fontSize:21,fontWeight:"800",color:"#fff"}}>Account & security</Text><Text style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:3}}>Profile, recovery and password settings</Text></View>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={{alignItems:"center",padding:18,borderRadius:14,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,marginBottom:16}}>
        <ProfileAvatarEditor />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open your Profile Hub" onPress={()=>router.push("/profile-hub" as any)}><Text style={{fontSize:19,fontWeight:"800",color:colors.foreground,marginTop:10}}>{user?.name||"Manager"}</Text></TouchableOpacity>
        <Text style={{fontSize:13,color:colors.mutedForeground,marginTop:3}}>{user?.email}</Text>
        <Text style={{fontSize:12,fontWeight:"700",color:colors.primary,marginTop:8}}>Manager account</Text>
      </View>
      <ProfileDetailsEditor />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Profile Hub" onPress={()=>router.push("/profile-hub" as any)} style={{marginHorizontal:16,marginTop:12,marginBottom:8,padding:13,borderRadius:12,backgroundColor:colors.secondary,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8}}><Feather name="user" size={17} color={colors.primary}/><Text style={{color:colors.primary,fontWeight:"700"}}>Open Profile Hub</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={signOut} style={{marginHorizontal:16,marginBottom:24,padding:14,borderRadius:12,borderWidth:1,borderColor:"#fecaca",backgroundColor:"#fef2f2",flexDirection:"row",justifyContent:"center",alignItems:"center",gap:8}}>
        <Feather name="log-out" size={18} color="#dc2626"/><Text style={{fontSize:14,fontWeight:"700",color:"#dc2626"}}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({content:{paddingTop:16,paddingBottom:40}});
