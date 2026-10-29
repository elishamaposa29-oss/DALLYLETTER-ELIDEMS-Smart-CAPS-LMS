import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{token?: string | string[]}>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token || "";
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [detailsLoading,setDetailsLoading]=useState(true);
  const [detailsValid,setDetailsValid]=useState(false);
  const [requiresSecurityAnswer,setRequiresSecurityAnswer]=useState(false);
  const [securityQuestion,setSecurityQuestion]=useState("");
  const [securityAnswer,setSecurityAnswer]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    if(!/^[a-f0-9]{64}$/i.test(token)){setDetailsLoading(false);setError("This reset link is missing or invalid. Request a new link.");return;}
    fetch(getApiUrl("/api/auth/password-reset/details?token="+encodeURIComponent(token)))
      .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"This reset link is invalid or expired.");return data;})
      .then(data=>{if(!active)return;setRequiresSecurityAnswer(Boolean(data.requiresSecurityAnswer));setSecurityQuestion(String(data.securityQuestion||""));setDetailsValid(true);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not validate this reset link.");})
      .finally(()=>{if(active)setDetailsLoading(false);});
    return()=>{active=false;};
  },[token]);
  const submit=async()=>{
    setMessage("");setError("");
    if(!/^[a-f0-9]{64}$/i.test(token)){setError("This reset link is missing or invalid. Request a new link.");return;}
    if(password.length<8){setError("Use at least 8 characters for your new password.");return;}
    if(password!==confirm){setError("The passwords do not match.");return;}
    if(requiresSecurityAnswer&&!securityAnswer.trim()){setError("Answer your saved security question to continue backup-email recovery.");return;}
    if(detailsLoading||!detailsValid){setError("Dallyletter could not validate this reset link. Request a fresh link and try again.");return;}
    setBusy(true);
    try{
      const response=await fetch(getApiUrl("/api/auth/password-reset/confirm"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,newPassword:password,securityAnswer})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"This reset link could not be used.");
      setMessage(data.message||"Password reset successfully. Sign in with your new password.");
      setPassword("");setConfirm("");setSecurityAnswer("");
    }catch(e){setError(e instanceof Error?e.message:"Please request a new reset link and try again.");}
    finally{setBusy(false);}
  };
  return <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={[s.page,{paddingTop:insets.top+24,backgroundColor:colors.background}]}>
    <TouchableOpacity onPress={()=>router.replace("/login")} style={s.back}><Feather name="arrow-left" size={18} color={colors.primary}/><Text style={{color:colors.primary,fontWeight:"600"}}>Back to sign in</Text></TouchableOpacity>
    <View style={s.card}>
      <View style={[s.icon,{backgroundColor:colors.secondary}]}><Feather name="shield" size={28} color={colors.primary}/></View>
      <Text style={[s.title,{color:colors.foreground}]}>Choose a new password</Text>
      <Text style={[s.copy,{color:colors.mutedForeground}]}>Reset links expire after 30 minutes and can only be used once.</Text>
      {detailsLoading?<View style={s.status}><ActivityIndicator color={colors.primary}/><Text style={{color:colors.mutedForeground,marginLeft:8}}>Checking reset link…</Text></View>:null}
      {requiresSecurityAnswer?<View style={[s.securityCard,{borderColor:colors.border,backgroundColor:colors.card}]}><Text style={{fontWeight:"700",color:colors.foreground,marginBottom:6}}>Backup-email security check</Text><Text style={{color:colors.mutedForeground,marginBottom:10}}>{securityQuestion||"Answer the security question you created in Profile Hub."}</Text><TextInput value={securityAnswer} onChangeText={setSecurityAnswer} autoComplete="off" placeholder="Your saved answer" placeholderTextColor={colors.mutedForeground} editable={!busy} style={[s.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.background}]}/></View>:null}
      <Text style={[s.label,{color:colors.foreground}]}>New password</Text>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!busy&&!detailsLoading} placeholder="At least 8 characters" placeholderTextColor={colors.mutedForeground} style={[s.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.card}]}/>
      <Text style={[s.label,{color:colors.foreground}]}>Confirm new password</Text>
      <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" editable={!busy&&!detailsLoading} placeholder="Re-enter password" placeholderTextColor={colors.mutedForeground} style={[s.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.card}]}/>
      {busy?<View style={s.status}><ActivityIndicator color={colors.primary}/><Text style={{color:colors.mutedForeground,marginLeft:8}}>Updating password…</Text></View>:null}
      {message ? <Text style={s.success}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {message ? <TouchableOpacity onPress={()=>router.replace("/login")} style={[s.button,{backgroundColor:colors.primary}]}><Text style={s.buttonText}>Go to sign in</Text></TouchableOpacity> : <TouchableOpacity onPress={()=>void submit()} disabled={busy||detailsLoading||!detailsValid} style={[s.button,{backgroundColor:colors.primary,opacity:busy||detailsLoading||!detailsValid?0.7:1}]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Update password</Text>}</TouchableOpacity>}
    </View>
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({page:{flex:1,paddingHorizontal:24},back:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:12},card:{marginTop:36},icon:{width:56,height:56,borderRadius:16,alignItems:"center",justifyContent:"center",marginBottom:20},title:{fontSize:26,fontWeight:"800",marginBottom:10},copy:{fontSize:15,lineHeight:22,marginBottom:24},status:{flexDirection:"row",alignItems:"center",marginBottom:12,padding:10,borderRadius:10,backgroundColor:"#eff6ff"},securityCard:{borderWidth:1,borderRadius:12,padding:12,marginBottom:14},label:{fontSize:13,fontWeight:"700",marginBottom:8},input:{height:50,borderWidth:1,borderRadius:12,paddingHorizontal:14,marginBottom:14},button:{height:50,borderRadius:12,alignItems:"center",justifyContent:"center",marginTop:8},buttonText:{color:"#fff",fontSize:15,fontWeight:"700"},success:{color:"#15803d",marginBottom:12,lineHeight:20},error:{color:"#dc2626",marginBottom:12,lineHeight:20}});
