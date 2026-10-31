import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Panel="overview"|"teachers"|"students"|"prefects"|"reports"|"transfers"|"reportReview";
const panels:{id:Panel;title:string;icon:string}[]=[{id:"overview",title:"Overview",icon:"bar-chart-2"},{id:"teachers",title:"Teachers",icon:"users"},{id:"students",title:"Students",icon:"book-open"},{id:"prefects",title:"Prefects",icon:"star"},{id:"reports",title:"Reports",icon:"file-text"},{id:"transfers",title:"Transfer approvals",icon:"file-text"},{id:"reportReview",title:"Report review",icon:"check-square"}];
export default function ManagerDashboard(){
 const colors=useColors(), insets=useSafeAreaInsets();
 const {user,token}=useAuth();
 const role=String(user?.role||"").toLowerCase().replace(/[ -]+/g,"_");
 const allowed=["owner","admin","manager","junior_manager","jnr_manager","senior_manager","snr_manager","platform_owner"].includes(role)||Boolean((user as any)?.isManager);
 const [panel,setPanel]=useState<Panel>("overview"),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [permissions,setPermissions]=useState<Record<string,boolean>>({});
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [reviewBusy,setReviewBusy]=useState<string|null>(null);
 const request=useCallback(async(path:string,init:RequestInit={})=>{
  const response=await fetch(getApiUrl(path),{...init,headers:{...(token?{Authorization:"Bearer "+token}:{}),...((init.headers||{}) as Record<string,string>)}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);
  return payload;
 },[token]);
 useEffect(()=>{void request("/api/manager-permissions/me").then(value=>setPermissions(value||{})).catch(()=>setPermissions({}));},[request]);
 const visiblePanels=panels.filter(p=>p.id==="overview"
  ||(p.id==="teachers"&&permissions.teacherMonitor)
  ||(p.id==="students"&&permissions.studentManage)
  ||(p.id==="prefects"&&permissions.prefectManage)
  ||(p.id==="reports"&&permissions.reportView)
  ||(p.id==="transfers"&&(permissions.transferView||permissions.transferReview))
  ||(p.id==="reportReview"&&(permissions.reportView||permissions.reportReview)));
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const path=panel==="overview"?"/api/manager/dashboard":panel==="teachers"?"/api/manager/teachers":panel==="students"?"/api/manager/students":panel==="prefects"?"/api/manager/prefects":panel==="reports"?"/api/manager/reports/overview":panel==="transfers"?"/api/academic-records/transfer-requests":"/api/academic-records/reports/drafts";
   const result=await request(path);
   setData(panel==="transfers"?(Array.isArray(result)?result.filter((x:any)=>x.status==="pending"):[]):panel==="reportReview"?(Array.isArray(result)?result.filter((x:any)=>x.status==="pending_review"):[]):result);
  }catch(e){setError(e instanceof Error?e.message:"Could not load manager data.");setData(null);}
  finally{setLoading(false);}
 },[panel,request]);
 useEffect(()=>{if(!visiblePanels.some(p=>p.id===panel))setPanel("overview");},[permissions, panel]);
 useEffect(()=>{void load();},[load]);
 const reviewItem=async(kind:"transfer"|"report",id:number,status:"approved"|"rejected")=>{
  const key=kind+"-"+id;setReviewBusy(key);setError("");
  try{
   const path=kind==="transfer"?"/api/academic-records/transfer-requests/"+id+"/review":"/api/academic-records/reports/drafts/"+id+"/review";
   await request(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,note:reviewNotes[key]||""})});
   setReviewNotes(notes=>({...notes,[key]:""}));
   await load();
   Alert.alert("Review saved",(kind==="transfer"?"Transfer request":"Report")+" #"+id+" "+status+".");
  }catch(e){Alert.alert("Review denied",e instanceof Error?e.message:"Could not save review.");}
  finally{setReviewBusy(null);}
 };
 const s=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},header:{backgroundColor:colors.primary,paddingTop:insets.top+14,paddingHorizontal:18,paddingBottom:18},
  title:{fontSize:23,fontFamily:"Inter_700Bold",color:"#fff"},subtitle:{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:5},
  content:{padding:14,paddingBottom:110,gap:10},card:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:13,gap:5},
  row:{flexDirection:"row",alignItems:"center",gap:8},heading:{fontSize:15,fontFamily:"Inter_700Bold",color:colors.foreground},body:{fontSize:13,color:colors.foreground},muted:{fontSize:12,color:colors.mutedForeground,lineHeight:17},
  chip:{paddingHorizontal:12,paddingVertical:9,borderRadius:8,borderWidth:1,borderColor:colors.border},metric:{flexGrow:1,flexBasis:"40%",padding:12,borderRadius:10,borderWidth:1,borderColor:colors.border},
 });
 const metric=(label:string,value:any)=><View key={label} style={s.metric}><Text style={{fontSize:22,fontWeight:"700",color:colors.primary}}>{value??"—"}</Text><Text style={s.muted}>{label}</Text></View>;
 if(!allowed)return <View style={s.root}><Text style={s.body}>Manager access required. The server enforces this permission.</Text></View>;
 return <View style={s.root}>
  <View style={s.header}>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12,flexWrap:"wrap"}}>
    <TouchableOpacity onPress={()=>router.back()} style={[s.row,{paddingVertical:6}]}><Feather name="arrow-left" size={18} color="#fff"/><Text style={{color:"#fff"}}>Back</Text></TouchableOpacity>
    <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open manager tools" onPress={()=>router.push("/(manager)/more" as any)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:9,backgroundColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",gap:6}}><Feather name="grid" size={15} color="#fff"/><Text style={{color:"#fff",fontSize:12,fontWeight:"700"}}>More tools</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open manager account settings" onPress={()=>router.push("/(manager)/profile" as any)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:9,backgroundColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",gap:6}}><Feather name="user" size={15} color="#fff"/><Text style={{color:"#fff",fontSize:12,fontWeight:"700"}}>Account</Text></TouchableOpacity>
    </View>
   </View>
   <Text style={s.title}>Manager dashboard</Text><Text style={s.subtitle}>Scoped school oversight · access remains server-authorized</Text>
  </View>
  <ScrollView contentContainerStyle={s.content}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{visiblePanels.map(p=><TouchableOpacity key={p.id} style={[s.chip,{backgroundColor:panel===p.id?colors.primary:colors.card}]} onPress={()=>setPanel(p.id)}><Text style={{color:panel===p.id?"#fff":colors.foreground}}>{p.title}</Text></TouchableOpacity>)}</ScrollView>
   <TouchableOpacity style={[s.card,s.row]} onPress={()=>void load()}><Feather name="refresh-cw" size={16} color={colors.primary}/><Text style={s.body}>Refresh live data</Text></TouchableOpacity>
   {loading?<View style={[s.card,s.row]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Loading…</Text></View>:null}
   {error?<View style={s.card}><Text style={{color:"#b91c1c",fontWeight:"700"}}>Could not load this view</Text><Text style={s.body}>{error}</Text></View>:null}
   {panel==="overview"&&data&&<><View style={s.card}><Text style={s.heading}>School snapshot</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{Object.entries(data.stats||{}).map(([k,v])=>metric(k,v))}</View></View><View style={s.card}><Text style={s.heading}>Open alerts</Text>{(data.openAlerts||[]).length?data.openAlerts.map((x:any)=><View key={x.id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.title}</Text><Text style={s.muted}>{x.severity||"medium"} · {x.status||"open"}</Text></View>):<Text style={s.muted}>No open alerts returned.</Text>}</View><View style={s.card}><Text style={s.heading}>Recent lessons and assignments</Text>{[...(data.recentLessons||[]).map((x:any)=>({...x,kind:"Lesson"})),...(data.recentAssignments||[]).map((x:any)=>({...x,kind:"Assignment"}))].slice(0,12).map((x:any)=><View key={x.kind+"-"+x.id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.kind}: {x.title||"Untitled"}</Text><Text style={s.muted}>{x.createdAt?new Date(x.createdAt).toLocaleDateString():""}</Text></View>)}</View></>}
   {(panel==="teachers"||panel==="students"||panel==="prefects")&&<View style={s.card}><Text style={s.heading}>{panels.find(x=>x.id===panel)?.title}</Text>{(Array.isArray(data)?data:[]).length===0?<Text style={s.muted}>No records returned.</Text>:(data as any[]).map((x:any)=><View key={x.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.name||("User #"+x.id)}</Text><Text style={s.muted}>{x.email||x.subject||x.grade||x.role||""}{x.isPrefect?" · Prefect":""}{x.isBlocked?" · Blocked":""}{x.isSuspended?" · Suspended":""}</Text>{x.performanceScore!=null?<Text style={s.muted}>Performance score: {x.performanceScore} · badges: {x.badgeCount??0}</Text>:null}{panel!=="prefects"?<TouchableOpacity onPress={async()=>{try{const activity=await request(`/api/manager/users/${x.id}/activity`);Alert.alert("Activity summary",JSON.stringify({user:activity.user,counts:activity.counts},null,2));}catch(e){Alert.alert("Activity unavailable",e instanceof Error?e.message:"Please retry.");}}}><Text style={{color:colors.primary,fontSize:12,marginTop:5}}>View activity summary</Text></TouchableOpacity>:null}</View>)}</View>}
   {panel==="reports"&&data&&<View style={s.card}><Text style={s.heading}>School reports overview</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{Object.entries(data).map(([k,v])=>metric(k,v))}</View><Text style={s.muted}>Finance figures are read-only here. Payment changes and owner financial controls remain owner-authorized.</Text></View>}
   {(panel==="transfers"||panel==="reportReview")&&<View style={s.card}><Text style={s.heading}>{panel==="transfers"?"Pending transfer requests":"Pending academic reports"}</Text>{(Array.isArray(data)?data:[]).length===0?<Text style={s.muted}>No pending items are available for your permissions.</Text>:(data as any[]).map((item:any)=>{
    const kind=panel==="transfers"?"transfer":"report";const key=kind+"-"+item.id;const canReview=kind==="transfer"?permissions.transferReview:permissions.reportReview;
    const subjectRows=item.draft_content?.subjectPerformance||item.draft_content?.factualRecords?.marksSummary?.subjectPerformance||[];
    return <View key={item.id} style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10,marginTop:8,gap:7}}>
     <Text style={s.body}>{kind==="transfer"?(item.learner_name||("Learner #"+item.learner_id))+" · Transfer #"+item.id:(item.learner_name||("Learner #"+item.learner_id))+" · "+item.term_label+" · Report #"+item.id}</Text>
     <Text style={s.muted}>{kind==="transfer"?item.reason:(item.report_type==="attendance_register"?"Attendance register":"Term performance")}</Text>
     {kind==="report"&&subjectRows.map((row:any)=><Text key={row.subject} style={s.muted}>{row.subject}: {row.percentage}% ({row.earnedMarks}/{row.possibleMarks} marks)</Text>)}
     {kind==="report"&&<Text style={s.muted}>{JSON.stringify(item.draft_content||{})}</Text>}
     <TextInput accessibilityLabel={"Review comments for "+kind+" "+item.id} value={reviewNotes[key]||""} onChangeText={value=>setReviewNotes(notes=>({...notes,[key]:value}))} multiline placeholder="Reviewer comments (required for rejection)" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:8,padding:10,minHeight:72,color:colors.foreground}}/>
     <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>
      <TouchableOpacity disabled={!canReview||reviewBusy!==null} onPress={()=>void reviewItem(kind,Number(item.id),"approved")} style={{backgroundColor:canReview?colors.primary:colors.border,paddingHorizontal:12,paddingVertical:9,borderRadius:8,opacity:reviewBusy?0.6:1}}><Text style={{color:"#fff",fontWeight:"700"}}>Approve</Text></TouchableOpacity>
      <TouchableOpacity disabled={!canReview||reviewBusy!==null||!(reviewNotes[key]||"").trim()} onPress={()=>void reviewItem(kind,Number(item.id),"rejected")} style={{borderWidth:1,borderColor:colors.border,paddingHorizontal:12,paddingVertical:9,borderRadius:8,opacity:reviewBusy?0.6:1}}><Text style={s.body}>Reject</Text></TouchableOpacity>
     </View>
     {!canReview&&<Text style={s.muted}>You can view this queue but do not have approval permission.</Text>}
    </View>;
   })}</View>}
  </ScrollView>
 </View>;
}
