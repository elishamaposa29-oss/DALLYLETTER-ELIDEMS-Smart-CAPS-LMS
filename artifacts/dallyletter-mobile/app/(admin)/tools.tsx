import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type ToolSection = "command-center" | "alerts" | "settings" | "ai" | "safety" | "financial";
type Row = Record<string, any> & { id?: number };
const choices: {id: ToolSection; title: string; description: string; icon: string}[] = [
  {id:"command-center",title:"Command Centre",description:"Platform health, service checks, metrics and audit events",icon:"activity"},
  {id:"alerts",title:"Owner alerts",description:"Review and resolve reports sent to the school",icon:"bell"},
  {id:"settings",title:"Platform settings",description:"Configure the payment methods shown to learners",icon:"sliders"},
  {id:"ai",title:"ELIDEMS AI",description:"Provider status and safe connection checks",icon:"cpu"},
  {id:"safety",title:"Safety administration",description:"Review content flags and record moderation decisions",icon:"shield"},
  {id:"financial",title:"Financial tools",description:"Payment summary and staff-payment records",icon:"dollar-sign"},
];

export default function OwnerTools() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const params = useLocalSearchParams<{section?: string}>();
  const section = (choices.some(x=>x.id===params.section) ? params.section : "command-center") as ToolSection;
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [data,setData] = useState<any>(null);
  const [settings,setSettings] = useState<Record<string,string>>({});
  const [resolution,setResolution] = useState("");
  const [reviewNote,setReviewNote] = useState("");
  const [aiPrompt,setAiPrompt] = useState("");
  const [aiReply,setAiReply] = useState("");
  const [provider,setProvider] = useState("mock");
  const [notice,setNotice] = useState("");
  const request = useCallback(async(path:string, init:RequestInit={})=>{
    const headers = new Headers(init.headers);
    if(token) headers.set("Authorization","Bearer "+token);
    if(init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
    const response=await fetch(getApiUrl(path),{...init,headers});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload;
  },[token]);

  const load = useCallback(async()=>{
    setLoading(true); setError(""); setNotice("");
    try {
      if(section==="command-center") {
        const [health,snapshot,events]=await Promise.all([
          request("/api/owner/command-center/health"),
          request("/api/owner/command-center/snapshot"),
          request("/api/owner/command-center/events?limit=30"),
        ]);
        setData({health,snapshot,events:Array.isArray(events?.events)?events.events:[]});
      } else if(section==="alerts") {
        const result=await request("/api/owner-alerts"); setData(Array.isArray(result)?result:[]);
      } else if(section==="settings") {
        const result=await request("/api/settings"); setSettings(result && typeof result==="object"?result:{}); setData(result);
      } else if(section==="ai") {
        const result=await request("/api/ai/status"); setData(result); setProvider(String(result.configuredProvider||result.provider||"mock"));
      } else if(section==="safety") {
        const result=await request("/api/content-flags"); setData(Array.isArray(result)?result:[]);
      } else {
        const [summary,staff,payments]=await Promise.all([
          request("/api/staff-payments/summary"),
          request("/api/staff-payments"),
          request("/api/payments"),
        ]);
        setData({summary,staff:Array.isArray(staff)?staff:[],payments:Array.isArray(payments)?payments:[]});
      }
    } catch(e) { setError(e instanceof Error?e.message:"Could not load this section."); }
    finally { setLoading(false); }
  },[request,section]);

  useEffect(()=>{void load();},[load]);

  const act = async(label:string, fn:()=>Promise<void>)=>{
    setBusy(true); setError(""); setNotice("");
    try {await fn(); setNotice(label); await load();}
    catch(e){setError(e instanceof Error?e.message:"Action failed.");}
    finally{setBusy(false);}
  };
  const patchSettings=()=>act("Settings saved.",async()=>{
    const safe:Record<string,string>={};
    for(const k of ["paynow_url","paypal_url","trust_wallet","ecocash_number","payment_instructions","docs_url"]) if(typeof settings[k]==="string") safe[k]=settings[k];
    await request("/api/settings",{method:"PATCH",body:JSON.stringify(safe)});
  });
  const testAI=()=>act("AI connection check completed.",async()=>{
    const result=await request("/api/ai/test-connection",{method:"POST",body:"{}"});
    setNotice(result.success?("AI test succeeded · "+(result.provider||"provider")):("AI test failed · "+(result.error||"check provider configuration")));
  });
  const saveProvider=()=>act("AI provider selection saved.",async()=>{
    await request("/api/ai/settings",{method:"POST",body:JSON.stringify({provider})});
  });
  const askAI=()=>act("ELIDEMS AI replied.",async()=>{
    if(!aiPrompt.trim()) throw new Error("Enter a question first.");
    const result=await request("/api/ai/chat",{method:"POST",body:JSON.stringify({messages:[{role:"user",content:aiPrompt.trim()}]})});
    setAiReply(String(result.response||"No response returned."));
  });
  const markAlert= (id:number, resolve:boolean)=>act(resolve?"Alert resolved.":"Alert marked read.",async()=>{
    if(resolve && !resolution.trim()) throw new Error("Enter a resolution note before resolving the alert.");
    await request(`/api/owner-alerts/${id}/${resolve?"resolve":"read"}`,{method:"PUT",body:resolve?JSON.stringify({resolution:resolution.trim()}):"{}"});
    setResolution("");
  });
  const reviewFlag=(id:number,status:"reviewed"|"dismissed"|"actioned")=>act("Safety review saved.",async()=>{
    await request(`/api/content-flags/${id}`,{method:"PATCH",body:JSON.stringify({status,reviewNote:reviewNote.trim()})});
    setReviewNote("");
  });

  const s=StyleSheet.create({
    root:{flex:1,backgroundColor:colors.background},
    header:{backgroundColor:colors.primary,paddingTop:insets.top+16,paddingHorizontal:18,paddingBottom:18},
    title:{fontSize:22,fontFamily:"Inter_700Bold",color:"#fff"},
    subtitle:{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:5},
    content:{padding:14,paddingBottom:110,gap:10},
    card:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:14,gap:8},
    row:{flexDirection:"row",alignItems:"center",gap:10},
    heading:{fontSize:16,fontFamily:"Inter_700Bold",color:colors.foreground},
    body:{fontSize:13,color:colors.foreground,lineHeight:19},
    muted:{fontSize:12,color:colors.mutedForeground,lineHeight:17},
    input:{minHeight:44,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:10,color:colors.foreground,backgroundColor:colors.background},
    button:{minHeight:42,borderRadius:8,paddingHorizontal:12,paddingVertical:10,alignItems:"center",justifyContent:"center",backgroundColor:colors.primary},
    buttonText:{color:"#fff",fontSize:13,fontFamily:"Inter_600SemiBold"},
    chip:{padding:9,borderWidth:1,borderColor:colors.border,borderRadius:8},
    metric:{flexGrow:1,flexBasis:"43%",padding:12,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background},
    metricValue:{fontSize:22,fontFamily:"Inter_700Bold",color:colors.primary},
  });
  const field=(label:string,key:string,multiline=false)=> <View key={key} style={{gap:5}}><Text style={s.muted}>{label}</Text><TextInput style={[s.input,multiline?{minHeight:86,textAlignVertical:"top"}:{}]} value={settings[key]||""} onChangeText={v=>setSettings(old=>({...old,[key]:v}))} multiline={multiline} autoCapitalize="none" placeholder={label} placeholderTextColor={colors.mutedForeground}/></View>;
  const metric=(label:string,value:any)=><View key={label} style={s.metric}><Text style={s.metricValue}>{value===null||value===undefined?"—":String(value)}</Text><Text style={s.muted}>{label}</Text></View>;
  const sectionTitle=choices.find(x=>x.id===section)?.title||"Owner tools";

  if(!user) return <View style={s.root}><Text style={s.body}>Sign in to continue.</Text></View>;
  if(!["owner","platform_owner"].includes(String(user.role||"").toLowerCase().replace(/[ -]+/g,"_"))) return <View style={s.root}><View style={s.header}><Text style={s.title}>Owner tools restricted</Text><Text style={s.subtitle}>Owner authorization is required. API permissions remain authoritative.</Text></View><View style={s.content}><Text style={s.body}>This screen is reserved for the platform owner.</Text><TouchableOpacity style={s.button} onPress={()=>router.replace("/(admin)/home" as any)}><Text style={s.buttonText}>Return to dashboard</Text></TouchableOpacity></View></View>;
  return <View style={s.root}>
    <View style={s.header}>
      <TouchableOpacity onPress={()=>router.back()} style={[s.row,{marginBottom:10}]}><Feather name="arrow-left" size={18} color="#fff"/><Text style={{color:"#fff"}}>Back</Text></TouchableOpacity>
      <Text style={s.title}>{sectionTitle}</Text>
      <Text style={s.subtitle}>Owner administration · API permissions remain authoritative</Text>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
        {choices.map(x=><TouchableOpacity key={x.id} style={[s.chip,{backgroundColor:section===x.id?colors.primary:colors.card}]} onPress={()=>router.replace({pathname:"/(admin)/tools",params:{section:x.id}} as any)}><Text style={{color:section===x.id?"#fff":colors.foreground,fontSize:12}}>{x.title}</Text></TouchableOpacity>)}
      </ScrollView>
      {loading?<View style={[s.card,s.row]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Loading live data…</Text></View>:null}
      {error?<View style={[s.card,{borderColor:"#dc2626"}]}><Text style={{color:"#dc2626",fontWeight:"700"}}>Could not load/action failed</Text><Text style={s.body}>{error}</Text></View>:null}
      {notice?<View style={s.card}><Text style={{color:"#15803d",fontWeight:"700"}}>{notice}</Text></View>:null}
      <TouchableOpacity style={[s.button,{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={()=>void load()} disabled={loading||busy}><Text style={[s.buttonText,{color:colors.foreground}]}>Refresh</Text></TouchableOpacity>

      {section==="command-center" && data && <>
        <View style={s.card}><Text style={s.heading}>Platform snapshot</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
          {["students","teachers","prefects","managers","activeUsers","suspendedUsers","blockedUsers","lessons","classes","assignments","revenue","outstandingPayments","openAlerts","criticalAlerts","unreadOwnerAlerts","failedJobs","pendingAiActions"].map(k=>metric(k,data.snapshot?.[k]))}
        </View></View>
        <View style={s.card}><Text style={s.heading}>Service health</Text>{(data.health?.services||[]).map((v:Row)=><View key={v.name} style={[s.row,{justifyContent:"space-between",paddingVertical:5}]}><View style={{flex:1}}><Text style={s.body}>{v.name}</Text><Text style={s.muted}>{v.message}</Text></View><Text style={{fontSize:12,fontWeight:"700",color:v.status==="healthy"?"#15803d":v.status==="offline"?"#dc2626":"#a16207"}}>{v.status}</Text></View>)}</View>
        <View style={s.card}><Text style={s.heading}>Recent audit events</Text>{(data.events||[]).length===0?<Text style={s.muted}>No events available.</Text>:(data.events||[]).map((e:Row)=><View key={e.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{e.action}</Text><Text style={s.muted}>{e.actor||"Unknown actor"} · {e.actorRole||"unknown role"} · {e.timestamp?new Date(e.timestamp).toLocaleString():""}</Text></View>)}</View>
      </>}
      {section==="alerts" && <>{(Array.isArray(data)?data:[]).length===0?<View style={s.card}><Text style={s.body}>No owner alerts found.</Text></View>:(data as Row[]).map(a=><View key={a.id} style={s.card}><Text style={s.heading}>{a.title||"Safety report"}</Text><Text style={s.muted}>{a.category||"general"} · {a.severity||"medium"} · {a.status||"open"} · {a.reporterName||"Reporter"}</Text><Text style={s.body}>{a.description}</Text>{a.resolution?<Text style={s.muted}>Resolution: {a.resolution}</Text>:null}{a.status!=="resolved"?<><TextInput style={s.input} value={resolution} onChangeText={setResolution} placeholder="Resolution note (required to resolve)" placeholderTextColor={colors.mutedForeground}/><View style={[s.row,{flexWrap:"wrap"}]}><TouchableOpacity style={[s.button,{flex:1}]} onPress={()=>void markAlert(Number(a.id),false)} disabled={busy}><Text style={s.buttonText}>Mark read</Text></TouchableOpacity><TouchableOpacity style={[s.button,{flex:1,backgroundColor:"#15803d"}]} onPress={()=>void markAlert(Number(a.id),true)} disabled={busy}><Text style={s.buttonText}>Resolve</Text></TouchableOpacity></View></>:null}</View>)}</>}
      {section==="settings" && <View style={s.card}><Text style={s.heading}>Learner payment settings</Text><Text style={s.muted}>Only the public payment settings supported by the existing API are editable here. Secret credentials are not exposed.</Text>{field("Paynow checkout URL","paynow_url")}{field("PayPal URL or handle","paypal_url")}{field("EcoCash number","ecocash_number")}{field("Trust Wallet address","trust_wallet")}{field("Payment instructions","payment_instructions",true)}{field("Documentation URL","docs_url")}<TouchableOpacity style={s.button} onPress={()=>void patchSettings()} disabled={busy}><Text style={s.buttonText}>{busy?"Saving…":"Save settings"}</Text></TouchableOpacity></View>}
      {section==="ai" && <View style={s.card}><Text style={s.heading}>Provider status</Text><Text style={s.body}>Provider: {data?.provider||"unknown"} · {data?.isLive?"live provider":"mock/fallback"}</Text><Text style={s.muted}>Configured: {data?.configuredProvider||"unknown"} · Gemini key: {data?.hasGeminiKey?"configured":"not configured"} · OpenAI key: {data?.hasOpenAIKey?"configured":"not configured"} · Anthropic key: {data?.hasAnthropicKey?"configured":"not configured"}</Text><Text style={s.muted}>Choose a provider only when its server-side credentials are configured.</Text><View style={[s.row,{flexWrap:"wrap"}]}>{["mock","gemini","openai","anthropic"].map(p=><TouchableOpacity key={p} style={[s.chip,{backgroundColor:provider===p?colors.primary:colors.card}]} onPress={()=>setProvider(p)}><Text style={{color:provider===p?"#fff":colors.foreground}}>{p}</Text></TouchableOpacity>)}</View><TouchableOpacity style={s.button} onPress={()=>void saveProvider()} disabled={busy}><Text style={s.buttonText}>Save provider</Text></TouchableOpacity><TouchableOpacity style={[s.button,{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={()=>void testAI()} disabled={busy}><Text style={[s.buttonText,{color:colors.foreground}]}>Test connection</Text></TouchableOpacity><Text style={s.heading}>ELIDEMS AI assistant</Text><TextInput style={[s.input,{minHeight:75,textAlignVertical:"top"}]} multiline value={aiPrompt} onChangeText={setAiPrompt} placeholder="Ask an authorized staff question…" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={s.button} onPress={()=>void askAI()} disabled={busy}><Text style={s.buttonText}>{busy?"Working…":"Ask AI"}</Text></TouchableOpacity>{aiReply?<Text style={s.body}>{aiReply}</Text>:null}</View>}
      {section==="safety" && <>{(Array.isArray(data)?data:[]).length===0?<View style={s.card}><Text style={s.body}>No content flags found.</Text></View>:(data as Row[]).map(f=><View key={f.id} style={s.card}><Text style={s.heading}>{f.contentType||"Content"} #{f.contentId}</Text><Text style={s.muted}>{f.severity||"medium"} · {f.status||"pending"} · {f.createdAt?new Date(f.createdAt).toLocaleString():""}</Text><Text style={s.body}>{f.reason}</Text>{f.contentText?<Text style={s.muted}>{f.contentText}</Text>:null}<TextInput style={[s.input,{minHeight:60}]} value={reviewNote} onChangeText={setReviewNote} placeholder="Review note (optional)" placeholderTextColor={colors.mutedForeground}/><View style={[s.row,{flexWrap:"wrap"}]}>{(["reviewed","dismissed","actioned"] as const).map(st=><TouchableOpacity key={st} style={[s.button,{flex:1,backgroundColor:st==="actioned"?"#b91c1c":colors.primary}]} onPress={()=>void reviewFlag(Number(f.id),st)} disabled={busy}><Text style={s.buttonText}>{st}</Text></TouchableOpacity>)}</View></View>)}</>}
      {section==="financial" && data && <><View style={s.card}><Text style={s.heading}>Staff payment summary</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{metric("Total paid",data.summary?.total)}{metric("Payment records",data.summary?.count)}{Object.entries(data.summary?.byRole||{}).map(([k,v])=>metric(k,v))}</View></View><View style={s.card}><Text style={s.heading}>Staff payments</Text>{(data.staff||[]).length===0?<Text style={s.muted}>No staff payment records.</Text>:(data.staff||[]).map((p:Row)=><View key={p.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{p.recipientName||p.name||("Staff #"+p.recipientId)} · {p.amount}</Text><Text style={s.muted}>{p.status||"recorded"} · {p.createdAt?new Date(p.createdAt).toLocaleDateString():""} · {p.notes||""}</Text></View>)}</View><View style={s.card}><Text style={s.heading}>School fee records</Text>{(data.payments||[]).length===0?<Text style={s.muted}>No payment records.</Text>:(data.payments||[]).slice(0,100).map((p:Row)=><View key={p.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={s.body}>{p.studentName||("Learner #"+p.studentId)} · {p.amount}</Text><Text style={s.muted}>{p.month||""} {p.year||""} · {p.status||"unknown"}</Text></View>)}</View></>}
    </ScrollView>
  </View>;
}
