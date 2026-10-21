import { Feather } from "@expo/vector-icons";
import { getListClassesQueryKey, getListLessonsQueryKey, useDeleteClass, useDeleteLesson, useListClasses, useListLessons } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AuthenticatedMediaPreview from "@/components/AuthenticatedMediaPreview";
import OfflineMediaDownload from "@/components/OfflineMediaDownload";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Tab="lessons"|"classes";
export default function AdminAcademicHub(){
 const colors=useColors(),insets=useSafeAreaInsets();
 const {user}=useAuth();
 const queryClient=useQueryClient();
 const [tab,setTab]=useState<Tab>("lessons"),[search,setSearch]=useState("");
 const {data:lessons,isLoading:lessonsLoading,refetch:refetchLessons}=useListLessons();
 const {data:classes,isLoading:classesLoading,refetch:refetchClasses}=useListClasses();
 const deleteLesson=useDeleteLesson({mutation:{onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:getListLessonsQueryKey()});Alert.alert("Lesson deleted","The lesson was removed.");},onError:(e:any)=>Alert.alert("Delete failed",e?.message||"Could not delete lesson.")}});
 const deleteClass=useDeleteClass({mutation:{onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:getListClassesQueryKey()});Alert.alert("Class deleted","The class was removed.");},onError:(e:any)=>Alert.alert("Delete failed",e?.message||"Could not delete class.")}});
 const role=String(user?.role||"").toLowerCase().replace(/[ -]+/g,"_");
 const allowed=["owner","admin","platform_owner"].includes(role);
 const filteredLessons=(lessons||[]).filter((x:any)=>String(x.title||"").toLowerCase().includes(search.toLowerCase())||String(x.teacherName||"").toLowerCase().includes(search.toLowerCase())||String(x.subject||"").toLowerCase().includes(search.toLowerCase()));
 const filteredClasses=(classes||[]).filter((x:any)=>String(x.title||"").toLowerCase().includes(search.toLowerCase())||String(x.teacherName||"").toLowerCase().includes(search.toLowerCase())||String(x.subject||"").toLowerCase().includes(search.toLowerCase()));
 const s=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},header:{paddingTop:insets.top+(Platform.OS==="web"?67:12)+14,paddingHorizontal:18,paddingBottom:18,backgroundColor:colors.primary},
  title:{fontSize:22,fontFamily:"Inter_700Bold",color:"#fff"},subtitle:{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:5},
  content:{padding:14,paddingBottom:120,gap:10},card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:13,gap:8},
  row:{flexDirection:"row",alignItems:"center",gap:8},body:{fontSize:14,color:colors.foreground,lineHeight:20},heading:{fontSize:15,fontFamily:"Inter_700Bold",color:colors.foreground},
  muted:{fontSize:12,color:colors.mutedForeground,lineHeight:17},input:{minHeight:44,padding:11,borderWidth:1,borderColor:colors.border,borderRadius:9,color:colors.foreground,backgroundColor:colors.card},
  chip:{paddingHorizontal:13,paddingVertical:9,borderWidth:1,borderColor:colors.border,borderRadius:9},button:{minHeight:40,paddingHorizontal:12,paddingVertical:9,backgroundColor:colors.primary,borderRadius:8,alignItems:"center",justifyContent:"center"},buttonText:{color:"#fff",fontSize:12,fontWeight:"700"},
 });
 const confirmDelete=(kind:"lesson"|"class",item:any)=>{
  Alert.alert(`Delete ${kind}?`,`This removes “${item.title||kind}” from the platform. This cannot be undone.`,[
   {text:"Cancel",style:"cancel"},
   {text:"Delete",style:"destructive",onPress:()=>kind==="lesson"?deleteLesson.mutate({id:item.id}):deleteClass.mutate({id:item.id})},
  ]);
 };
 if(!allowed)return <View style={s.root}><Text style={s.body}>Owner/admin access required. The server enforces delete permissions.</Text></View>;
 const busy=tab==="lessons"?lessonsLoading:classesLoading;
 return <View style={s.root}>
  <View style={s.header}><TouchableOpacity onPress={()=>router.back()} style={[s.row,{marginBottom:8}]}><Feather name="book-open" size={18} color="#fff"/><Text style={{color:"#fff"}}>Academic administration</Text></TouchableOpacity><Text style={s.title}>Lessons & classes</Text><Text style={s.subtitle}>Search and review platform-wide learning content and class sessions</Text></View>
  <View style={{padding:14,gap:10}}>
   <View style={[s.row,{gap:8}]}>{(["lessons","classes"] as const).map(v=><TouchableOpacity key={v} style={[s.chip,{flex:1,backgroundColor:tab===v?colors.primary:colors.card}]} onPress={()=>{setTab(v);setSearch("");}}><Text style={{textAlign:"center",color:tab===v?"#fff":colors.foreground,fontWeight:"600"}}>{v==="lessons"?"Lessons":"Classes"}</Text></TouchableOpacity>)}</View>
   <TextInput style={s.input} value={search} onChangeText={setSearch} placeholder={tab==="lessons"?"Search title, teacher or subject":"Search class, teacher or subject"} placeholderTextColor={colors.mutedForeground}/>
   <TouchableOpacity style={[s.row,{alignSelf:"flex-start"}]} onPress={()=>void (tab==="lessons"?refetchLessons():refetchClasses())}><Feather name="refresh-cw" size={15} color={colors.primary}/><Text style={{color:colors.primary,fontSize:12,fontWeight:"600"}}>Refresh list</Text></TouchableOpacity>
  </View>
  {busy?<View style={[s.row,{justifyContent:"center",padding:25}]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Loading {tab}…</Text></View>:tab==="lessons"?
   <FlatList data={filteredLessons as any[]} keyExtractor={(x:any)=>String(x.id)} contentContainerStyle={s.content} ListEmptyComponent={<Text style={s.muted}>No lessons match this search.</Text>} renderItem={({item}:any)=><View style={s.card}>
    <View style={s.row}><Feather name="book-open" size={19} color={colors.primary}/><View style={{flex:1}}><Text style={s.heading}>{item.title||"Untitled lesson"}</Text><Text style={s.muted}>{item.subject||"General"} · {item.teacherName||"Teacher"} · {item.type||"notes"}</Text></View></View>
    {item.content?<Text style={s.body} numberOfLines={5}>{String(item.content).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}</Text>:null}
    {item.mediaUrl?<><AuthenticatedMediaPreview url={String(item.mediaUrl)} height={170} accessibilityLabel={String(item.title||"Lesson media")}/><OfflineMediaDownload url={String(item.mediaUrl)} fileName={String(item.title||"Lesson media")}/></>:null}
    <View style={s.row}><TouchableOpacity style={[s.button,{flex:1,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={()=>item.mediaUrl?void Linking.openURL(String(item.mediaUrl)):Alert.alert("Lesson content",String(item.content||"No content attached."))}><Text style={[s.buttonText,{color:colors.foreground}]}>Open content</Text></TouchableOpacity><TouchableOpacity style={[s.button,{backgroundColor:"#b91c1c"}]} onPress={()=>confirmDelete("lesson",item)} disabled={deleteLesson.isPending}><Text style={s.buttonText}>Delete</Text></TouchableOpacity></View>
   </View>}/>
   :<FlatList data={filteredClasses as any[]} keyExtractor={(x:any)=>String(x.id)} contentContainerStyle={s.content} ListEmptyComponent={<Text style={s.muted}>No classes match this search.</Text>} renderItem={({item}:any)=><View style={s.card}>
    <View style={s.row}><Feather name="video" size={19} color={colors.primary}/><View style={{flex:1}}><Text style={s.heading}>{item.title||"Untitled class"}</Text><Text style={s.muted}>{item.subject||"General"} · {item.teacherName||"Teacher"} · {item.status||"scheduled"}</Text></View></View>
    {item.description?<Text style={s.body}>{item.description}</Text>:null}
    <Text style={s.muted}>{item.scheduledAt?new Date(item.scheduledAt).toLocaleString():"Schedule not provided"}</Text>
    <View style={s.row}>{item.meetLink?<TouchableOpacity style={[s.button,{flex:1}]} onPress={()=>void Linking.openURL(String(item.meetLink))}><Text style={s.buttonText}>Open meeting link</Text></TouchableOpacity>:null}<TouchableOpacity style={[s.button,{backgroundColor:"#b91c1c"}]} onPress={()=>confirmDelete("class",item)} disabled={deleteClass.isPending}><Text style={s.buttonText}>Delete</Text></TouchableOpacity></View>
   </View>}/>}
 </View>;
}
