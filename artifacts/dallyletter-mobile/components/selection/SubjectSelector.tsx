import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Props={value:string;onChange:(value:string)=>void;onSelect?:(value:string)=>void;placeholder?:string;disabled?:boolean};

export default function SubjectSelector({value,onChange,onSelect,placeholder="Search or type a subject…",disabled=false}:Props){
  const colors=useColors();const {token}=useAuth();
  const [subjects,setSubjects]=useState<string[]>([]);const [canAdd,setCanAdd]=useState(false);
  const [query,setQuery]=useState(value);const [loading,setLoading]=useState(true);const [notice,setNotice]=useState("");
  useEffect(()=>{setQuery(value);},[value]);
  const refresh=async()=>{const response=await fetch(getApiUrl("/api/subjects/catalog"),{headers:token?{Authorization:"Bearer "+token}:{}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||"Subject catalogue unavailable.");setSubjects(Array.isArray(data.subjects)?data.subjects:[]);setCanAdd(data.canAddSubject===true);};
  useEffect(()=>{let active=true;refresh().catch(error=>{if(active)setNotice(error instanceof Error?error.message:"Subject catalogue unavailable.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
  const normalized=query.trim().replace(/\s+/g," ");
  const matches=useMemo(()=>subjects.filter(subject=>subject.toLowerCase().includes(normalized.toLowerCase())).slice(0,10),[subjects,normalized]);
  const exact=subjects.some(subject=>subject.toLowerCase()===normalized.toLowerCase());
  const recordInteraction=(subject:string)=>fetch(getApiUrl("/api/subjects/catalog/interaction"),{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify({subject})}).catch(()=>undefined);
  const choose=(subject:string)=>{onChange(subject);onSelect?.(subject);setQuery(subject);setNotice("");void recordInteraction(subject);};
  const add=async()=>{if(!normalized||!canAdd)return;try{const response=await fetch(getApiUrl("/api/subjects/catalog"),{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify({subject:normalized})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Subject could not be added.");await refresh();choose(String(data.subject||normalized));setNotice("Added to the shared subject catalogue.");}catch(error){setNotice(error instanceof Error?error.message:"Subject could not be added.");}};
  return <View style={{gap:6}}>
    <TextInput value={query} editable={!disabled} onChangeText={text=>{setQuery(text);onChange(text);}} onBlur={()=>{if(normalized&&canAdd&&!exact)void add();else if(normalized)void recordInteraction(normalized);}} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} accessibilityLabel="Subject" style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,backgroundColor:colors.card}}/>
    {loading?<ActivityIndicator color={colors.primary}/>:<View style={{maxHeight:190,borderWidth:1,borderColor:colors.border,borderRadius:9,overflow:"hidden"}}>
      {matches.map(subject=><TouchableOpacity key={subject} disabled={disabled} onPress={()=>choose(subject)} style={{padding:10,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={{color:colors.foreground}}>{subject}</Text></TouchableOpacity>)}
      {normalized&&!exact&&canAdd&&<TouchableOpacity disabled={disabled} onPress={()=>void add()} style={{padding:10,backgroundColor:colors.secondary}}><Text style={{color:colors.primary,fontWeight:"700"}}>+ Add “{normalized}” to Dallyletter</Text></TouchableOpacity>}
      {!matches.length&&(!normalized||!canAdd)&&<Text style={{padding:10,color:colors.mutedForeground,fontSize:12}}>No matching subjects. You can still type a subject.</Text>}
    </View>}
    {!!notice&&<Text accessibilityRole="alert" style={{fontSize:12,color:colors.mutedForeground}}>{notice}</Text>}
  </View>;
}
