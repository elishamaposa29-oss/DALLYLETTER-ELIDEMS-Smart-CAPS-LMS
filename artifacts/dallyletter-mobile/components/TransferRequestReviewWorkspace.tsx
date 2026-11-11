import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Row = Record<string, any> & { id: number };
export default function TransferRequestReviewWorkspace() {
 const colors=useColors(); const {user,token}=useAuth();
 const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(false); const [busy,setBusy]=useState<number|null>(null);
 const [error,setError]=useState(""); const [notes,setNotes]=useState<Record<number,string>>({});
 const [permissions,setPermissions]=useState<Record<string,boolean>>({}); const [isOwner,setIsOwner]=useState(false); const [role,setRole]=useState("");
 const api=useCallback(async(path:string,method="GET",body?:any)=>{const response=await fetch(getApiUrl(path),{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Request failed ("+response.status+")");return data;},[token]);
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{const [data,authority]=await Promise.all([api("/api/academic-records/transfer-requests"),api("/api/manager-permissions/me")]);setRows(Array.isArray(data)?data:[]);setPermissions(authority.permissions||{});setIsOwner(authority.isOwner===true);setRole(String(authority.role||"").toLowerCase().replace(/[ -]+/g,"_"));}catch(e){setError(e instanceof Error?e.message:"Transfer requests could not be loaded.");}finally{setLoading(false);}},[api,token]);
 useEffect(()=>{void load();},[load]);
 const senior=isOwner||role==="senior_manager";
 const canApprove=isOwner||(role==="senior_manager"&&permissions["transfers.approve"]===true);
 const canReject=isOwner||permissions["transfers.reject"]===true;
 const decide=async(row:Row,status:"approved"|"rejected")=>{const note=String(notes[row.id]||"").trim();if(status==="rejected"&&note.length<3){Alert.alert("Reason required","Enter a rejection reason of at least 3 characters.");return;}Alert.alert(status==="approved"?"Approve transfer request?":"Reject transfer request?", "Request #"+row.id+" · "+(row.learner_name||"Learner #"+row.learner_id),[{text:"Cancel",style:"cancel"},{text:status==="approved"?"Approve":"Reject",style:status==="rejected"?"destructive":"default",onPress:()=>{void (async()=>{setBusy(row.id);try{const result=await api("/api/academic-records/transfer-requests/"+row.id+"/review","POST",{status,note});Alert.alert(status==="approved"?"Transfer request approved":"Transfer request rejected",result.verificationUrl?"Protected verification link issued and learner notified.":"Learner has been notified.");await load();}catch(e){Alert.alert("Decision not saved",e instanceof Error?e.message:"Try again.");}finally{setBusy(null);}})();}}]);};
 const download=async(row:Row)=>{if(!token)return;setBusy(row.id);try{const base=FileSystem.cacheDirectory||FileSystem.documentDirectory||"";const result=await FileSystem.downloadAsync(getApiUrl("/api/academic-records/transfer-requests/"+row.id+"/download"),base+"dallyletter-transfer-"+row.id+".pdf",{headers:{Authorization:"Bearer "+token}});if(result.status<200||result.status>=300)throw new Error("The protected approved letter could not be downloaded.");await Linking.openURL(result.uri);}catch(e){Alert.alert("Download unavailable",e instanceof Error?e.message:"Please retry.");}finally{setBusy(null);}};
 const card={backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:13,marginBottom:11};
 const title={color:colors.foreground,fontSize:16,fontWeight:"800" as const};
 const body={color:colors.foreground,fontSize:13,lineHeight:19};
 const muted={color:colors.mutedForeground,fontSize:12,lineHeight:17};
 const btn=(label:string,onPress:()=>void,disabled=false,secondary=false)=><TouchableOpacity onPress={onPress} disabled={disabled} style={{backgroundColor:secondary?colors.background:colors.primary,borderWidth:secondary?1:0,borderColor:colors.border,borderRadius:9,padding:11,opacity:disabled?0.5:1}}><Text style={{color:secondary?colors.foreground:"#fff",fontWeight:"800",textAlign:"center"}}>{label}</Text></TouchableOpacity>;
 if(!user||!token)return <View style={{flex:1,backgroundColor:colors.background,padding:20}}><Text style={body}>Sign in to review transfer requests.</Text></View>;
 return <ScrollView style={{flex:1,backgroundColor:colors.background}} contentContainerStyle={{padding:16,paddingBottom:40}}>
  <View style={{...card,backgroundColor:"#0f2a5a",borderColor:"#0f2a5a"}}><Text style={{color:"#e8c35a",fontSize:11,fontWeight:"800",letterSpacing:1}}>DALLYLETTER ELIDEMS</Text><Text style={{color:"#fff",fontSize:23,fontWeight:"900",marginTop:5}}>Transfer letter review</Text><Text style={{color:"#dbeafe",marginTop:5}}>Inspect the original learner submission, signatures, review history and protected PDF before deciding.</Text>{btn(loading?"Refreshing…":"Refresh requests",()=>void load(),loading,true)}</View>
  {error?<Text accessibilityRole="alert" style={{color:"#dc2626",marginBottom:10}}>{error}</Text>:null}
  <View style={{...card,flexDirection:"row",justifyContent:"space-between"}}><Text style={body}>Total: {rows.length}</Text><Text style={body}>Pending: {rows.filter(x=>x.status==="pending").length}</Text><Text style={body}>Reviewed: {rows.filter(x=>x.status!=="pending").length}</Text></View>
  {loading?<ActivityIndicator color={colors.primary}/>:rows.length===0?<View style={card}><Text style={muted}>No transfer requests are available in your permitted scope.</Text></View>:rows.map(row=><View key={row.id} style={card}>
   <View style={{flexDirection:"row",justifyContent:"space-between",gap:8,alignItems:"center"}}><Text style={title}>Request #{row.id}</Text><Text style={{color:row.status==="approved"?"#16a34a":row.status==="rejected"?"#dc2626":colors.mutedForeground,fontWeight:"800"}}>{String(row.status||"pending").toUpperCase()}</Text></View>
   <Text style={body}>{row.learner_name||"Learner #"+row.learner_id}</Text><Text style={muted}>Submitted {row.created_at?new Date(row.created_at).toLocaleString():"date unavailable"}</Text>
   <Text style={{...title,marginTop:12}}>Transfer reason</Text><Text style={body}>{row.reason||"Not provided"}</Text>
   <Text style={{...title,marginTop:12}}>Original submitted form</Text>
   {Object.entries(row.form_data||{}).filter(([key,value])=>!key.endsWith("DataUrl")&&value!==null&&value!==undefined&&String(value).trim()!=="").map(([key,value])=><View key={key} style={{paddingVertical:5,borderBottomWidth:1,borderColor:colors.border}}><Text style={muted}>{key.replace(/([A-Z])/g," $1")}</Text><Text style={body}>{String(value)}</Text></View>)}
   {(["schoolLogoDataUrl","guardianSignatureDataUrl","headmasterSignatureDataUrl"] as const).map(key=>{const value=row.form_data?.[key];return typeof value==="string"&&/^data:image\/(png|jpeg);base64,/.test(value)?<View key={key} style={{marginTop:8}}><Text style={muted}>{key.replace("DataUrl","")}</Text><Image source={{uri:value}} resizeMode="contain" style={{height:88,width:"100%",backgroundColor:"#fff",borderRadius:8}}/></View>:null;})}
   {row.review_note?<View style={{marginTop:10,backgroundColor:colors.background,padding:10,borderRadius:8}}><Text style={muted}>Review note</Text><Text style={body}>{row.review_note}</Text><Text style={muted}>Reviewed {row.reviewed_at?new Date(row.reviewed_at).toLocaleString():""}</Text></View>:null}
   {row.status==="pending"&&(canApprove||canReject)?<><TextInput value={notes[row.id]||""} onChangeText={value=>setNotes(current=>({...current,[row.id]:value}))} placeholder="Review note / required rejection reason" placeholderTextColor={colors.mutedForeground} multiline style={{marginTop:12,minHeight:76,borderWidth:1,borderColor:colors.border,borderRadius:9,padding:10,color:colors.foreground,textAlignVertical:"top"}}/><View style={{flexDirection:"row",gap:8,marginTop:10}}>{canApprove? <View style={{flex:1}}>{btn("Approve request",()=>decide(row,"approved"),busy===row.id)}</View>:null}{canReject?<View style={{flex:1}}>{btn("Reject request",()=>decide(row,"rejected"),busy===row.id,true)}</View>:null}</View></>:row.status==="pending"?<Text style={{...muted,marginTop:10}}>Monitoring access only. Your current grants do not allow a decision.</Text>:row.status==="approved"?<View style={{marginTop:10}}>{btn(busy===row.id?"Preparing PDF…":"Download approved PDF",()=>void download(row),busy===row.id,true)}</View>:null}
  </View>)}
 </ScrollView>;
}
