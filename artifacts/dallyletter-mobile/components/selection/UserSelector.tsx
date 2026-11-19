import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserProfileLink } from "@/components/UserProfileLink";

type Group = "all" | "teachers" | "prefects" | "learners" | "managers" | "both";
type Person = { id:number; name:string; role:string; isPrefect?:boolean; isManager?:boolean; avatarUrl?:string|null; grade?:string|null; subject?:string|null };
type Props = { value?:number|string|null; onChange:(id:number|null, user?:Person)=>void; group?:Group; showGroupFilter?:boolean; placeholder?:string; disabled?:boolean };

const groups: Array<{value:Group;label:string}> = [
  {value:"all",label:"All"},{value:"everyone",label:"Everyone"}, {value:"teachers",label:"Teachers"}, {value:"prefects",label:"Prefects"},
  {value:"learners",label:"Learners"}, {value:"managers",label:"Managers"}, {value:"both",label:"Both"},
];

export default function UserSelector({value,onChange,group="all",showGroupFilter=true,placeholder="Search people…",disabled=false}:Props) {
  const colors=useColors();
  const {token}=useAuth();
  const [activeGroup,setActiveGroup]=useState<Group>(group);
  const [query,setQuery]=useState("");
  const [rows,setRows]=useState<Person[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{setActiveGroup(group);},[group]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");
    const params=new URLSearchParams({group:activeGroup,q:query});
    fetch(getApiUrl("/api/users/selection-directory?"+params.toString()),{headers:token?{Authorization:"Bearer "+token}:{}})
      .then(async response=>{const data=await response.json().catch(()=>[]);if(!response.ok)throw new Error(data?.error||"People could not be loaded.");return data;})
      .then(data=>{if(active)setRows(Array.isArray(data)?data:[]);})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"People could not be loaded.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[activeGroup,query,token]);
  return <View style={{gap:9}}>
    {showGroupFilter&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
      {groups.map(item=><TouchableOpacity key={item.value} disabled={disabled} onPress={()=>setActiveGroup(item.value)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:16,backgroundColor:activeGroup===item.value?colors.primary:colors.card,borderWidth:1,borderColor:colors.border}}>
        <Text style={{fontSize:12,fontWeight:"600",color:activeGroup===item.value?colors.background:colors.foreground}}>{item.label}</Text>
      </TouchableOpacity>)}
    </View>}
    <TextInput value={query} onChangeText={setQuery} editable={!disabled} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} accessibilityLabel="Search users" style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:11,color:colors.foreground,backgroundColor:colors.card}}/>
    {value!=null&&<TouchableOpacity onPress={()=>onChange(null)} disabled={disabled} style={{alignSelf:"flex-start",padding:7}}><Text style={{color:colors.primary,fontSize:12}}>Clear selected person</Text></TouchableOpacity>}
    {loading?<ActivityIndicator color={colors.primary}/>:error?<Text accessibilityRole="alert" style={{color:colors.destructive,fontSize:12}}>{error}</Text>:rows.length===0?<Text style={{color:colors.mutedForeground,fontSize:12}}>No matching people.</Text>:<View style={{maxHeight:230,borderWidth:1,borderColor:colors.border,borderRadius:10,overflow:"hidden"}}>
      {rows.map(person=><TouchableOpacity key={person.id} disabled={disabled} onPress={()=>onChange(person.id,person)} style={{flexDirection:"row",alignItems:"center",padding:9,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:String(value)===String(person.id)?colors.secondary:colors.card}}>
        <View style={{flex:1,minWidth:0}}><UserProfileLink userId={person.id} name={person.name} avatarUrl={person.avatarUrl}/><Text style={{marginLeft:43,marginTop:-3,fontSize:11,color:colors.mutedForeground}}>{person.isPrefect?"Prefect":person.role.replaceAll("_"," ")}{person.grade?" · "+person.grade:""}</Text></View>
        {String(value)===String(person.id)&&<Text style={{color:colors.primary,fontWeight:"700"}}>✓</Text>}
      </TouchableOpacity>)}
    </View>}
  </View>;
}
