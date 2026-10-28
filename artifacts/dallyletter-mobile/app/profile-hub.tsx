import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const TABS = ["Overview","Qualifications","Subjects","Enrollments","Achievements","Reports","Attendance","Payments","Transfer Letters"] as const;
type Tab = typeof TABS[number];
type Row = Record<string, any>;

export default function MobileProfileHub() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, login } = useAuth();
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
  const [subjectCatalog,setSubjectCatalog] = useState<string[]>([]);
  const [primarySubject,setPrimarySubject] = useState("");
  const [nameInput,setNameInput] = useState(user?.name||"");
  const [phoneInput,setPhoneInput] = useState(user?.phone||"");
  const [phoneOtp,setPhoneOtp] = useState("");
  const [phoneVerified,setPhoneVerified] = useState(false);
  const [documents,setDocuments] = useState<Row[]>([]);
  const [documentType,setDocumentType] = useState("certificate");
  const [enrollments,setEnrollments] = useState<Row[]>([]);
  const [achievements,setAchievements] = useState<Row[]>([]);
  const [academicAttendance,setAcademicAttendance] = useState<Row[]>([]);
  const [approvedReports,setApprovedReports] = useState<Row[]>([]);
  const [transferRequests,setTransferRequests] = useState<Row[]>([]);
  const [paymentRecords,setPaymentRecords] = useState<Row[]>([]);
  const [termStart,setTermStart] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10));
  const [termEnd,setTermEnd] = useState(new Date().toISOString().slice(0,10));
  const [attendancePeriod,setAttendancePeriod] = useState<"Daily"|"Weekly"|"Monthly"|"Termly">("Weekly");
  const [transferReason,setTransferReason] = useState("");
  const [email,setEmail] = useState("");
  const [otp,setOtp] = useState("");
  const [emailVerified,setEmailVerified] = useState(false);
  const [newQualificationTitle,setNewQualificationTitle] = useState("");
  const [qualificationInput,setQualificationInput] = useState("");
  const [payoutMethod,setPayoutMethod] = useState("ecocash");
  const [payoutDestination,setPayoutDestination] = useState("");
  const [payoutDestinationMasked,setPayoutDestinationMasked] = useState("");
  const [bankName,setBankName] = useState("");
  const [accountHolder,setAccountHolder] = useState("");
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(false);
  const [coverBusy,setCoverBusy] = useState(false);
  const [mediaRevision,setMediaRevision] = useState(0);
  const [fullscreenMedia,setFullscreenMedia] = useState<Row|null>(null);
  const fullscreenPlayer = useVideoPlayer(null, player => { player.loop = false; });
  useEffect(()=>{ if(fullscreenMedia?.type?.startsWith("video/")){ void fullscreenPlayer.replaceAsync({uri:fullscreenMedia.url,headers:token?{Authorization:"Bearer "+token}:{}}).then(()=>fullscreenPlayer.play()).catch(()=>setMessage("This video could not be played on this device.")); } else { fullscreenPlayer.pause(); } },[fullscreenMedia?.url,fullscreenMedia?.type,fullscreenPlayer]);
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
        const [me,q,s,e,a,en,n,p,publicSummary,docs,catalog,recovery,academic,reports,transfers,payments]=await Promise.all([
          api("/api/users/"+targetId),api("/api/users/me/qualifications").catch(()=>[]),api("/api/users/me/subjects").catch(()=>({subjects:[],teaching_subjects:[],subjects_to_teach:[],primary_subject:null})),
          api("/api/users/me/enrollments-summary").catch(()=>({})),api("/api/achievements/my").catch(()=>[]),
          api("/api/users/me/enrollments").catch(()=>[]),api("/api/users/me/notification-email").catch(()=>({})),
          api("/api/users/me/payout-preferences").catch(()=>({})),api("/api/users/"+targetId+"/public-profile").catch(()=>({})),
          api("/api/users/"+targetId+"/teacher-documents").catch(()=>[]),api("/api/subjects/catalog").catch(()=>({subjects:[]})),api("/api/users/me/recovery-profile").catch(()=>({recovery_phone:null,recovery_phone_verified_at:null})),
          api("/api/academic-records/me").catch(()=>({attendance:[]})),api("/api/academic-records/reports/me").catch(()=>[]),api("/api/academic-records/transfer-requests").catch(()=>[]),
          (["student","prefect","learner"].includes(String(user?.role||"").toLowerCase())?api("/api/payments").catch(()=>[]):Promise.resolve([]))
        ]);
        const professional=["teacher","manager","senior_manager"].includes(String(me.role).toLowerCase());
        const savedSubjects=professional?(s?.subjects_to_teach||[]):(s?.subjects||[]);
        setProfile({...publicSummary,id:me.id,display_name:me.name,avatar:me.avatarUrl,bio:me.bio,role:me.role,verified_qualifications:professional?(q||[]).filter((x:Row)=>x.verification_status==="verified"):[],subjects_to_teach:savedSubjects,subjects:savedSubjects,primary_subject:s?.primary_subject||null,grade:me.grade,is_prefect:Boolean(me.isPrefect),is_manager:Boolean(me.isManager)});
        setNameInput(me.name||"");setPhoneInput(me.phone||"");setPhoneVerified(Boolean(recovery.recovery_phone_verified_at&&recovery.recovery_phone===me.phone));
        setQualifications(professional&&Array.isArray(q)?q:[]);setDocuments(professional&&Array.isArray(docs)?docs:[]);
        setSubjects(Array.isArray(savedSubjects)?savedSubjects:[]);setSubjectInput(Array.isArray(savedSubjects)?savedSubjects.join(", "):"");setPrimarySubject(s?.primary_subject||savedSubjects[0]||"");
        setSubjectCatalog(Array.isArray(catalog?.subjects)?catalog.subjects:[]);
        setEnrollments(Array.isArray(en)?en:[]);setAchievements(Array.isArray(a)?a:[]);setAcademicAttendance(Array.isArray(academic?.attendance)?academic.attendance:[]);setApprovedReports(Array.isArray(reports)?reports:[]);setTransferRequests(Array.isArray(transfers)?transfers:[]);setPaymentRecords(Array.isArray(payments)?payments:[]);
        setEmail(n.notification_email||"");setEmailVerified(Boolean(n.notification_email_verified_at));setPayoutMethod(p.method||"ecocash");setPayoutDestinationMasked(p.destination_masked||"");setBankName(p.bank_name||"");setAccountHolder(p.account_name_holder||"");
        if(isOwner){const pending=await api("/api/qualifications/pending").catch(()=>[]);setQueue(Array.isArray(pending)?pending:[]);}
      }else{
        const [p,a,d]=await Promise.all([api("/api/users/"+targetId+"/public-profile"),api("/api/achievements/user/"+targetId).catch(()=>[]),api("/api/users/"+targetId+"/teacher-documents").catch(()=>[])]);
        setProfile(p);setAchievements(Array.isArray(a)?a:[]);
        const professional=["teacher","manager","senior_manager"].includes(String(p.role).toLowerCase());
        setQualifications(professional&&Array.isArray(p.verified_qualifications)?p.verified_qualifications:[]);
        setDocuments(professional&&Array.isArray(d)?d:[]);
        const selected=Array.isArray(p.subjects)?p.subjects:(Array.isArray(p.subjects_to_teach)?p.subjects_to_teach:[]);
        setSubjects(selected);setSubjectInput(selected.join(", "));setPrimarySubject(p.primary_subject||"");
      }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load profile.");}
    finally{setLoading(false);}
  },[api,targetId,user,isOwn,isOwner]);
  useEffect(()=>{void load();},[load]);

  const pickAvatar=async(source:"library"|"camera"="library")=>{
    if(!isOwn||coverBusy)return;
    try{
      if(source==="camera"){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){Alert.alert("Camera permission needed","Allow camera access to take a profile photo.");return;}}
      const options={mediaTypes:["images"] as ImagePicker.ImagePickerOptions["mediaTypes"],allowsEditing:true,aspect:[1,1] as [number,number],quality:0.85};
      const picked=source==="camera"?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
      if(picked.canceled||!picked.assets?.[0]?.uri)return;
      const asset=picked.assets[0];const mime=asset.mimeType||"image/jpeg";
      if(!["image/jpeg","image/png","image/webp"].includes(mime)){Alert.alert("Unsupported image","Choose a JPG, PNG or WebP image.");return;}
      if(asset.fileSize&&asset.fileSize>8*1024*1024){Alert.alert("File too large","Profile photos must be 8 MB or smaller.");return;}
      setCoverBusy(true);const form=new FormData();form.append("file",{uri:asset.uri,name:asset.fileName||"profile-avatar.jpg",type:mime} as any);
      const result=await api("/api/users/me/avatar",{method:"POST",body:form});
      await refreshMediaProfile();
      setMessage("Profile photo saved and reloaded from your account.");
    }catch(e){Alert.alert("Profile photo upload failed",e instanceof Error?e.message:"Please try again.");}
    finally{setCoverBusy(false);}
  };
  const pickCover=async(source:"library"|"camera"="library")=>{
    if(!isOwn||coverBusy)return;
    try{
      if(source==="camera"){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){Alert.alert("Camera permission needed","Allow camera access to capture profile media.");return;}}
      const options:ImagePicker.ImagePickerOptions={mediaTypes:["images","videos"],allowsEditing:false,quality:0.85,videoMaxDuration:120};
      const picked=source==="camera"?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
      if(picked.canceled||!picked.assets?.[0]?.uri)return;
      const asset=picked.assets[0];
      const mime=asset.mimeType||(asset.type==="video"?"video/mp4":"image/jpeg");
      if(!["image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"].includes(mime)){Alert.alert("Unsupported media","Choose a JPG, PNG, WebP, MP4, WebM or MOV file.");return;}
      if(asset.fileSize&&asset.fileSize>20*1024*1024){Alert.alert("File too large","Cover media must be 20 MB or smaller on the current storage configuration.");return;}
      setCoverBusy(true);
      const form=new FormData();
      form.append("file",{uri:asset.uri,name:asset.fileName||(mime.startsWith("video/")?"profile-cover.mp4":"profile-cover.jpg"),type:mime} as any);
      const result=await api("/api/users/me/cover",{method:"POST",body:form});
      await refreshMediaProfile();
      setMessage("Profile cover saved and reloaded from your account.");
    }catch(e){Alert.alert("Cover upload failed",e instanceof Error?e.message:"Please try again.");}
    finally{setCoverBusy(false);}
  };
  const profileMediaUrl=(value:string)=>{const url=/^https:\/\//i.test(value)?value:getApiUrl(value);return /\/api\//i.test(url)?url+(url.includes("?")?"&":"?")+"profile_media_v="+mediaRevision:url;};
  const refreshMediaProfile=async()=>{const fresh=await api("/api/users/"+targetId+"/public-profile");setProfile(prev=>({...prev,...fresh,avatar:fresh.avatar??prev?.avatar}));setMediaRevision(v=>v+1);};
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
  const saveQualificationsBulk=async()=>act(async()=>{
    const titles=[...new Set(qualificationInput.split("\n").map(v=>v.trim()).filter(Boolean))];
    if(!titles.length||titles.length>50)throw new Error("Enter between 1 and 50 qualifications, one per line.");
    const result=await api("/api/users/me/qualifications/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({qualifications:titles})});
    setQualificationInput("");setMessage("Saved "+result.saved+" qualifications for verification.");await load();
  });
  const addQualification=async()=>{
    if(!newQualificationTitle.trim())return;
    await act(async()=>{await api("/api/users/me/qualifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:newQualificationTitle.trim()})});setNewQualificationTitle("");await load();setMessage("Qualification saved as pending verification.");});
  };
  const verify=async(id:number,status:"verified"|"rejected")=>act(async()=>{await api("/api/qualifications/"+id+"/verify",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});await load();setMessage("Qualification "+status+".");});
  const openDocument=async(id:number,fileName?:string,mimeType?:string)=>act(async()=>{
    const ext=(fileName?.split(".").pop()|| (mimeType==="image/jpeg"?"jpg":mimeType==="image/png"?"png":"pdf")).replace(/[^a-z0-9]/gi,"").slice(0,8)||"pdf";
    const target=(FileSystem.documentDirectory||FileSystem.cacheDirectory||"")+"qualification-document-"+id+"."+ext;
    const result=await FileSystem.downloadAsync(getApiUrl("/api/qualifications/"+id+"/document"),target,{headers:token?{Authorization:"Bearer "+token}:{}});
    const openUri=Platform.OS==="android"?await FileSystem.getContentUriAsync(result.uri):result.uri;
    await Linking.openURL(openUri);
  });
  const openProfileDocument=async(doc:Row)=>act(async()=>{
    const ext=(String(doc.file_name||"pdf").split(".").pop()||"pdf").replace(/[^a-z0-9]/gi,"").slice(0,8)||"pdf";
    const target=(FileSystem.documentDirectory||FileSystem.cacheDirectory||"")+"profile-document-"+doc.id+"."+ext;
    const result=await FileSystem.downloadAsync(getApiUrl("/api/users/"+targetId+"/teacher-documents/"+doc.id),target,{headers:token?{Authorization:"Bearer "+token}:{}});
    const openUri=Platform.OS==="android"?await FileSystem.getContentUriAsync(result.uri):result.uri;
    await Linking.openURL(openUri);
  });
  const saveProfile=async()=>act(async()=>{
    if(!nameInput.trim()||nameInput.trim().length>200)throw new Error("Enter a legal name up to 200 characters.");
    const phoneChanged=phoneInput.trim()!==String(user?.phone||"");
    const updated=await api("/api/users/"+user!.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:nameInput.trim(),...(phoneChanged?{phone:phoneInput.trim()||null}:{})})});
    await login({...user,...updated},token!);
    setProfile((old:Row|null)=>old?{...old,display_name:updated.name||nameInput.trim()}:old);
    if(phoneChanged){setPhoneVerified(false);setPhoneOtp("");}
    setMessage("Profile details saved.");
  });
  const requestPhoneCode=async()=>act(async()=>{
    const phone=phoneInput.trim();
    if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error("Use international phone format with country code, for example +263…");
    const updated=await api("/api/users/"+user!.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
    await login({...user,...updated},token!);
    await api("/api/users/me/phone/request-verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
    setPhoneVerified(false);setMessage("A six-digit verification code was sent by SMS.");
  });
  const verifyPhone=async()=>act(async()=>{
    if(!/^\d{6}$/.test(phoneOtp))throw new Error("Enter the six-digit SMS code.");
    await api("/api/users/me/phone/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:phoneOtp})});
    if(!user||!token)throw new Error("Please sign in again before verifying your phone number.");
    await login({...user,phone:phoneInput.trim()},token);
    setPhoneVerified(true);setPhoneOtp("");setMessage("Phone number verified.");
  });
  const saveSubjects=async()=>act(async()=>{
    const list=[...new Set(subjectInput.split(",").map(v=>v.trim()).filter(Boolean))];
    const professional=["teacher","manager","senior_manager"].includes(String(profile?.role||user?.role).toLowerCase());
    const primary=list.includes(primarySubject)?primarySubject:(list[0]||"");
    await api("/api/users/me/subjects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(professional?{teaching_subjects:list,subjects_to_teach:list,primary_subject:primary}:{subjects:list})});
    setSubjects(list);setPrimarySubject(professional?primary:"");setMessage(professional?"Teaching subjects saved.":"Learning subjects saved; recommendations use these preferences.");
  });
  const uploadProfileDocument=async()=>act(async()=>{
    const picked=await DocumentPicker.getDocumentAsync({type:["application/pdf","image/jpeg","image/png","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],copyToCacheDirectory:true});
    if(picked.canceled||!picked.assets?.[0])return;
    const asset=picked.assets[0];
    if(asset.size&&asset.size>10*1024*1024)throw new Error("Documents must be 10 MB or smaller.");
    const form=new FormData();form.append("file",{uri:asset.uri,name:asset.name||"profile-document.pdf",type:asset.mimeType||"application/pdf"} as any);form.append("documentType",documentType);
    await api("/api/users/me/teacher-documents",{method:"POST",body:form});
    const fresh=await api("/api/users/"+user!.id+"/teacher-documents");setDocuments(Array.isArray(fresh)?fresh:[]);setMessage(documentType.toUpperCase()+" uploaded and saved.");
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
    <View style={{paddingHorizontal:12,paddingTop:8,paddingBottom:10,backgroundColor:colors.background}}>
      <View style={{minHeight:290,borderRadius:24,overflow:"hidden",backgroundColor:colors.primary,justifyContent:"flex-end",borderWidth:1,borderColor:colors.border}}>
        {profile?.cover_url&&(String(profile.cover_type||"").startsWith("video/")?<View style={{position:"absolute",top:0,left:0,right:0,bottom:0,justifyContent:"center",alignItems:"center",backgroundColor:"#111"}}><Feather name="play-circle" size={52} color="#fff"/><Text style={{color:"#fff",marginTop:6,fontWeight:"600"}}>Cover video · tap View cover</Text></View>:<Image key={"cover-"+mediaRevision+profile.cover_url} source={{uri:profileMediaUrl(profile.cover_url),headers:token?{Authorization:"Bearer "+token}:{}}} style={{position:"absolute",top:0,left:0,right:0,bottom:0,width:"100%",height:"100%"}} resizeMode="cover"/> )}
        {!profile?.cover_url&&profile?.avatar&&<Image key={"fallback-"+mediaRevision+profile.avatar} source={{uri:profileMediaUrl(profile.avatar),headers:token?{Authorization:"Bearer "+token}:{}}} style={{position:"absolute",top:0,left:0,right:0,bottom:0,width:"100%",height:"100%",opacity:0.45}} resizeMode="cover" blurRadius={2}/>}
        <TouchableOpacity activeOpacity={0.9} onPress={()=>profile?.cover_url&&setFullscreenMedia({url:profileMediaUrl(profile.cover_url),type:profile.cover_type||"image/*"})} style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"#06122555"}} accessibilityLabel="Open profile cover fullscreen"/>
        <View style={{position:"absolute",top:12,left:12,right:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:2}}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={{width:40,height:40,borderRadius:20,alignItems:"center",justifyContent:"center",backgroundColor:"#ffffff24",borderWidth:1,borderColor:"#ffffff55"}}><Feather name="arrow-left" size={21} color="#fff"/></TouchableOpacity>
          {profile?.cover_url&&<TouchableOpacity accessibilityRole="button" onPress={()=>setFullscreenMedia({url:profileMediaUrl(profile.cover_url!),type:profile.cover_type||"image/*"})} style={{borderRadius:18,borderWidth:1,borderColor:"#ffffff66",backgroundColor:"#07111dbb",paddingHorizontal:12,paddingVertical:8}}><Text style={{fontSize:12,color:"#fff",fontWeight:"700"}}>View cover ⤢</Text></TouchableOpacity>}
        </View>
        <View pointerEvents="box-none" style={{padding:12,zIndex:2}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:12,borderRadius:22,borderWidth:1,borderColor:"#ffffff66",backgroundColor:"#ffffff24",padding:12}}>
            <TouchableOpacity onPress={()=>profile?.avatar&&setFullscreenMedia({url:profileMediaUrl(profile.avatar),type:"image"})} accessibilityLabel="Open profile avatar fullscreen" style={{borderRadius:48,borderWidth:3,borderColor:"#ffffffcc",backgroundColor:"#ffffff22"}}>
              {profile?.avatar?<Image key={"avatar-"+mediaRevision+profile.avatar} source={{uri:profileMediaUrl(profile.avatar),headers:token?{Authorization:"Bearer "+token}:{}}} style={{width:84,height:84,borderRadius:42}} resizeMode="cover"/>:<View style={{width:84,height:84,borderRadius:42,alignItems:"center",justifyContent:"center"}}><Feather name="user" size={38} color="#fff"/></View>}
            </TouchableOpacity>
            <View style={{flex:1,minWidth:0}}>
              <Text style={{fontSize:10,fontWeight:"800",letterSpacing:1.5,color:"#ffe6a1",textTransform:"uppercase"}}>Dallyletter · Profile Hub</Text>
              <Text numberOfLines={2} style={{fontSize:21,fontWeight:"800",color:"#fff",marginTop:3}}>{profile?.display_name||user.name}</Text>
              <Text style={{fontSize:12,color:"#ffffffdd",marginTop:3}}>{profile?.is_prefect?"Prefect":String(profile?.role||user.role).toLowerCase()==="student"?"Learner":profile?.role||user.role}</Text>
              {profile?.bio&&<Text numberOfLines={3} style={{fontSize:12,color:"#ffffffed",marginTop:5}}>{profile.bio}</Text>}
            </View>
            {loading&&<ActivityIndicator color="#fff"/>}
          </View>
          {isOwn&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10,padding:10,borderRadius:18,borderWidth:1,borderColor:"#ffffff44",backgroundColor:"#07111d99"}}>
            <TouchableOpacity onPress={()=>void pickAvatar("library")} disabled={coverBusy} style={{backgroundColor:"#ffffff22",paddingHorizontal:11,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#ffffff44"}}><Text style={{color:"#fff",fontWeight:"700",fontSize:12}}>Profile photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>void pickAvatar("camera")} disabled={coverBusy} style={{backgroundColor:"#ffffff22",paddingHorizontal:11,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#ffffff44"}}><Text style={{color:"#fff",fontWeight:"700",fontSize:12}}>Take photo</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>void pickCover("library")} disabled={coverBusy} style={{backgroundColor:"#ffffff22",paddingHorizontal:11,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#ffffff44"}}><Text style={{color:"#fff",fontWeight:"700",fontSize:12}}>{coverBusy?"Uploading…":"Cover image/video"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>void pickCover("camera")} disabled={coverBusy} style={{backgroundColor:"#ffffff22",paddingHorizontal:11,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#ffffff44"}}><Text style={{color:"#fff",fontWeight:"700",fontSize:12}}>Capture cover</Text></TouchableOpacity>
          </View>}
        </View>
      </View>
    </View>
    <Modal visible={Boolean(fullscreenMedia)} transparent={false} presentationStyle="fullScreen" statusBarTranslucent animationType="fade" onRequestClose={()=>setFullscreenMedia(null)}><View style={{flex:1,width:"100%",height:"100%",backgroundColor:"#000",justifyContent:"center",alignItems:"center",padding:0,margin:0}}><StatusBar hidden backgroundColor="#000"/><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close fullscreen media" onPress={()=>setFullscreenMedia(null)} style={{position:"absolute",top:Platform.OS==="ios"?48:18,right:18,zIndex:10,paddingHorizontal:16,paddingVertical:10,backgroundColor:"#333333bb",borderRadius:24}}><Text style={{color:"#fff",fontWeight:"700"}}>Close ✕</Text></TouchableOpacity>{fullscreenMedia?.type?.startsWith("video/")?<VideoView player={fullscreenPlayer} style={{width:"100%",height:"100%"}} nativeControls contentFit="contain"/>:fullscreenMedia?.url?<TouchableOpacity activeOpacity={1} onPress={()=>setFullscreenMedia(null)} style={{width:"100%",height:"100%",justifyContent:"center",alignItems:"center"}}><Image source={{uri:fullscreenMedia.url,headers:token?{Authorization:"Bearer "+token}:{}}} style={{width:"100%",height:"100%"}} resizeMode="contain"/></TouchableOpacity>:null}</View></Modal>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{padding:10,gap:6,backgroundColor:colors.card}}>
      {TABS.filter(t=>t!=="Qualifications"||["teacher","manager","senior_manager"].includes(String(profile?.role||user.role).toLowerCase())).filter(t=>t!=="Enrollments"||isOwn).filter(t=>isOwn||!["Reports","Attendance","Payments","Transfer Letters"].includes(t)).map(t=><TouchableOpacity key={t} accessibilityRole="tab" accessibilityState={{selected:tab===t}} onPress={()=>setTab(t)} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:tab===t?colors.primary:colors.background,borderColor:colors.border,borderWidth:1}}><Text style={{fontWeight:"700",color:tab===t?"#fff":colors.foreground}}>{t}</Text></TouchableOpacity>)}
    </ScrollView>
    <ScrollView contentContainerStyle={{padding:14,paddingBottom:50}} keyboardShouldPersistTaps="handled">
      {!!message&&<Text accessibilityRole="alert" style={{...card,color:colors.foreground}}>{message}</Text>}
      {tab==="Overview"&&<View style={card}>
        {isOwn?<><Text style={{fontWeight:"700",color:colors.foreground,marginBottom:5}}>Legal name</Text><TextInput accessibilityLabel="Legal name" value={nameInput} onChangeText={setNameInput} maxLength={200} placeholder="Enter your legal name" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginBottom:8}}/><Text style={{fontWeight:"700",color:colors.foreground,marginBottom:5}}>Mobile phone number</Text><TextInput accessibilityLabel="Mobile phone number" value={phoneInput} onChangeText={v=>{setPhoneInput(v);setPhoneVerified(false);}} maxLength={40} keyboardType="phone-pad" placeholder="+263…" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginBottom:8}}/><Text style={{fontSize:12,color:phoneVerified?colors.primary:colors.mutedForeground,marginBottom:8}}>{phoneVerified?"Verified — eligible for urgent SMS alerts":"Not verified"}</Text>{button("Save profile details",()=>void saveProfile(),!nameInput.trim())}{button("Send SMS verification code",()=>void requestPhoneCode(),!/^\+[1-9]\d{7,14}$/.test(phoneInput.trim()))}<TextInput accessibilityLabel="Six-digit phone verification code" value={phoneOtp} onChangeText={v=>setPhoneOtp(v.replace(/\D/g,"").slice(0,6))} maxLength={6} keyboardType="number-pad" placeholder="6-digit SMS code" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/>{button("Verify phone",()=>void verifyPhone(),phoneOtp.length!==6)}</>:line("Name",profile?.display_name)}{line("Role",profile?.is_prefect?"Prefect":String(profile?.role||"").toLowerCase()==="student"?"Learner":profile?.role)}{line("Grade",profile?.grade)}{["teacher","manager","senior_manager"].includes(String(profile?.role||user.role).toLowerCase())&&line("Verified qualifications",profile?.verified_qualifications?.length||0)}{line("Subjects",subjects.join(", "))}{!["teacher","manager","senior_manager"].includes(String(profile?.role||user.role).toLowerCase())&&<>{isOwn&&line("School fees",profile?.fees_status==="paid"?"Paid":profile?.fees_status==="overdue"?"Overdue":profile?.fees_status==="pending"?"Pending":"Not recorded")}{line("Leaderboard position",profile?.leaderboard_position?"#"+profile.leaderboard_position:"Not ranked")}{line("Achievements awarded",profile?.achievement_count??achievements.length)}{isOwn&&line("Groups joined",(profile?.groups_joined||[]).map((g:Row)=>g.name).join(", ")||"None recorded")}{isOwn&&profile?.is_prefect&&<>{line("Groups owned",(profile.groups_owned||[]).map((g:Row)=>g.name).join(", ")||"None recorded")}{line("Groups with settings permission",(profile.groups_with_settings_permission||[]).map((g:Row)=>g.name).join(", ")||"None recorded")}{line("Lesson requests",profile.lesson_requests_count??0)}</>}</>}
        {isOwn&&String(user.role).toLowerCase()==="teacher"&&<View style={{borderTopWidth:1,borderTopColor:colors.border,marginTop:10,paddingTop:10}}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:6}}>Private payout preferences</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginBottom:8}}>Never enter a card number, CVV, PIN, or password.</Text><View style={{flexDirection:"row",gap:6}}>{(["ecocash","paypal","bank"] as const).map(m=><TouchableOpacity key={m} onPress={()=>{setPayoutMethod(m);setPayoutDestination("");}} style={{padding:8,borderRadius:8,backgroundColor:payoutMethod===m?colors.primary:colors.background,borderWidth:1,borderColor:colors.border}}><Text style={{color:payoutMethod===m?"#fff":colors.foreground,fontWeight:"700"}}>{m==="ecocash"?"EcoCash":m==="paypal"?"PayPal":"Bank"}</Text></TouchableOpacity>)}</View>{!!payoutDestinationMasked&&<Text style={{color:colors.mutedForeground,marginTop:8}}>Saved destination: {payoutDestinationMasked}</Text>}{payoutMethod!=="bank"?<TextInput accessibilityLabel={payoutMethod==="paypal"?"PayPal email":"EcoCash phone"} value={payoutDestination} onChangeText={setPayoutDestination} placeholder={payoutMethod==="paypal"?"PayPal email":"EcoCash phone"} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/>:<><TextInput accessibilityLabel="Bank name" value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/><TextInput accessibilityLabel="Account holder" value={accountHolder} onChangeText={setAccountHolder} placeholder="Account holder name" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/></>}{button("Save payout preferences",()=>void savePayout(),payoutMethod==="bank"?(!bankName.trim()||!accountHolder.trim()):!payoutDestination.trim())}</View>}
        {isOwn&&<><Text style={{fontWeight:"800",color:colors.foreground,marginTop:8,marginBottom:6}}>Notification email</Text><TextInput accessibilityLabel="Notification email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={v=>{setEmail(v);setEmailVerified(false);}} placeholder="you@example.com" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground}}/><Text style={{color:emailVerified?"#16a34a":colors.mutedForeground,marginTop:6}}>{emailVerified?"Verified":"Not verified"}</Text>{!emailVerified&&button("Send OTP",()=>void requestOtp())}<TextInput accessibilityLabel="Six digit OTP" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={v=>setOtp(v.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:8}}/>{button("Verify email",()=>void verifyOtp(),otp.length!==6)}</>}
      </View>}
      {tab==="Qualifications"&&<View>
        {(qualifications||[]).map((q:Row)=><View key={q.id||q.title} style={card}>{line("Qualification",q.title)}{line("Institution",q.institution)}{line("Year",q.year)}{line("Status",q.verification_status||"verified")}{isOwn&&q.id&&button("Upload PDF/JPG/PNG",()=>void upload(q.id))}</View>)}
        {!qualifications.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No qualifications listed yet.</Text></View>}
        {isOwn&&["teacher","manager","senior_manager"].includes(String(user.role).toLowerCase())&&<View style={card}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:8}}>Add multiple qualifications</Text><Text style={{fontSize:12,color:colors.mutedForeground,marginBottom:8}}>Enter one qualification per line. Save all together for verification.</Text><TextInput accessibilityLabel="Qualifications, one per line" value={qualificationInput} onChangeText={setQualificationInput} multiline numberOfLines={4} maxLength={25000} placeholder={"Diploma in Education\nBachelor of Science\nMaster's Degree"} placeholderTextColor={colors.mutedForeground} style={{minHeight:100,textAlignVertical:"top",borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginBottom:8}}/>{button("Save all qualifications",()=>void saveQualificationsBulk(),!qualificationInput.trim())}</View>}{isOwn&&["teacher","manager","senior_manager"].includes(String(user.role).toLowerCase())&&<View style={card}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:8}}>Add qualification</Text><TextInput accessibilityLabel="Qualification title" value={newQualificationTitle} onChangeText={setNewQualificationTitle} placeholder="Qualification title" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground}}/>{button("Save qualification",()=>void addQualification(),!newQualificationTitle.trim())}</View>}
        {isOwn&&["teacher","manager","senior_manager"].includes(String(user.role).toLowerCase())&&<View style={card}><Text style={{fontSize:16,fontWeight:"800",color:colors.foreground,marginBottom:8}}>CV, resume & certificates</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6,marginBottom:10}}>{(["cv","resume","certificate","proof"] as const).map(kind=><TouchableOpacity key={kind} onPress={()=>setDocumentType(kind)} style={{borderWidth:1,borderColor:documentType===kind?colors.primary:colors.border,borderRadius:18,paddingHorizontal:10,paddingVertical:7}}><Text style={{color:colors.foreground,fontSize:12}}>{documentType===kind?"✓ ":""}{kind.toUpperCase()}</Text></TouchableOpacity>)}</View>{button("Upload "+documentType,()=>void uploadProfileDocument())}<Text style={{fontSize:12,color:colors.mutedForeground,marginTop:8}}>Uploaded records are saved to your account. Public viewers can see certificates; CVs and resumes remain private.</Text></View>}
        {documents.map((d:Row)=><View key={d.id} style={card}><Text style={{fontWeight:"700",color:colors.foreground}}>{d.file_name}</Text>{line("Type",String(d.document_type||"document").toUpperCase())}{line("Size",Math.ceil(Number(d.size_bytes||0)/1024)+" KB")}{button("Open document",()=>void openProfileDocument(d))}</View>)}
        {isOwner&&<View style={card}><Text style={{fontSize:16,fontWeight:"800",color:colors.foreground,marginBottom:8}}>Pending verification</Text>{queue.map((q:Row)=><View key={q.id} style={{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:10}}>{line("Teacher",q.teacher_name)}{line("Qualification",q.title)}{line("Institution",q.institution)}{q.document_id&&button("Review document",()=>void openDocument(q.document_id,q.document_file_name,q.document_mime_type))}{button("Verify",()=>void verify(q.id,"verified"))}{button("Reject",()=>void verify(q.id,"rejected"))}</View>)}{!queue.length&&<Text style={{color:colors.mutedForeground}}>No pending qualifications.</Text>}</View>}
      </View>}
      {tab==="Subjects"&&<View style={card}><Text style={{fontWeight:"800",color:colors.foreground,marginBottom:8}}>{["teacher","manager","senior_manager"].includes(String(profile?.role||user.role).toLowerCase())?"Teaching subjects & primary specialization":"Learning subjects"}</Text>{subjects.map(s=><Text key={s} style={{color:colors.foreground,paddingVertical:7}}>• {s}{profile?.primary_subject===s?" · Primary":""}</Text>)}{!subjects.length&&<Text style={{color:colors.mutedForeground}}>No subjects listed.</Text>}{isOwn&&<><Text style={{fontSize:12,color:colors.mutedForeground,marginTop:10}}>Select from subjects used in lessons and live classes, or type additional subjects below.</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:8}}>{subjectCatalog.map(s=><TouchableOpacity key={s} onPress={()=>{const current=subjectInput.split(",").map(v=>v.trim()).filter(Boolean);setSubjectInput((current.includes(s)?current.filter(v=>v!==s):[...current,s]).join(", "));}} style={{borderWidth:1,borderColor:subjectInput.split(",").map(v=>v.trim()).includes(s)?colors.primary:colors.border,borderRadius:18,paddingHorizontal:9,paddingVertical:6,backgroundColor:subjectInput.split(",").map(v=>v.trim()).includes(s)?colors.primary+"18":colors.background}}><Text style={{color:colors.foreground,fontSize:12}}>{s}</Text></TouchableOpacity>)}</View><TextInput accessibilityLabel="Selected subjects" value={subjectInput} onChangeText={setSubjectInput} placeholder="Mathematics, English" placeholderTextColor={colors.mutedForeground} style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,color:colors.foreground,marginTop:10}}/>{["teacher","manager","senior_manager"].includes(String(profile?.role||user.role).toLowerCase())&&<><Text style={{fontWeight:"700",color:colors.foreground,marginTop:8}}>Primary specialization</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:6}}>{subjectInput.split(",").map(v=>v.trim()).filter(Boolean).map(s=><TouchableOpacity key={s} onPress={()=>setPrimarySubject(s)} style={{borderWidth:1,borderColor:primarySubject===s?colors.primary:colors.border,borderRadius:18,paddingHorizontal:9,paddingVertical:6}}><Text style={{color:colors.foreground,fontSize:12}}>{primarySubject===s?"★ ":""}{s}</Text></TouchableOpacity>)}</View></>}{button("Save subjects",()=>void saveSubjects())}</>}</View>}
      {tab==="Enrollments"&&<View>{isOwn?enrollments.map((e:Row)=><View key={e.id} style={card}>{line("Class",e.title)}{line("Subject",e.subject)}{line("Teacher",e.teacher_name)}{line("Enrolled",e.enrolled_at?new Date(e.enrolled_at).toLocaleDateString():"—")}{line("Progress",String(e.progress_percent??0)+"%")}</View>):<View style={card}><Text style={{color:colors.mutedForeground}}>Enrollment details are private.</Text></View>}{isOwn&&!enrollments.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No active class enrollments recorded.</Text></View>}</View>}
      {tab==="Achievements"&&<View>{achievements.map((a:Row)=><View key={a.id} style={card}><Text style={{fontSize:16,fontWeight:"800",color:colors.foreground}}>{a.achievement?.icon||"🏆"} {a.achievement?.name||"Achievement"}</Text><Text style={{color:colors.mutedForeground,marginTop:5}}>{a.achievement?.description||"Achievement earned on the platform."}</Text>{line("Points",a.achievement?.pointsValue??0)}{line("Earned",a.earnedAt?new Date(a.earnedAt).toLocaleDateString():"—")}</View>)}{!achievements.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No achievements recorded.</Text></View>}</View>}
      {tab==="Reports"&&<View>{approvedReports.map((report:Row)=><View key={report.id} style={card}>{line("Report",report.report_type==="attendance_register"?"Attendance register":"Term performance")}{line("Term",report.term_label)}{line("Approved",report.reviewed_at?new Date(report.reviewed_at).toLocaleDateString():"—")}<Text style={{color:colors.mutedForeground,marginTop:6}}>{JSON.stringify(report.draft_content?.commentary||report.draft_content?.records||report.draft_content?.factualRecords||"Approved report available")}</Text>{button("Download approved report",()=>void act(async()=>{const response=await FileSystem.downloadAsync(getApiUrl("/api/academic-records/reports/drafts/"+report.id+"/download"),(FileSystem.documentDirectory||FileSystem.cacheDirectory||"")+"dallyletter-report-"+report.id+".json",{headers:token?{Authorization:"Bearer "+token}:{}});const uri=Platform.OS==="android"?await FileSystem.getContentUriAsync(response.uri):response.uri;await Linking.openURL(uri);}))}</View>)}{!approvedReports.length&&<View style={card}><Text style={{color:colors.mutedForeground}}>No approved reports are available yet. Reports appear here after an authorized manager approves them.</Text></View>}</View>}
      {tab==="Attendance"&&<View style={card}><Text style={{fontSize:17,fontWeight:"800",color:colors.foreground,marginBottom:8}}>Attendance history</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:12}}>{(["Daily","Weekly","Monthly","Termly"] as const).map(period=><TouchableOpacity key={period} onPress={()=>setAttendancePeriod(period)} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:16,borderWidth:1,borderColor:attendancePeriod===period?colors.primary:colors.border,backgroundColor:attendancePeriod===period?colors.primary:colors.background}}><Text style={{color:attendancePeriod===period?"#fff":colors.foreground,fontWeight:"700"}}>{period}</Text></TouchableOpacity>)}</View>{(()=>{const now=new Date();const start=new Date(now);if(attendancePeriod==="Daily")start.setHours(0,0,0,0);else if(attendancePeriod==="Weekly")start.setDate(now.getDate()-6);else if(attendancePeriod==="Monthly")start.setDate(now.getDate()-29);else {const configuredStart=new Date(termStart+"T00:00:00");const configuredEnd=new Date(termEnd+"T23:59:59");start.setTime(configuredStart.getTime());now.setTime(configuredEnd.getTime());}const rows=academicAttendance.filter((row:Row)=>{const d=new Date(row.joined_at);return !Number.isNaN(d.getTime())&&d>=start&&d<=now;});return <>{attendancePeriod==="Termly"&&<View style={{flexDirection:"row",gap:8,marginBottom:10}}><View style={{flex:1}}><Text style={{color:colors.mutedForeground,fontSize:12}}>Term start (set by school)</Text><TextInput accessibilityLabel="Term start date" value={termStart} onChangeText={setTermStart} placeholder="YYYY-MM-DD" style={{borderWidth:1,borderColor:colors.border,borderRadius:8,padding:8,color:colors.foreground}}/></View><View style={{flex:1}}><Text style={{color:colors.mutedForeground,fontSize:12}}>Term end</Text><TextInput accessibilityLabel="Term end date" value={termEnd} onChangeText={setTermEnd} placeholder="YYYY-MM-DD" style={{borderWidth:1,borderColor:colors.border,borderRadius:8,padding:8,color:colors.foreground}}/></View></View>}{line("View",attendancePeriod==="Termly"?"Termly (configured date range)":attendancePeriod)}{line("Records",rows.length)}{rows.map((row:Row,index:number)=><View key={String(row.class_id)+"-"+String(row.joined_at)+"-"+index} style={{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:9}}>{line("Date",row.joined_at?new Date(row.joined_at).toLocaleString():"—")}{line("Class ID",row.class_id)}{line("Status",row.status||"Not recorded")}{line("Late",row.is_late?"Yes":"No")}{line("Duration",row.duration_minutes==null?"—":String(row.duration_minutes)+" min")}</View>)}{!rows.length&&<Text style={{color:colors.mutedForeground,marginTop:8}}>No attendance entries found for this period. This view uses saved attendance records; it does not create or infer attendance.</Text>}</>})()}</View>}
      {tab==="Payments"&&<View style={card}><Text style={{fontSize:17,fontWeight:"800",color:colors.foreground,marginBottom:8}}>Recorded school payments</Text><Text style={{color:colors.mutedForeground,marginBottom:8}}>These are payment ledger records, not payout preferences. A reported or pending payment is not proof that fees have been cleared.</Text>{paymentRecords.map((payment:Row)=><View key={payment.id} style={{borderTopWidth:1,borderTopColor:colors.border,paddingVertical:10}}>{line("Payment period",String(payment.month||"")+" "+String(payment.year||""))}{line("Amount",String(payment.currency||"USD")+" "+Number(payment.amount||0).toFixed(2))}{line("Status",payment.status||"Not recorded")}{line("Recorded",payment.createdAt?new Date(payment.createdAt).toLocaleDateString():"—")}{line("Reference / notes",payment.notes||"—")}</View>)}{!paymentRecords.length&&<Text style={{color:colors.mutedForeground}}>No payment records are available for this account.</Text>}</View>}
      {tab==="Transfer Letters"&&<View style={card}><Text style={{fontSize:17,fontWeight:"800",color:colors.foreground,marginBottom:8}}>Transfer letter requests</Text><Text style={{color:colors.mutedForeground,marginBottom:8}}>Requests require authorized manager review. Download is enabled only after approval.</Text><TextInput accessibilityLabel="Transfer reason" multiline value={transferReason} onChangeText={setTransferReason} placeholder="Explain why a transfer letter is needed" placeholderTextColor={colors.mutedForeground} style={{minHeight:90,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:10,color:colors.foreground,marginBottom:8}}/><View>{button("Request transfer letter",()=>void act(async()=>{if(transferReason.trim().length<3)throw new Error("Enter a transfer reason of at least 3 characters.");await api("/api/academic-records/transfer-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:transferReason.trim()})});setTransferReason("");setTransferRequests(await api("/api/academic-records/transfer-requests"));setMessage("Transfer letter request submitted for manager review.");}))}</View>{transferRequests.map((request:Row)=><View key={request.id} style={{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10,marginTop:10}}>{line("Request", "#"+request.id)}{line("Status",request.status)}{line("Reason",request.reason)}{line("Requested",request.created_at?new Date(request.created_at).toLocaleDateString():"—")}{request.status==="approved"&&button("Download approved letter",()=>void act(async()=>{const response=await FileSystem.downloadAsync(getApiUrl("/api/academic-records/transfer-requests/"+request.id+"/download"),(FileSystem.documentDirectory||FileSystem.cacheDirectory||"")+"dallyletter-transfer-letter-"+request.id+".txt",{headers:token?{Authorization:"Bearer "+token}:{}});const uri=Platform.OS==="android"?await FileSystem.getContentUriAsync(response.uri):response.uri;await Linking.openURL(uri);}))}</View>)}{!transferRequests.length&&<Text style={{color:colors.mutedForeground,marginTop:8}}>No transfer letter requests yet.</Text>}</View>}
    </ScrollView>
  </View>;
}
