import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export function ProfileDetailsEditor() {
  const {user,token,login,logout}=useAuth();
  const colors=useColors();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState(user?.name||"");
  const [phone,setPhone]=useState(user?.phone||"");
  const [grade,setGrade]=useState(user?.grade||"");
  const [subject,setSubject]=useState(user?.subject||"");
  const [busy,setBusy]=useState(false);
  const [primaryEmail,setPrimaryEmail]=useState("");
  const [emailChangePassword,setEmailChangePassword]=useState("");
  const [emailChangeBusy,setEmailChangeBusy]=useState(false);
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [recoveryEmail,setRecoveryEmail]=useState("");
  const [recoveryPhone,setRecoveryPhone]=useState("");
  const [securityQuestion,setSecurityQuestion]=useState("");
  const [securityAnswer,setSecurityAnswer]=useState("");
  const [recoveryCode,setRecoveryCode]=useState("");
  const [recoveryVerified,setRecoveryVerified]=useState(false);
  const [recoveryBusy,setRecoveryBusy]=useState(false);
  const isPrivileged=["owner","admin","platform_owner"].includes(String(user?.role||"").trim().toLowerCase());

  useEffect(()=>{
    let active=true;
    if(!user||!token||isPrivileged)return;
    fetch(getApiUrl("/api/users/me/recovery-profile"),{headers:{Authorization:"Bearer "+token}})
      .then(async r=>{if(!r.ok)throw new Error("Could not load recovery profile");return r.json();})
      .then(d=>{if(!active)return;setRecoveryEmail(d.recovery_email||"");setRecoveryPhone(d.recovery_phone||"");setSecurityQuestion(d.security_question||"");setRecoveryVerified(Boolean(d.recovery_email_verified_at));})
      .catch(()=>undefined);
    return()=>{active=false;};
  },[user?.id,token,isPrivileged]);

  const save=async()=>{
    if(!user||!token||busy)return;
    if(!name.trim()){Alert.alert("Name required","Enter your name before saving.");return;}
    setBusy(true);
    try{
      const response=await fetch(getApiUrl("/api/users/"+user.id),{method:"PATCH",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({name:name.trim(),phone:phone.trim()||null,grade:grade.trim()||null,subject:subject.trim()||null})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Could not update your profile.");
      await login({...user,...data},token);
      setOpen(false);
      Alert.alert("Profile saved","Your account details have been updated.");
    }catch(e){Alert.alert("Update failed",e instanceof Error?e.message:"Please try again.");}
    finally{setBusy(false);}
  };

  const saveRecovery=async()=>{
    if(!token||recoveryBusy)return;
    setRecoveryBusy(true);
    try{
      const r=await fetch(getApiUrl("/api/users/me/recovery-profile"),{method:"PATCH",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({recoveryEmail,recoveryPhone,securityQuestion,securityAnswer})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not save recovery options.");
      setSecurityAnswer("");
      setRecoveryVerified(Boolean(d.recoveryEmailVerified));
      Alert.alert("Recovery options saved",d.message||"Verify your alternate email before it can be used for password recovery.");
    }catch(e){Alert.alert("Recovery options failed",e instanceof Error?e.message:"Please try again.");}
    finally{setRecoveryBusy(false);}
  };

  const requestCode=async()=>{
    if(!token)return;
    setRecoveryBusy(true);
    try{
      const r=await fetch(getApiUrl("/api/users/me/recovery-email/request-verification"),{method:"POST",headers:{Authorization:"Bearer "+token}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not send verification code.");
      Alert.alert("Check your alternate email",d.message||"A verification code was sent.");
    }catch(e){Alert.alert("Verification unavailable",e instanceof Error?e.message:"Please try again.");}
    finally{setRecoveryBusy(false);}
  };

  const confirmCode=async()=>{
    if(!token||!recoveryCode.trim())return;
    setRecoveryBusy(true);
    try{
      const r=await fetch(getApiUrl("/api/users/me/recovery-email/confirm"),{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({code:recoveryCode.trim()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not verify email.");
      setRecoveryVerified(true);setRecoveryCode("");
      Alert.alert("Recovery email verified","Password recovery links can now also be sent to this address.");
    }catch(e){Alert.alert("Verification failed",e instanceof Error?e.message:"Please try again.");}
    finally{setRecoveryBusy(false);}
  };

  const requestEmailChange=async()=>{
    if(!token||emailChangeBusy)return;
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(primaryEmail.trim())){Alert.alert("Check email address","Enter a valid new email address.");return;}
    if(!emailChangePassword){Alert.alert("Confirm your identity","Enter your current password before changing your email.");return;}
    setEmailChangeBusy(true);
    try{
      const r=await fetch(getApiUrl("/api/auth/email-change/request"),{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({email:primaryEmail.trim(),currentPassword:emailChangePassword})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not request an email change.");
      setEmailChangePassword("");
      Alert.alert("Check the new inbox",d.message||"Your current email stays active until you confirm the new address.");
    }catch(e){Alert.alert("Email change unavailable",e instanceof Error?e.message:"Please try again.");}
    finally{setEmailChangeBusy(false);}
  };

  const changePassword=async()=>{
    if(!token||passwordBusy)return;
    if(newPassword.length<8||newPassword.length>256){Alert.alert("Password requirements","Use a new password between 8 and 256 characters.");return;}
    if(newPassword!==confirmPassword){Alert.alert("Passwords do not match","Enter the same new password twice.");return;}
    setPasswordBusy(true);
    try{
      const r=await fetch(getApiUrl("/api/auth/change-password"),{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not change password.");
      setCurrentPassword("");setNewPassword("");setConfirmPassword("");
      Alert.alert("Password changed","All active sessions have been revoked. Sign in again using your new password.",[{text:"Sign in",onPress:()=>{void logout().finally(()=>router.replace("/login"));}}]);
    }catch(e){Alert.alert("Password change failed",e instanceof Error?e.message:"Please try again.");}
    finally{setPasswordBusy(false);}
  };

  const field=(label:string,value:string,set:(v:string)=>void,placeholder:string,multiline=false,secure=false)=><View style={{marginTop:12}}><Text style={{color:colors.foreground,fontSize:13,fontWeight:"700",marginBottom:6}}>{label}</Text><TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} secureTextEntry={secure} textAlignVertical={multiline?"top":"center"} style={{minHeight:multiline?64:46,borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:12,paddingVertical:multiline?10:0,color:colors.foreground,backgroundColor:colors.card}}/></View>;

  return <View style={{marginHorizontal:16,marginBottom:18,borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,backgroundColor:colors.card}}>
    <TouchableOpacity onPress={()=>{setName(user?.name||"");setPhone(user?.phone||"");setGrade(user?.grade||"");setSubject(user?.subject||"");setOpen(!open);}} accessibilityRole="button" style={{flexDirection:"row",alignItems:"center",gap:10}}>
      <Feather name="edit-3" size={17} color={colors.primary}/><Text style={{flex:1,color:colors.foreground,fontWeight:"700"}}>Edit profile details</Text><Feather name={open?"chevron-up":"chevron-down"} size={18} color={colors.mutedForeground}/>
    </TouchableOpacity>
    {open?<View>
      {field("Full name",name,setName,"Your name")}
      {field("Phone",phone,setPhone,"Phone number")}
      {field("Grade",grade,setGrade,"Your grade")}
      {field("Subject",subject,setSubject,"Your subject")}
      <TouchableOpacity onPress={()=>void save()} disabled={busy} style={{height:46,borderRadius:10,marginTop:16,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8}}>
        {busy?<ActivityIndicator color="#fff"/>:null}<Text style={{color:"#fff",fontWeight:"700"}}>{busy?"Saving…":"Save changes"}</Text>
      </TouchableOpacity>
    </View>:null}
    <View style={{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:colors.border}}>
      <Text style={{fontSize:16,fontWeight:"700",color:colors.foreground}}>Change account email</Text>
      <Text style={{fontSize:12,color:colors.mutedForeground,marginTop:4}}>Current email: {user?.email||"Not available"}. Confirm the new address from its inbox. Your current email stays active until then.</Text>
      {field("New email address",primaryEmail,setPrimaryEmail,"you@example.com")}
      {field("Current password",emailChangePassword,setEmailChangePassword,"Confirm it is you",false,true)}
      <TouchableOpacity onPress={()=>void requestEmailChange()} disabled={emailChangeBusy||!primaryEmail.trim()||!emailChangePassword} style={{height:44,borderRadius:10,marginTop:14,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,opacity:emailChangeBusy||!primaryEmail.trim()||!emailChangePassword?0.55:1}}>
        {emailChangeBusy?<ActivityIndicator color="#fff"/>:null}<Text style={{color:"#fff",fontWeight:"700"}}>{emailChangeBusy?"Sending…":"Send confirmation email"}</Text>
      </TouchableOpacity>
    </View>
    <View style={{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:colors.border}}>
      <Text style={{fontSize:16,fontWeight:"700",color:colors.foreground}}>Change password</Text>
      <Text style={{fontSize:12,color:colors.mutedForeground,marginTop:4}}>Changing your password revokes active sessions. You will need to sign in again on this device and your other devices.</Text>
      {field("Current password",currentPassword,setCurrentPassword,"Enter current password",false,true)}
      {field("New password",newPassword,setNewPassword,"Use at least 8 characters",false,true)}
      {field("Confirm new password",confirmPassword,setConfirmPassword,"Re-enter new password",false,true)}
      <TouchableOpacity onPress={()=>void changePassword()} disabled={passwordBusy||!currentPassword||!newPassword||!confirmPassword} style={{height:46,borderRadius:10,marginTop:14,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,opacity:passwordBusy||!currentPassword||!newPassword||!confirmPassword?0.55:1}}>
        {passwordBusy?<ActivityIndicator color="#fff"/>:null}<Text style={{color:"#fff",fontWeight:"700"}}>{passwordBusy?"Changing password…":"Change password"}</Text>
      </TouchableOpacity>
    </View>
    {!isPrivileged?<View style={{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:colors.border}}>
      <Text style={{fontSize:16,fontWeight:"700",color:colors.foreground}}>Account recovery options</Text>
      <Text style={{fontSize:12,color:colors.mutedForeground,marginTop:4}}>Add a backup email and verify it before it can receive password-reset links. Security answers are stored as hashes but are not used to reset passwords on their own. Phone verification requires an SMS provider and is not yet enabled.</Text>
      {field("Alternate Google/email address",recoveryEmail,setRecoveryEmail,"you@example.com")}
      {field("Recovery phone number",recoveryPhone,setRecoveryPhone,"Include country code")}
      {field("Security question",securityQuestion,setSecurityQuestion,"Choose a question only you can answer")}
      {field("Security answer",securityAnswer,setSecurityAnswer,"Answer (saved as a hash)")}
      <TouchableOpacity onPress={()=>void saveRecovery()} disabled={recoveryBusy} style={{height:44,borderRadius:10,marginTop:14,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8}}>
        {recoveryBusy?<ActivityIndicator color="#fff"/>:null}<Text style={{color:"#fff",fontWeight:"700"}}>{recoveryBusy?"Saving…":"Save recovery options"}</Text>
      </TouchableOpacity>
      <Text style={{fontSize:12,color:recoveryVerified?"#15803d":colors.mutedForeground,marginTop:10}}>{recoveryVerified?"Alternate email verified":"Alternate email not verified"}</Text>
      <TouchableOpacity onPress={()=>void requestCode()} disabled={recoveryBusy||!recoveryEmail.trim()} style={{paddingVertical:10}}><Text style={{color:colors.primary,fontWeight:"700"}}>Send email verification code</Text></TouchableOpacity>
      {field("6-digit email verification code",recoveryCode,setRecoveryCode,"123456")}
      <TouchableOpacity onPress={()=>void confirmCode()} disabled={recoveryBusy||recoveryCode.trim().length!==6} style={{paddingVertical:10}}><Text style={{color:colors.primary,fontWeight:"700"}}>Verify alternate email</Text></TouchableOpacity>
    </View>:null}
  </View>;
}
