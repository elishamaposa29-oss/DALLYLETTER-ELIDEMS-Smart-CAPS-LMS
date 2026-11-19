import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserProfileLink } from "@/components/UserProfileLink";

type Group = "all" | "everyone" | "teachers" | "prefects" | "learners" | "managers" | "both";
type Person = { id:number; name:string; role?:string; isPrefect?:boolean; isManager?:boolean; avatarUrl?:string|null; grade?:string|null; subject?:string|null };
type Props = { value?:number|string|null; onChange:(id:number|null, user?:Person)=>void; group?:Group; showGroupFilter?:boolean; placeholder?:string; disabled?:boolean; users?:Array<Record<string, any> & {id:number}> };

const groups: Array<{value:Group;label:string}> = [
  {value:"all",label:"All"},{value:"everyone",label:"Everyone"}, {value:"teachers",label:"Teachers"}, {value:"prefects",label:"Prefects"},
  {value:"learners",label:"Learners"}, {value:"managers",label:"Managers"}, {value:"both",label:"Both"},
];

export default function UserSelector({value,onChange,group="all",showGroupFilter=true,placeholder="Search people…",disabled=false,users:suppliedUsers}:Props) {
  const colors=useColors();
  const {token}=useAuth();
  const [activeGroup,setActiveGroup]=useState<Group>(group);
  const [query,setQuery]=useState("");
  const [rows,setRows]=useState<Person[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{setActiveGroup(group);},[group]);
  useEffect(()=>{
    if(suppliedUsers)return;
    let active=true;
    setLoading(true);setError("");
    const params=new URLSearchParams({group:activeGroup,q:query});
    fetch(getApiUrl("/api/users/selection-directory?"+params.toString()),{headers:token?{Authorization:"Bearer "+token}:{}})
      .then(async response=>{const data=await response.json().catch(()=>[]);if(!response.ok)throw new Error(data?.error||"People could not be loaded.");return data;})
      .then(data=>{if(active)setRows(Array.isArray(data)?data:[]);})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"People could not be loaded.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[activeGroup,query,token,suppliedUsers]);
  const rawRows=(suppliedUsers??rows) as Array<Record<string, any> & {id:number}>;
  const sourceRows:Person[]=rawRows.map(person=>({id:person.id,name:String(person.name??person.displayName??"User"),role:person.role,isPrefect:Boolean(person.isPrefect),isManager:Boolean(person.isManager),avatarUrl:person.avatarUrl??null,grade:person.grade??null,subject:person.subject??null}));
  const visibleRows=useMemo(()=>suppliedUsers?sourceRows.filter(person=>person.name.toLowerCase().includes(query.toLowerCase())):sourceRows,[suppliedUsers,query,rows]);
  const selectedPerson=sourceRows.find(person=>String(person.id)===String(value));
  return <View style={{gap:9}}>
    {showGroupFilter&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
      {groups.map(item=><TouchableOpacity key={item.value} disabled={disabled} onPress={()=>setActiveGroup(item.value)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:16,backgroundColor:activeGroup===item.value?colors.primary:colors.card,borderWidth:1,borderColor:colors.border}}>
        <Text style={{fontSize:12,fontWeight:"600",color:activeGroup===item.value?colors.background:colors.foreground}}>{item.label}</Text>
      </TouchableOpacity>)}
    </View>}
    <TextInput value={query} onChangeText={setQuery} editable={!disabled} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} accessibilityLabel="Search users" style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:11,color:colors.foreground,backgroundColor:colors.card}}/>
    {selectedPerson&&<UserProfileLink userId={selectedPerson.id} name={selectedPerson.name} avatarUrl={selectedPerson.avatarUrl}/>}
    {value!=null&&<TouchableOpacity onPress={()=>onChange(null)} disabled={disabled} style={{alignSelf:"flex-start",padding:7}}><Text style={{color:colors.primary,fontSize:12}}>Clear selected person</Text></TouchableOpacity>}
    {!suppliedUsers&&loading?<ActivityIndicator color={colors.primary}/>:error?<Text accessibilityRole="alert" style={{color:colors.destructive,fontSize:12}}>{error}</Text>:visibleRows.length===0?<Text style={{color:colors.mutedForeground,fontSize:12}}>No matching people.</Text>:<View style={{maxHeight:230,borderWidth:1,borderColor:colors.border,borderRadius:10,overflow:"hidden"}}>
      {visibleRows.map(person=><View key={person.id} style={{flexDirection:"row",alignItems:"center",padding:9,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:String(value)===String(person.id)?colors.secondary:colors.card}}>
        <View style={{flex:1,minWidth:0}}><UserProfileLink userId={person.id} name={person.name} avatarUrl={person.avatarUrl}/><Text style={{marginLeft:43,marginTop:-3,fontSize:11,color:colors.mutedForeground}}>{person.isPrefect?"Prefect":String(person.role??"learner").replaceAll("_"," ")}{person.grade?" · "+person.grade:""}</Text></View>
        <TouchableOpacity disabled={disabled} onPress={()=>onChange(person.id,person)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:8,backgroundColor:colors.primary}}><Text style={{fontSize:11,fontWeight:"700",color:colors.background}}>Select</Text></TouchableOpacity>
      </View>)}
    </View>}
  </View>;
}
