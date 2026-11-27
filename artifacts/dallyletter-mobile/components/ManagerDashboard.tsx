import { FeedbackMessage } from "@/components/FeedbackMessage";
import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Panel="overview"|"teachers"|"students"|"prefects"|"reports";
const panels:{id:Panel;title:string;icon:string}[]=[{id:"overview",title:"Overview",icon:"bar-chart-2"},{id:"teachers",title:"Teachers",icon:"users"},{id:"students",title:"Students",icon:"book-open"},{id:"prefects",title:"Prefects",icon:"star"},{id:"reports",title:"Reports",icon:"file-text"}];
export default function ManagerDashboard(){
 const colors=useColors(), insets=useSafeAreaInsets();
 const {user,token}=useAuth();
 const role=String(user?.role||"").toLowerCase().replace(/[ -]+/g,"_");
 const roleAllowed=["owner","platform_owner","manager","senior_manager","junior_manager"].includes(role)||(role==="teacher"&&Boolean((user as any)?.isManager));
 const [panel,setPanel]=useState<Panel>("overview"),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [permissionData,setPermissionData]=useState<any>(null),[permissionLoading,setPermissionLoading]=useState(true);
 const [unread,setUnread]=useState({messages:0,activity:0,groups:0,groupActivity:0});
 useEffect(()=>{if(!token||!user?.id){setUnread({messages:0,activity:0,groups:0,groupActivity:0});return;}let active=true;const refresh=async()=>{try{const [m,n]=await Promise.all([fetch(getApiUrl("/api/messages/unread-summary"),{headers:{Authorization:"Bearer "+token},cache:"no-store"}),fetch(getApiUrl("/api/notifications"),{headers:{Authorization:"Bearer "+token},cache:"no-store"})]);if(!m.ok||!n.ok)return;const [messages,notifications]=await Promise.all([m.json(),n.json()]);if(active)setUnread({messages:Number(messages.messageUnread||0),groups:Number(messages.groupUnread||0),activity:Array.isArray(notifications)?notifications.filter((item:any)=>!item.isRead).length:0,groupActivity:Array.isArray(notifications)?notifications.filter((item:any)=>!item.isRead&&(String(item.type||"").toLowerCase().includes("group")||String(item.link||"").toLowerCase().includes("group"))).length:0});}catch{/* Retain last known counts while offline. */}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer);};},[token,user?.id]);
 const can=(key:string)=>permissionData?.isOwner===true||permissionData?.permissions?.[key]===true;
 const allowed=roleAllowed&&permissionData!==null&&(permissionData.isOwner===true||Object.values(permissionData.permissions||{}).some((granted:any)=>granted===true));
 const request=useCallback(async(path:string)=>{
  const response=await fetch(getApiUrl(path),{headers:token?{Authorization:"Bearer "+token}:{}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);
  return payload;
 },[token]);
 useEffect(()=>{
  let active=true;
  const loadPermissions=async()=>{
   setPermissionLoading(true);setError("");
   try{
    const result=await request("/api/manager-permissions/me");
    if(!active)return;
    setPermissionData(result);
    const hasOverview=result.isOwner===true||result.permissions?.["manager.dashboard.view"]===true;
    const hasUsers=result.isOwner===true||result.permissions?.["users.view"]===true;
    const hasReports=result.isOwner===true||result.permissions?.["reports.view"]===true;
    if(!hasOverview)setPanel(hasUsers?"teachers":hasReports?"reports":"overview");
    if(!hasOverview&&!hasUsers&&!hasReports&&Object.values(result.permissions||{}).every((granted:any)=>granted!==true))setError("No manager workspace permissions have been granted. Open More tools to see available access.");
   }catch(e){if(active)setError(e instanceof Error?e.message:"Manager permissions could not be loaded.");}
   finally{if(active)setPermissionLoading(false);}
  };
  void loadPermissions();
  return()=>{active=false;};
 },[request]);
 const load=useCallback(async()=>{
  if(!allowed){setLoading(false);return;}
  const permitted=panel==="overview"?can("manager.dashboard.view"):panel==="reports"?can("reports.view"):can("users.view");
  if(!permitted){setError("");setData(null);setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const path=panel==="overview"?"/api/manager/dashboard":panel==="teachers"?"/api/manager/teachers":panel==="students"?"/api/manager/students":panel==="prefects"?"/api/manager/prefects":"/api/manager/reports/overview";
   setData(await request(path));
  }catch(e){setError(e instanceof Error?e.message:"Could not load manager data.");}
  finally{setLoading(false);}
 },[panel,request,allowed,permissionData]);
 useEffect(()=>{if(!permissionLoading&&allowed)void load();},[load,permissionLoading,allowed]);
 const s=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},header:{backgroundColor:colors.primary,paddingTop:insets.top+14,paddingHorizontal:18,paddingBottom:18},
  title:{fontSize:23,fontFamily:"Inter_700Bold",color:"#fff"},subtitle:{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:5},
  content:{padding:14,paddingBottom:110,gap:10},card:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:13,gap:5},
  row:{flexDirection:"row",alignItems:"center",gap:8},heading:{fontSize:15,fontFamily:"Inter_700Bold",color:colors.foreground},body:{fontSize:13,color:colors.foreground},muted:{fontSize:12,color:colors.mutedForeground,lineHeight:17},
  chip:{paddingHorizontal:12,paddingVertical:9,borderRadius:8,borderWidth:1,borderColor:colors.border},metric:{flexGrow:1,flexBasis:"40%",padding:12,borderRadius:10,borderWidth:1,borderColor:colors.border},
 });
 const metric=(label:string,value:any)=><View key={label} style={s.metric}><Text style={{fontSize:22,fontWeight:"700",color:colors.primary}}>{value??"—"}</Text><Text style={s.muted}>{label}</Text></View>;
 if(!roleAllowed)return <View style={s.root}><Text style={s.body}>Manager access required. Administrator status alone does not grant manager permissions.</Text></View>;
 if(permissionLoading)return <View style={[s.root,{justifyContent:"center",alignItems:"center"}]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Checking Owner-assigned permissions…</Text></View>;
 if(!allowed)return <View style={s.root}><View style={[s.card,{margin:16}]}><Text style={s.heading}>Manager access not granted</Text><Text style={s.body}>{error||"Ask the Owner to grant the dashboard or a permitted data-view capability."}</Text></View></View>;
 return <View style={s.root}>
  <View style={s.header}>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:12,flexWrap:"wrap"}}>
    <TouchableOpacity onPress={()=>router.back()} style={[s.row,{paddingVertical:6}]}><Feather name="arrow-left" size={18} color="#fff"/><Text style={{color:"#fff"}}>Back</Text></TouchableOpacity>
    <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open manager tools" onPress={()=>router.push("/(manager)/more" as any)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:9,backgroundColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",gap:6}}><Feather name="grid" size={15} color="#fff"/><Text style={{color:"#fff",fontSize:12,fontWeight:"700"}}>More tools</Text>{(unread.messages+unread.activity)>0?<View accessibilityRole="text" accessibilityLabel={(unread.messages+unread.activity)+" unread messages and notifications"} style={{flexDirection:"row",alignItems:"center",gap:2,backgroundColor:"#0B1E3A",borderWidth:1.5,borderColor:"#C9A227",borderRadius:7,paddingHorizontal:4,paddingVertical:2}}><Text style={{color:"#FFD700",fontSize:9,fontWeight:"900"}}>D</Text><Text style={{color:"#FFD700",fontSize:9,fontWeight:"900"}}>{unread.messages+unread.activity>99?"99+":unread.messages+unread.activity}</Text></View>:null}</TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open manager account settings" onPress={()=>router.push("/(manager)/profile" as any)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:9,backgroundColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",gap:6}}><Feather name="user" size={15} color="#fff"/><Text style={{color:"#fff",fontSize:12,fontWeight:"700"}}>Account</Text></TouchableOpacity>
    </View>
   </View>
   <Text style={s.title}>Manager dashboard</Text>
    {(can("messages.send")||can("groups.manage")||permissionData?.isOwner===true)?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open study groups and group chat" onPress={()=>router.push("/(manager)/group-chat" as any)} style={{marginTop:12,paddingHorizontal:12,paddingVertical:9,borderRadius:9,backgroundColor:"rgba(255,255,255,0.16)",flexDirection:"row",alignItems:"center",gap:7}}><Feather name="message-circle" size={16} color="#fff"/><Text style={{color:"#fff",fontSize:12,fontWeight:"700"}}>Study Groups & Chat</Text></TouchableOpacity>:null}<Text style={s.subtitle}>Scoped school oversight · access remains server-authorized</Text>
  </View>
  <ScrollView contentContainerStyle={s.content}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>{panels.filter(p=>p.id==="overview"?can("manager.dashboard.view"):p.id==="reports"?can("reports.view"):can("users.view")).map(p=><TouchableOpacity key={p.id} style={[s.chip,{backgroundColor:panel===p.id?colors.primary:colors.card}]} onPress={()=>setPanel(p.id)}><Text style={{color:panel===p.id?"#fff":colors.foreground}}>{p.title}</Text></TouchableOpacity>)}</ScrollView>
   <TouchableOpacity style={[s.card,s.row]} onPress={()=>void load()}><Feather name="refresh-cw" size={16} color={colors.primary}/><Text style={s.body}>Refresh live data</Text></TouchableOpacity>
   {loading?<View style={[s.card,s.row]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Loading…</Text></View>:null}
   <FeedbackMessage message={error} tone="error" onDismiss={() => setError("")} />
   {panel==="overview"&&data&&<><View style={s.card}><Text style={s.heading}>School snapshot</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{Object.entries(data.stats||{}).map(([k,v])=>metric(k,v))}</View></View><View style={s.card}><Text style={s.heading}>Open alerts</Text>{(data.openAlerts||[]).length?data.openAlerts.map((x:any)=><View key={x.id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.title}</Text><Text style={s.muted}>{x.severity||"medium"} · {x.status||"open"}</Text></View>):<Text style={s.muted}>No open alerts returned.</Text>}</View><View style={s.card}><Text style={s.heading}>Recent lessons and assignments</Text>{[...(data.recentLessons||[]).map((x:any)=>({...x,kind:"Lesson"})),...(data.recentAssignments||[]).map((x:any)=>({...x,kind:"Assignment"}))].slice(0,12).map((x:any)=><View key={x.kind+"-"+x.id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.kind}: {x.title||"Untitled"}</Text><Text style={s.muted}>{x.createdAt?new Date(x.createdAt).toLocaleDateString():""}</Text></View>)}</View></>}
   {(panel==="teachers"||panel==="students"||panel==="prefects")&&<View style={s.card}><Text style={s.heading}>{panels.find(x=>x.id===panel)?.title}</Text>{(Array.isArray(data)?data:[]).length===0?<Text style={s.muted}>No records returned.</Text>:(data as any[]).map((x:any)=><View key={x.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{x.name||("User #"+x.id)}</Text><Text style={s.muted}>{x.email||x.subject||x.grade||x.role||""}{x.isPrefect?" · Prefect":""}{x.isBlocked?" · Blocked":""}{x.isSuspended?" · Suspended":""}</Text>{x.performanceScore!=null?<Text style={s.muted}>Performance score: {x.performanceScore} · badges: {x.badgeCount??0}</Text>:null}{panel!=="prefects"?<TouchableOpacity onPress={async()=>{try{const activity=await request(`/api/manager/users/${x.id}/activity`);Alert.alert("Activity summary",JSON.stringify({user:activity.user,counts:activity.counts},null,2));}catch(e){Alert.alert("Activity unavailable",e instanceof Error?e.message:"Please retry.");}}}><Text style={{color:colors.primary,fontSize:12,marginTop:5}}>View activity summary</Text></TouchableOpacity>:null}</View>)}</View>}
   {panel==="reports"&&data&&<View style={s.card}><Text style={s.heading}>School reports overview</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{Object.entries(data).map(([k,v])=>metric(k,v))}</View><Text style={s.muted}>Finance figures are read-only here. Payment changes and owner financial controls remain owner-authorized.</Text></View>}
  </ScrollView>
 </View>;
}
