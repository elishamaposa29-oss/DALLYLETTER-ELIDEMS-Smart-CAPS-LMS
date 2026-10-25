import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export function ProfileDetailsEditor() {
  const {user,token,login}=useAuth();
  const colors=useColors();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState(user?.name||"");
  const [phone,setPhone]=useState(user?.phone||"");
  const [grade,setGrade]=useState(user?.grade||"");
  const [subject,setSubject]=useState(user?.subject||"");
  const [busy,setBusy]=useState(false);
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
  const field=(label:string,value:string,set:(v:string)=>void,placeholder:string)=> <View style={{marginTop:12}}><Text style={{color:colors.foreground,fontSize:13,fontWeight:"700",marginBottom:6}}>{label}</Text><TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={{height:46,borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:12,color:colors.foreground,backgroundColor:colors.card}}/></View>;
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
  </View>;
}
