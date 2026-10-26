import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const TABS = ["Overview","Qualifications","Subjects","Enrollments","Achievements"] as const;
type Tab = typeof TABS[number];
type Row = Record<string, any>;

export default function MobileProfileHub() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const params = useLocalSearchParams<{userId?: string}>();
  const targetId = params.userId ? Number(params.userId) : user?.id;
  const isOwn = Boolean(user && targetId === user.id);
  const isOwner = ["owner","admin","platform_owner"].includes(String(user?.role||"").toLowerCase());
  const [tab,setTab] = useState<Tab>("Overview");
  const [profile,setProfile] = useState<Row|null>(null);
  const [qualifications,setQualifications] = useState<Row[]>([]);
  const [queue,setQueue] = useState<Row[]>([]);
  const [subjects,setSubjects] = useState<string[]>([]);
  const [subjectInput,setSubjectInput] = useState("");
  const [enrollments,setEnrollments] = useState<Row[]>([]);
  const [achievements,setAchievements] = useState<Row[]>([]);
  const [email,setEmail] = useState("");
  const [otp,setOtp] = useState("");
  const [emailVerified,setEmailVerified] = useState(false);
  const [newQualificationTitle,setNewQualificationTitle] = useState("");
  const [payoutMethod,setPayoutMethod] = useState("ecocash");
  const [payoutDestination,setPayoutDestination] = useState("");
  const [payoutDestinationMasked,setPayoutDestinationMasked] = useState("");
  const [bankName,setBankName] = useState("");
  const [accountHolder,setAccountHolder] = useState("");
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(false);
  const api = useCallback(async(path:string,init:RequestInit={})=>{
    const response=await fetch(getApiUrl(path),{...init,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(init.headers as Record<string,string>||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Request failed");
    return data;
  },[token]);

  const load=useCallback(async()=>{
    if(!targetId||!Number.isSafeInteger(targetId)||!user)return;
    setLoading(true);
    try{
      if(isOwn){
        const [me,q,s,e,a,en,n,p]=await Promise.all([
          api("/api/users/"+targetId),api("/api/users/me/qualifications"),api("/api/users/me/subjects"),
          api("/api/users/me/enrollments-summary").catch(()=>({})),api("/api/achievements/my").catch(()=>[]),
          api("/api/users/me/enrollments").catch(()=>[]),api("/api/users/me/notification-email").catch(()=>({})),
          api("/api/users/me/payout-preferences").catch(()=>({}))
        ]);
        setProfile({id:me.id,display_name:me.name,avatar:me.avatarUrl,bio:me.bio,role:me.role,verified_qualifications:(q||[]).filter((x:Row)=>x.verification_status==="verified"),subjects_to_teach:s?.subjects_to_teach||[],grade:me.grade});
        setQualifications(Array.isArray(q)?q:[]);setSubjects(Array.isArray(s?.subjects_to_teach)?s.subjects_to_teach:[]);setSubjectInput(Array.isArray(s?.subjects_to_teach)?s.subjects_to_teach.join(", "):"");
        setEnrollments(Array.isArray(en)?en:[]);setAchievements(Array.isArray(a)?a:[]);
        setEmail(n.notification_email||"");setEmailVerified(Boolean(n.notification_email_verified_at));setPayoutMethod(p.method||"ecocash");setPayoutDestinationMasked(p.destination_masked||"");setBankName(p.bank_name||"");setAccountHolder(p.account_name_holder||"");
        if(isOwner){const pending=await api("/api/qualifications/pending").catch(()=>[]);setQueue(Array.isArray(pending)?pending:[]);}
      }else{
        const [p,a]=await Promise.all([api("/api/users/"+targetId+"/public-profile"),api("/api/achievements/user/"+targetId).catch(()=>[])]);
        setProfile(p);setAchievements(Array.isArray(a)?a:[]);
        setQualifications(Array.isArray(p.verified_qualifications)?p.verified_qualifications:[]);
        setSubjects(Array.isArray(p.subjects_to_teach)?p.subjects_to_teach:[]);
      }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load profile.");}
    finally{setLoading(false);}
  },[api,targetId,user,isOwn,isOwner]);
  useEffect(()=>{void load();},[load]);

  const act=async(fn:()=>Promise<void>)=>{setLoading(true);setMessage("");try{await fn();}catch(e){setMessage(e instanceof Error?e.message:"Action failed.");}finally{setLoading(false);}};
  const upload=async(id:number)=>{
    const picked=await DocumentPicker.getDocumentAsync({type:["application/pdf","image/jpeg","image/png"],copyToCacheDirectory:true});
    if(picked.canceled||!picked.assets?.[0])return;
    const asset=picked.assets[0];
    if(asset.size&&asset.size>10*1024*1024){Alert.alert("File too large","Choose a PDF/JPG/PNG up to 10 MB.");return;}
    await act(async()=>{
      const form=new FormData();
      form.append("file",{uri:asset.uri,name:asset.name||"qualification-document.pdf",type:asset.mimeType||"application/pdf"} as any);
      const result=await api("/api/qualifications/"+id+"/document",{method:"POST",body:form});
      setMessage(result.message||"Document uploaded for verification.");await load();
    });
  };
  const addQualification=async()=>{
    if(!newQualificationTitle.trim())return;
    await act(async()=>{await api("/api/qualifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:newQualificationTitle.trim()})});setNewQualificationTitle("");await load();setMessage("Qualification saved as pending verification.");});
  };
  const verify=async(id:number,status:"verified"|"rejected")=>act(async()=>{await api("/api/qualifications/"+id+"/verify",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});await load();setMessage("Qualification "+status+".");});
  const openDocument=async(id:number,fileName?:string,mimeType?:string)=>act(async()=>{
    const ext=(fileName?.split(".").pop()|| (mimeType==="image/jpeg"?"jpg":mimeType==="image/png"?"png":"pdf")).replace(/[^a-z0-9]/gi,"").slice(0,8)||"pdf";
    const target=(FileSystem.documentDirectory||FileSystem.cacheDirectory||"")+"qualification-document-"+id+"."+ext;
    const result=await FileSystem.downloadAsync(getApiUrl("/api/qualifications/"+id+"/document"),target,{headers:token?{Authorization:"Bearer "+token}:{}});
    const openUri=Platform.OS==="android"?await FileSystem.getContentUriAsync(result.uri):result.uri;
    await Linking.openURL(openUri);
  });
  const saveSubjects=async()=>act(async()=>{
    const list=[...new Set(subjectInput.split(",").map(v=>v.trim()).filter(Boolean))];
    await api("/api/users/me/subjects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({teaching_subjects:list,subjects_to_teach:list})});
    setSubjects(list);setMessage("Teaching subjects saved.");
  });
  const savePayout=async()=>act(async()=>{
    const body:Row={method:payoutMethod};
    if(payoutMethod==="ecocash")body.ecocash_phone=payoutDestination.trim();
    if(payoutMethod==="paypal")body.paypal_email=payoutDestination.trim();
    if(payoutMethod==="bank"){body.bank_name=bankName.trim();body.account_name_holder=accountHolder.trim();}
    await api("/api/users/me/payout-preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    setPayoutDestination("");const fresh=await api("/api/users/me/payout-preferences");setPayoutDestinationMasked(fresh.destination_masked||"");setMessage("Payout preferences saved. Destination stays masked.");
  });
  const requestOtp=async()=>act(async()=>{const r=await api("/api/users/me/notification-email/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});setMessage(r.message||"Verification code sent.");});
  const verifyOtp=async()=>act(async()=>{const r=await api("/api/users/me/notification-email/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,otp})});setEmailVerified(Boolean(r.verified));setOtp("");setMessage(r.message||"Email verified.");});

  const card={backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:14,padding:14,marginBottom:12} as const;
  const button=(label:string,onPress:()=>void,disabled=false)=> <TouchableOpacity accessibilityRole="button" disabled={disabled||loading} onPress={onPress} style={{paddingVertical:10,paddingHorizontal:12,borderRadius:9,backgroundColor:disabled||loading?colors.border:colors.primary,alignItems:"center",marginTop:8}}><Text style={{color:disabled||loading?colors.mutedForeground:"#fff",fontWeight:"700"}}>{label}</Text></TouchableOpacity>;
  const line=(label:string,value:any)=> <View style={{flexDirection:"row",justifyContent:"space-between",gap:12,marginBottom:9}}><Text style={{color:colors.mutedForeground,flex:1}}>{label}</Text><Text style={{color:colors.foreground,fontWeight:"600",flex:1,textAlign:"right"}}>{value||"—"}</Text></View>;

  if(!user)return <View style={{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:colors.background}}><Text style={{color:colors.foreground}}>Sign in to view profiles.</Text></View>;
  return <View style={{flex:1,backgroundColor:colors.background,paddingTop:insets.top}}>
    <View style={{backgroundColor:colors.primary,padding:18,flexDirection:"row",alignItems:"center",gap:12}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()}><Feather name="arrow-left" size={22} color="#fff"/></TouchableOpacity>
      <View style={{flex:1}}><Text style={{fontSize:21,fontWeight:"800",color:"#fff"}}>Profile Hub</Text><Text style={{fontSize:12,color:"#dce7f6",marginTop:3}}>{profile?.display_name||user.name} · {profile?.role||user.role}</Text></View>
      {loading&&<ActivityIndicator color="#fff"/>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{padding:10,gap:6,backgroundColor:colors.card}}>
      {TABS.map(t=><TouchableOpacity key={t} accessibilityRole="tab" accessibilityState={{selected:tab===t}} onPress={()=>setTab(t)} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:tab===t?colors.primary:colors.background,borderColor:colors.border,borderWidth:1}}><Text style={{fontWeight:"700",color:tab===t?"#fff":colors.foreground}}>{t}</Text></TouchableOpacity>)}
    </ScrollView>
    <ScrollView contentContainerStyle={{padding:14,paddingBottom:50}} keyboardShouldPersistTaps="handled">
      {!!message&&<Text accessibilityRole="alert" style={{...card,color:colors.foreground}}>{message}</Text>}
      {tab==="Overview"&&<View style={card}>
        {line("Name",profile?.display_name)}{line("Role",profile?.role)}{line("Grade",profile?.grade)}{line("Verified qualifications",profile?.verified_qualifications?.length||0)}{line("Subjects",subjects.join(", "))}
        {isOwn&&String(user.role).toLowerCase()==="teacher"&&<View style={{borderTopWidth:1,borderTopColor:colors.border,marginTop:10,paddingTop:10}}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:6}}>Private payout preferences</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginBottom:8}}>Never enter a card number, CVV, PIN, or password.</Text><View style={{flexDirection:"row",gap:6}}>{(["ecocash","paypal","bank"] as const).map(m=><TouchableOpacity key={m} onPress={()=>{setPayoutMethod(m);setPayoutDestination("");}} style={{padding:8,borderRadius:8,backgroundColor:payoutMethod===m?colors.primary:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={{color:payoutMethod===m?"#fff":colors.foreground,fontWeight:"700"}}>{m==="ecocash"?"EcoCash":m==="paypal"?"PayPal":"Bank"}</Text></TouchableOpacity>)}</View>{!!payoutDestinationMasked&&<Text style={{color:colors.mutedForeground,marginTop:8}}>Saved destination: {payoutDestinationMasked}</Text>}{payoutMethod!=="bank"?<TextInput accessibilityLabel={payoutMethod==="paypal"?"PayPal email":"EcoCash phone"} value={payoutDestination} onChangeText={setPayoutDestination} placeholder={payoutMethod==="paypal"?"PayPal email":"EcoCash phone"} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/>:<><TextInput accessibilityLabel="Bank name" value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/><TextInput accessibilityLabel="Account holder" value={accountHolder} onChangeText={setAccountHolder} placeholder="Account holder name" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/></>}{button("Save payout preferences",()=>void savePayout(),payoutMethod==="bank"?(!bankName.trim()||!accountHolder.trim()):!payoutDestination.trim())}</View>}
        {isOwn&&<><Text style={{fontWeight:"800",color:colors.foreground,marginTop:8,marginBottom:6}}>Notification email</Text><TextInput accessibilityLabel="Notification email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={v=>{setEmail(v);setEmailVerified(false);}} placeholder="you@example.com" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground}}/><Text style={{color:emailVerified?"#16a34a":colors.mutedForeground,marginTop:6}}>{emailVerified?"Verified":"Not verified"}</Text>{!emailVerified&&button("Send OTP",()=>void requestOtp())}<TextInput accessibilityLabel="Six digit OTP" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={v=>setOtp(v.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/>{button("Verify email",()=>void verifyOtp(),otp.length!==6)}</>}
      </View>}
      {tab==="Qualifications"&&<View>
        {(qualifications||[]).map((q:Row)=><View key={q.id||q.title} style={card}>{line("Qualification",q.title)}{line("Institution",q.institution)}{line("Year",q.year)}{line("Status",q.verification_status||"verified")}{isOwn&&q.id&&button("Upload PDF/JPG/PNG",()=>void upload(q.id))}</View>)}
        {!qualifications.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No qualifications listed yet.</Text></View>}
        {isOwn&&String(user.role).toLowerCase()==="teacher"&&<View style={card}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:8}}>Add qualification</Text><TextInput accessibilityLabel="Qualification title" value={newQualificationTitle} onChangeText={setNewQualificationTitle} placeholder="Qualification title" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground}}/>{button("Save qualification",()=>void addQualification(),!newQualificationTitle.trim())}</View>}
        {isOwner&&<View style={card}><Text style={{fontSize:16,fontWeight:"800",color:colors.foreground,marginBottom:8}}>Pending verification</Text>{queue.map((q:Row)=><View key={q.id} style={{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:10}}>{line("Teacher",q.teacher_name)}{line("Qualification",q.title)}{line("Institution",q.institution)}{q.document_id&&button("Review document",()=>void openDocument(q.document_id,q.document_file_name,q.document_mime_type))}{button("Verify",()=>void verify(q.id,"verified"))}{button("Reject",()=>void verify(q.id,"rejected"))}</View>)}{!queue.length&&<Text style={{color:colors.mutedForeground}}>No pending qualifications.</Text>}</View>}
      </View>}
      {tab==="Subjects"&&<View style={card}>{subjects.map(s=><Text key={s} style={{color:colors.foreground,paddingVertical:7}}>• {s}</Text>)}{!subjects.length&&<Text style={{color:colors.mutedForeground}}>No subjects listed.</Text>}{isOwn&&String(user.role).toLowerCase()==="teacher"&&<><TextInput accessibilityLabel="Comma-separated teaching subjects" value={subjectInput} onChangeText={setSubjectInput} placeholder="Mathematics, English" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:10}}/>{button("Save subjects",()=>void saveSubjects())}</>}</View>}
      {tab==="Enrollments"&&<View>{isOwn?enrollments.map((e:Row)=><View key={e.id} style={card}>{line("Class",e.title)}{line("Subject",e.subject)}{line("Teacher",e.teacher_name)}{line("Enrolled",e.enrolled_at?new Date(e.enrolled_at).toLocaleDateString():"—")}{line("Progress",String(e.progress_percent??0)+"%")}</View>):<View style={card}><Text style={{color:colors.mutedForeground}}>Enrollment details are private.</Text></View>}{isOwn&&!enrollments.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No active class enrollments recorded.</Text></View>}</View>}
      {tab==="Achievements"&&<View>{achievements.map((a:Row)=><View key={a.id} style={card}><Text style={{fontSize:16,fontWeight:"800",color:colors.foreground}}>{a.achievement?.icon||"🏆"} {a.achievement?.name||"Achievement"}</Text><Text style={{color:colors.mutedForeground,marginTop:5}}>{a.achievement?.description||"Achievement earned on the platform."}</Text>{line("Points",a.achievement?.pointsValue??0)}{line("Earned",a.earnedAt?new Date(a.earnedAt).toLocaleDateString():"—")}</View>)}{!achievements.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No achievements recorded.</Text></View>}</View>}
    </ScrollView>
  </View>;
}
