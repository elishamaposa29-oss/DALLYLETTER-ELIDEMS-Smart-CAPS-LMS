import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    setMessage(""); setError("");
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) { setError("Enter a valid email address."); return; }
    setBusy(true);setElapsed(0);
    const started=Date.now();
    const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),250);
    try {
      const response = await fetch(getApiUrl("/api/auth/password-reset/request"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalized }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Password recovery is temporarily unavailable.");
      setMessage(data.message || "If an account matches that email, recovery instructions will be sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again later."); }
    finally { clearInterval(timer);setElapsed(Math.floor((Date.now()-started)/1000));setBusy(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.page,{paddingTop:insets.top+24,backgroundColor:colors.background}]}>
    <TouchableOpacity onPress={() => router.replace("/login")} style={s.back}><Feather name="arrow-left" size={18} color={colors.primary}/><Text style={{color:colors.primary,fontWeight:"600"}}>Back to sign in</Text></TouchableOpacity>
    <View style={s.card}>
      <View style={[s.icon,{backgroundColor:colors.secondary}]}><Feather name="key" size={28} color={colors.primary}/></View>
      <Text style={[s.title,{color:colors.foreground}]}>Reset your password</Text>
      <Text style={[s.copy,{color:colors.mutedForeground}]}>Enter the email address on your account or a previously verified recovery email. If it matches an account, we’ll send a secure reset link.</Text>
      <Text style={[s.label,{color:colors.foreground}]}>Email address</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.mutedForeground} style={[s.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.card}]}/>
      {busy?<View accessibilityRole="text" style={s.status}><ActivityIndicator color={colors.primary}/><Text style={{color:colors.mutedForeground,marginLeft:8}}>Sending recovery email… {elapsed}s</Text></View>:null}
      {message ? <Text accessibilityRole="text" style={s.success}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <TouchableOpacity onPress={() => void submit()} disabled={busy} style={[s.button,{backgroundColor:colors.primary,opacity:busy?0.7:1}]}>
        {busy ? <ActivityIndicator color="#fff"/> : <Text style={s.buttonText}>Send reset link</Text>}
      </TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({page:{flex:1,paddingHorizontal:24},back:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:12},card:{marginTop:28},brandRow:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:24},brandMark:{width:48,height:48,borderRadius:14,backgroundColor:"#0A1931",alignItems:"center",justifyContent:"center"},brandLetter:{color:"#FFF8E1",fontSize:22,fontWeight:"900"},brandName:{fontSize:16,fontWeight:"800"},status:{flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:"#bfdbfe",backgroundColor:"#eff6ff",padding:12,borderRadius:10,marginBottom:12},icon:{width:56,height:56,borderRadius:16,alignItems:"center",justifyContent:"center",marginBottom:20},title:{fontSize:26,fontWeight:"800",marginBottom:10},copy:{fontSize:15,lineHeight:22,marginBottom:24},label:{fontSize:13,fontWeight:"700",marginBottom:8},input:{height:50,borderWidth:1,borderRadius:12,paddingHorizontal:14,marginBottom:14},button:{height:50,borderRadius:12,alignItems:"center",justifyContent:"center",marginTop:8},buttonText:{color:"#fff",fontSize:15,fontWeight:"700"},success:{color:"#15803d",marginBottom:12,lineHeight:20},error:{color:"#dc2626",marginBottom:12,lineHeight:20}});
