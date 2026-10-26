import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tab = "Overview" | "Qualifications" | "Subjects" | "Enrollments" | "Achievements";
type PublicProfile = { id: number; display_name: string; avatar: string | null; bio: string | null; role: string; verified_qualifications: Array<{title:string;verified:boolean}>; subjects_to_teach: string[]; subjects?: string[]; primary_subject?: string | null; grade?: string | null; is_prefect?: boolean; is_manager?: boolean; performance_score?: number; leaderboard_position?: number | null; badge_count?: number; streak_days?: number; groups_joined?: Array<{id:number;name:string;subject:string}>; groups_owned?: Array<{id:number;name:string;subject:string}>; groups_with_settings_permission?: Array<{id:number;name:string;subject:string}>; fees_status?: string; achievement_count?: number; lesson_requests_count?: number };
const tabs: Tab[] = ["Overview","Qualifications","Subjects","Enrollments","Achievements"];

export default function ProfileHub() {
  const { user } = useAuth();
  const [, params] = useRoute("/profile/:id");
  const profileId = params?.id ? Number(params.id) : user?.id;
  const isOwner = Boolean(user && profileId === user.id);
  const [tab,setTab] = useState<Tab>("Overview");
  const [profile,setProfile] = useState<PublicProfile | null>(null);
  const [qualifications,setQualifications] = useState<any[]>([]);
  const [documents,setDocuments] = useState<any[]>([]);
  const [documentType,setDocumentType] = useState("certificate");
  const [subjects,setSubjects] = useState<{teaching_subjects:string[];subjects_to_teach:string[]}>({teaching_subjects:[],subjects_to_teach:[]});
  const [summary,setSummary] = useState<any>(null);
  const [achievements,setAchievements] = useState<any[]>([]);
  const [moderationQueue,setModerationQueue] = useState<any[]>([]);
  const [enrollments,setEnrollments] = useState<any[]>([]);
  const [notificationEmail,setNotificationEmail] = useState("");
  const [notificationOtp,setNotificationOtp] = useState("");
  const [notificationEmailVerified,setNotificationEmailVerified] = useState(false);
  const [recoveryEmail,setRecoveryEmail] = useState("");
  const [recoveryCode,setRecoveryCode] = useState("");
  const [recoveryEmailVerified,setRecoveryEmailVerified] = useState(false);
  const [payoutMethod,setPayoutMethod] = useState("ecocash");
  const [payoutDestination,setPayoutDestination] = useState("");
  const [bankName,setBankName] = useState("");
  const [accountHolder,setAccountHolder] = useState("");
  const [payoutDestinationMasked,setPayoutDestinationMasked] = useState("");
  const [title,setTitle] = useState("");
  const [qualificationInput,setQualificationInput] = useState("");
  const [institution,setInstitution] = useState("");
  const [year,setYear] = useState("");
  const [subjectInput,setSubjectInput] = useState("");
  const [primarySubject,setPrimarySubject] = useState("");
  const [subjectCatalog,setSubjectCatalog] = useState<string[]>([]);
  const [nameInput,setNameInput] = useState("");
  const [phoneInput,setPhoneInput] = useState("");
  const [phoneOtp,setPhoneOtp] = useState("");
  const [phoneVerified,setPhoneVerified] = useState(false);
  const [avatarBusy,setAvatarBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") : null;
  const headers = useMemo(()=>({ ...(token ? {Authorization:"Bearer "+token} : {}) }),[token]);
  const request = async (path:string, init:RequestInit={}) => {
    const response = await fetch(getApiUrl(path),{...init,headers:{...headers,...(init.headers as Record<string,string>||{})}});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || "Could not load profile information.");
    return data;
  };
  const load = async () => {
    if(!profileId || !Number.isSafeInteger(profileId)) return;
    try {
      if(isOwner) {
        const [me, q, s, academic, earned, enrolled, notification, payout, recovery, catalog, docs, publicSummary] = await Promise.all([
          request("/api/users/"+profileId),
          request("/api/users/me/qualifications").catch(()=>[]),
          request("/api/users/me/subjects"),
          
          request("/api/users/me/enrollments-summary").catch(()=>null),
          request("/api/achievements/my").catch(()=>[]),
          request("/api/users/me/enrollments").catch(()=>[]),
          request("/api/users/me/notification-email").catch(()=>({notification_email:null,notification_email_verified_at:null})),
          request("/api/users/me/payout-preferences").catch(()=>({})),
          request("/api/users/me/recovery-profile").catch(()=>({recovery_email:null,recovery_email_verified_at:null})),
          request("/api/subjects/catalog").catch(()=>({subjects:[]})),
          request("/api/users/"+profileId+"/teacher-documents").catch(()=>[]),
          request("/api/users/"+profileId+"/public-profile").catch(()=>({}))
        ]);
        const professional = ["teacher","manager","senior_manager"].includes(String(me.role).toLowerCase());
        const savedSubjects = professional ? (s.subjects_to_teach||[]) : (s.subjects||[]);
        setProfile({...publicSummary,id:me.id,display_name:me.name,avatar:me.avatarUrl,bio:me.bio,role:me.role,verified_qualifications:professional?(q||[]).filter((v:any)=>v.verification_status==="verified").map((v:any)=>({title:v.title,verified:true})):[],subjects_to_teach:savedSubjects,subjects:savedSubjects,primary_subject:s.primary_subject||null,grade:me.grade,is_prefect:Boolean(me.isPrefect),is_manager:Boolean(me.isManager)});
        setNameInput(me.name||""); setPhoneInput(me.phone||""); setPhoneVerified(Boolean(recovery.recovery_phone_verified_at&&recovery.recovery_phone===me.phone)); setSubjectCatalog(Array.isArray(catalog.subjects)?catalog.subjects:[]);
        setQualifications(professional?(q||[]):[]); setDocuments(professional&&Array.isArray(docs)?docs:[]); setSubjects(s||{teaching_subjects:[],subjects_to_teach:[]}); setSubjectInput(savedSubjects.join(", ")); setPrimarySubject(s.primary_subject||savedSubjects[0]||""); setSummary(academic); setAchievements(Array.isArray(earned)?earned:[]); setEnrollments(Array.isArray(enrolled)?enrolled:[]); setNotificationEmail(notification.notification_email||""); setNotificationEmailVerified(Boolean(notification.notification_email_verified_at)); setPayoutMethod(payout.method||"ecocash"); setPayoutDestinationMasked(payout.destination_masked||""); setBankName(payout.bank_name||""); setAccountHolder(payout.account_name_holder||""); setRecoveryEmail(recovery.recovery_email||""); setRecoveryEmailVerified(Boolean(recovery.recovery_email_verified_at)); if(["owner","admin","platform_owner"].includes(String(me.role).toLowerCase())) request("/api/qualifications/pending").then((rows:any)=>setModerationQueue(Array.isArray(rows)?rows:[])).catch(()=>setModerationQueue([]));
      } else {
        const [p, earned, docs] = await Promise.all([
          request("/api/users/"+profileId+"/public-profile"),
          request("/api/achievements/user/"+profileId).catch(()=>[]),
          request("/api/users/"+profileId+"/teacher-documents").catch(()=>[])
        ]);
        setProfile({...p,subjects_to_teach:Array.isArray(p.subjects)?p.subjects:(p.subjects_to_teach||[])});
        setDocuments(["teacher","manager","senior_manager"].includes(String(p.role).toLowerCase())&&Array.isArray(docs)?docs:[]);
        setAchievements(Array.isArray(earned)?earned:[]);
      }
    } catch(e) { setMessage(e instanceof Error ? e.message : "Profile could not be loaded."); }
  };
  useEffect(()=>{ void load(); },[profileId,isOwner]);
  const addQualification = async () => {
    setBusy(true); setMessage("");
    try {
      await request("/api/users/me/qualifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,institution,year:year||null})});
      setTitle("");setInstitution("");setYear("");setMessage("Qualification saved for verification.");await load();
    } catch(e) {setMessage(e instanceof Error?e.message:"Could not save qualification.");}
    finally {setBusy(false);}
  };
  const uploadDocument = async (qualificationId:number,file?:File) => {
    if(!file)return;
    const data=new FormData();data.append("file",file);
    setBusy(true);setMessage("");
    try{await request("/api/qualifications/"+qualificationId+"/document",{method:"POST",body:data});setMessage("Document uploaded. Qualification remains pending verification.");await load();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not upload document.");}
    finally{setBusy(false);}
  };
  const reviewDocument = async (documentId:number) => {
    setBusy(true);setMessage("");
    try{
      const response=await fetch(getApiUrl("/api/qualifications/"+documentId+"/document"),{headers});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||"Document could not be opened.");}
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      window.open(url,"_blank","noopener,noreferrer");
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not open qualification document.");}
    finally{setBusy(false);}
  };
  const verifyQualification = async (id:number,status:"verified"|"rejected") => {
    setBusy(true);setMessage("");
    try{await request("/api/qualifications/"+id+"/verify",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});setMessage("Qualification "+status+".");await load();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not update verification status.");}
    finally{setBusy(false);}
  };
  const savePayoutPreferences = async () => {
    setBusy(true);setMessage("");
    try{
      const body:any={method:payoutMethod};
      if(payoutMethod==="ecocash")body.ecocash_phone=payoutDestination.trim();
      if(payoutMethod==="paypal")body.paypal_email=payoutDestination.trim();
      if(payoutMethod==="bank"){body.bank_name=bankName.trim();body.account_name_holder=accountHolder.trim();}
      await request("/api/users/me/payout-preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      setPayoutDestination("");setMessage("Payout preferences saved. Existing destination remains masked.");
      const fresh=await request("/api/users/me/payout-preferences");setPayoutDestinationMasked(fresh.destination_masked||"");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save payout preferences.");}
    finally{setBusy(false);}
  };
  const requestNotificationOtp = async () => {
    setBusy(true);setMessage("");
    try{const result=await request("/api/users/me/notification-email/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:notificationEmail})});setMessage(result.message||"Verification code sent.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not send verification code.");}
    finally{setBusy(false);}
  };
  const verifyNotificationOtp = async () => {
    setBusy(true);setMessage("");
    try{const result=await request("/api/users/me/notification-email/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:notificationEmail,otp:notificationOtp})});setNotificationEmailVerified(Boolean(result.verified));setNotificationOtp("");setMessage(result.message||"Notification email verified.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not verify notification email.");}
    finally{setBusy(false);}
  };
  const saveRecoveryEmail = async () => {
    setBusy(true);setMessage("");
    try {
      await request("/api/users/me/recovery-profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({recoveryEmail})});
      setRecoveryEmailVerified(false);setRecoveryCode("");setMessage("Recovery email saved. Verify it before it can receive password reset links.");
    } catch(e) {setMessage(e instanceof Error?e.message:"Could not save recovery email.");}
    finally {setBusy(false);}
  };
  const requestRecoveryCode = async () => {
    setBusy(true);setMessage("");
    try { await request("/api/users/me/recovery-profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({recoveryEmail})});const result=await request("/api/users/me/recovery-email/request-verification",{method:"POST"});setMessage(result.message||"Verification code sent."); }
    catch(e) {setMessage(e instanceof Error?e.message:"Could not send recovery verification code.");}
    finally {setBusy(false);}
  };
  const verifyRecoveryCode = async () => {
    setBusy(true);setMessage("");
    try { const result=await request("/api/users/me/recovery-email/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:recoveryCode})});setRecoveryEmailVerified(Boolean(result.recoveryEmailVerified));setRecoveryCode("");setMessage(result.message||"Recovery email verified."); }
    catch(e) {setMessage(e instanceof Error?e.message:"Could not verify recovery email.");}
    finally {setBusy(false);}
  };
  const saveQualificationsBulk = async () => {
    const titles=[...new Set(qualificationInput.split("\n").map(value=>value.trim()).filter(Boolean))];
    if(!titles.length||titles.length>50){setMessage("Enter between 1 and 50 qualifications, one per line.");return;}
    setBusy(true);setMessage("");
    try{const result=await request("/api/users/me/qualifications/bulk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({qualifications:titles})});setQualificationInput("");setMessage(`Saved ${result.saved} qualifications for verification.`);await load();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not save qualifications.");}
    finally{setBusy(false);}
  };
  const saveName = async () => {
    const name=nameInput.trim();
    if(name.length<2||name.length>200){setMessage("Enter a legal name between 2 and 200 characters.");return;}
    setBusy(true);setMessage("");
    try{const updated=await request("/api/users/"+user!.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});setProfile(p=>p?{...p,display_name:updated.name||name}:p);setNameInput(updated.name||name);setMessage("Your name was saved.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not save your name.");}
    finally{setBusy(false);}
  };
  const requestPhoneCode = async () => {
    const phone=phoneInput.trim();
    if(!/^\+[1-9]\d{7,14}$/.test(phone)){setMessage("Use international phone format, including country code (for example +263…).");return;}
    setBusy(true);setMessage("");
    try{await request("/api/users/"+user!.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});await request("/api/users/me/phone/request-verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});setPhoneVerified(false);setMessage("A six-digit verification code was sent by SMS.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not send phone verification code.");}
    finally{setBusy(false);}
  };
  const verifyPhone = async () => {
    if(!/^\d{6}$/.test(phoneOtp)){setMessage("Enter the six-digit SMS code.");return;}
    setBusy(true);setMessage("");
    try{await request("/api/users/me/phone/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:phoneOtp})});setPhoneVerified(true);setPhoneOtp("");setMessage("Phone number verified.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not verify phone number.");}
    finally{setBusy(false);}
  };
  const savePhone = async () => {
    const phone=phoneInput.trim();
    if(phone.length>40){setMessage("Phone number must be 40 characters or fewer.");return;}
    setBusy(true);setMessage("");
    try{await request("/api/users/"+user!.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:phone||null})});setPhoneVerified(false);setPhoneOtp("");setMessage("Phone number saved. Verify it before SMS alerts can be sent.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not save your phone number.");}
    finally{setBusy(false);}
  };
  const uploadProfileDocument = async (file?:File) => {
    if(!file)return;
    const allowed=["application/pdf","image/jpeg","image/png","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if(!allowed.includes(file.type)){setMessage("Upload a PDF, JPG, PNG, DOC or DOCX file.");return;}
    if(file.size>10*1024*1024){setMessage("Documents must be 10 MB or smaller.");return;}
    const form=new FormData();form.append("file",file);form.append("documentType",documentType);
    setBusy(true);setMessage("");
    try{await request("/api/users/me/teacher-documents",{method:"POST",body:form});setMessage(documentType.toUpperCase()+" uploaded and saved.");const rows=await request("/api/users/"+user!.id+"/teacher-documents");setDocuments(Array.isArray(rows)?rows:[]);}
    catch(e){setMessage(e instanceof Error?e.message:"Could not upload document.");}
    finally{setBusy(false);}
  };
  const openProfileDocument = async (doc:any) => {
    setBusy(true);setMessage("");
    try{const response=await fetch(getApiUrl("/api/users/"+profileId+"/teacher-documents/"+doc.id),{headers});if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||"Document could not be opened.");}const blob=await response.blob();const url=URL.createObjectURL(blob);window.open(url,"_blank","noopener,noreferrer");window.setTimeout(()=>URL.revokeObjectURL(url),60_000);}
    catch(e){setMessage(e instanceof Error?e.message:"Could not open document.");}
    finally{setBusy(false);}
  };
  const uploadAvatar = async (file?:File) => {
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setMessage("Choose a JPG, PNG or WebP image.");return;}
    const form=new FormData();form.append("file",file);setAvatarBusy(true);setMessage("");
    try{const updated=await request("/api/users/me/avatar",{method:"POST",body:form});setProfile(p=>p?{...p,avatar:updated.avatarUrl||p.avatar}:p);setMessage("Profile image saved.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not upload profile image.");}
    finally{setAvatarBusy(false);}
  };
  const saveSubjects = async () => {
    setBusy(true);setMessage("");
    try {
      const arr=[...new Set(subjectInput.split(",").map(s=>s.trim()).filter(Boolean))];
      const professional=["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase());
      const payload=professional?{teaching_subjects:arr,subjects_to_teach:arr,primary_subject:arr.includes(primarySubject)?primarySubject:(arr[0]||"")}:{subjects:arr};
      await request("/api/users/me/subjects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      setMessage(professional?"Teaching subjects saved.":"Learning subjects saved; recommendations will use these preferences.");await load();
    } catch(e) {setMessage(e instanceof Error?e.message:"Could not save subjects.");}
    finally {setBusy(false);}
  };
  if(!user) return <DashboardLayout><div className="p-6">Sign in to view profiles.</div></DashboardLayout>;
  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <Card className="overflow-hidden border-0 shadow-md"><div className="bg-[#0a1931] p-6 text-white md:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">{profile?.avatar?<img src={profile.avatar.startsWith("/api/")?getApiUrl(profile.avatar):profile.avatar} alt={"Profile image for "+(profile.display_name||"user")} className="h-28 w-28 rounded-full border-4 border-white/20 object-cover shadow-lg md:h-32 md:w-32"/>:<div aria-label="Default profile avatar" className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 text-4xl font-bold md:h-32 md:w-32">{(profile?.display_name||"?").slice(0,1).toUpperCase()}</div>}
      <div><p className="text-xs uppercase tracking-widest text-amber-300">{profile?.is_prefect?"Prefect":String(profile?.role||"").toLowerCase()==="student"?"Learner":profile?.role||"Profile"}</p><h1 className="mt-1 text-2xl font-bold">{profile?.display_name||"Profile Hub"}</h1><p className="mt-1 text-sm text-white/70">{isOwner?"Manage your profile and professional records":"Public profile"}</p>{isOwner&&<label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">{avatarBusy?"Uploading image…":"Change profile image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={e=>void uploadAvatar(e.target.files?.[0])}/></label>}</div></div>
      {profile?.bio&&<p className="mt-4 max-w-2xl text-sm text-white/80">{profile.bio}</p>}
    </div><CardContent className="p-3"><div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Profile sections">{tabs.filter(t=>t!=="Qualifications"||["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())).map(t=><Button key={t} role="tab" aria-selected={tab===t} variant={tab===t?"default":"outline"} size="sm" onClick={()=>setTab(t)}>{t}</Button>)}</div></CardContent></Card>
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    {tab==="Overview"&&<div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Profile overview</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{isOwner?<div className="space-y-2"><label htmlFor="profile-legal-name" className="block font-semibold">Legal name</label><input id="profile-legal-name" className="w-full rounded-md border bg-background p-2 text-foreground" maxLength={200} value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="Enter your legal name"/><Button disabled={busy||nameInput.trim().length<2} onClick={()=>void saveName()}>Save name</Button></div>:<p><strong>Name:</strong> {profile?.display_name||"Loading…"}</p>}<p><strong>Role:</strong> {String(profile?.role||"—").toLowerCase()==="student"?"Learner":profile?.role||"—"}</p>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<p><strong>Verified qualifications:</strong> {profile?.verified_qualifications?.length||0}</p>}<p><strong>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())?"Specialized subjects":"Learning subjects"}:</strong> {profile?.subjects_to_teach?.join(", ")||"Not listed"}</p>{!["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<><p><strong>Grade:</strong> {profile?.grade||"Not recorded"}</p><p><strong>School fees:</strong> {profile?.fees_status==="paid"?"Paid":profile?.fees_status==="overdue"?"Overdue":profile?.fees_status==="pending"?"Pending":"Not recorded"}</p><p><strong>Leaderboard position:</strong> {profile?.leaderboard_position?("#"+profile.leaderboard_position):"Not ranked"}</p><p><strong>Achievements awarded:</strong> {profile?.achievement_count??achievements.length}</p><p><strong>Groups joined:</strong> {(profile?.groups_joined||[]).length?profile!.groups_joined!.map(g=>g.name).join(", "):"None recorded"}</p>{profile?.is_prefect&&<div className="space-y-1 rounded-md border p-3"><p className="font-semibold">Prefect activity</p><p>Groups owned: {(profile.groups_owned||[]).map(g=>g.name).join(", ")||"None recorded"}</p><p>Groups with settings permission: {(profile.groups_with_settings_permission||[]).map(g=>g.name).join(", ")||"None recorded"}</p><p>Lesson requests: {profile.lesson_requests_count??0}</p></div>}</>}{isOwner&&<div className="space-y-2 border-t pt-3"><label htmlFor="profile-phone" className="block font-semibold">Mobile phone number</label><input id="profile-phone" type="tel" autoComplete="tel" maxLength={40} className="w-full rounded-md border bg-background p-2 text-foreground" value={phoneInput} onChange={e=>{setPhoneInput(e.target.value);setPhoneVerified(false);}} placeholder="+263…"/><p className={phoneVerified?"text-xs text-emerald-700":"text-xs text-muted-foreground"}>{phoneVerified?"Verified — eligible for urgent SMS alerts":"Not verified"}</p><div className="flex flex-wrap gap-2"><Button disabled={busy||phoneInput.length>40} onClick={()=>void savePhone()}>Save phone number</Button><Button variant="outline" disabled={busy||!/^\+[1-9]\d{7,14}$/.test(phoneInput.trim())} onClick={()=>void requestPhoneCode()}>Send SMS code</Button></div><div className="flex gap-2"><input aria-label="Six-digit phone verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={phoneOtp} onChange={e=>setPhoneOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||phoneOtp.length!==6} onClick={()=>void verifyPhone()}>Verify phone</Button></div></div>}</CardContent></Card>{isOwner&&<Card><CardHeader><CardTitle>Profile completion</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Keep your qualifications and teaching subjects current. You can edit your own profile details. Verified academic records and platform roles remain controlled by the system; other users can only view information permitted for their role.</p><div className="space-y-2 border-t pt-3"><label htmlFor="notification-email" className="font-medium text-foreground">Notification email</label><input id="notification-email" type="email" autoComplete="email" className="w-full rounded-md border bg-background p-2 text-foreground" value={notificationEmail} onChange={e=>{setNotificationEmail(e.target.value);setNotificationEmailVerified(false);}} placeholder="you@example.com"/><p>{notificationEmailVerified?"Verified":"Not verified"}</p>{!notificationEmailVerified&&<Button disabled={busy||!notificationEmail.trim()} onClick={()=>void requestNotificationOtp()}>Send verification code</Button>}<div className="flex gap-2"><input aria-label="Six digit email verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={notificationOtp} onChange={e=>setNotificationOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||notificationOtp.length!==6} onClick={()=>void verifyNotificationOtp()}>Verify</Button></div></div>{isOwner&&!["owner","admin","platform_owner"].includes(String((user?.role||"")).toLowerCase())&&<div className="mt-4 border-t pt-4"><h3 className="font-semibold text-foreground">Account recovery</h3><p className="mt-1 text-xs text-muted-foreground">Add a backup email and verify control of it. Phone recovery is not enabled until an SMS provider is configured; security questions are not used alone to reset passwords.</p><input aria-label="Alternate recovery email" type="email" autoCapitalize="none" autoComplete="email" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={recoveryEmail} onChange={e=>{setRecoveryEmail(e.target.value);setRecoveryEmailVerified(false);}} placeholder="Backup email address"/><div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy||!recoveryEmail.trim()} onClick={()=>void saveRecoveryEmail()}>Save recovery email</Button><Button variant="outline" disabled={busy||!recoveryEmail.trim()||recoveryEmailVerified} onClick={()=>void requestRecoveryCode()}>Send verification code</Button></div><p className={recoveryEmailVerified?"mt-2 text-xs text-emerald-700":"mt-2 text-xs text-muted-foreground"}>{recoveryEmailVerified?"Backup email verified":"Backup email not verified"}</p><div className="mt-2 flex gap-2"><input aria-label="Recovery email verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.replace(/\\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||recoveryCode.length!==6} onClick={()=>void verifyRecoveryCode()}>Verify</Button></div></div>}{profile?.role==="teacher"&&<div className="mt-4 border-t pt-4"><h3 className="font-semibold text-foreground">Private payout preferences</h3><p className="mt-1 text-xs text-muted-foreground">Only EcoCash phone OR PayPal email OR bank name/account holder. Never enter a PIN, card number, CVV, or password.</p><select aria-label="Payout method" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutMethod} onChange={e=>{setPayoutMethod(e.target.value);setPayoutDestination("");}}><option value="ecocash">EcoCash</option><option value="paypal">PayPal</option><option value="bank">Bank transfer details</option></select>{payoutDestinationMasked&&<p className="mt-2 text-xs text-muted-foreground">Saved destination: {payoutDestinationMasked}</p>}{payoutMethod==="ecocash"&&<input aria-label="EcoCash phone number" autoComplete="tel" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutDestination} onChange={e=>setPayoutDestination(e.target.value)} placeholder="EcoCash phone number"/>}{payoutMethod==="paypal"&&<input aria-label="PayPal email" autoCapitalize="none" autoComplete="email" type="email" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutDestination} onChange={e=>setPayoutDestination(e.target.value)} placeholder="PayPal email"/>}{payoutMethod==="bank"&&<div className="mt-2 grid gap-2"><input aria-label="Bank name" className="w-full rounded-md border bg-background p-2 text-foreground" value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Bank name"/><input aria-label="Account holder" className="w-full rounded-md border bg-background p-2 text-foreground" value={accountHolder} onChange={e=>setAccountHolder(e.target.value)} placeholder="Account holder name"/></div>}<Button disabled={busy||(payoutMethod==="ecocash"||payoutMethod==="paypal"?!payoutDestination.trim():!bankName.trim()||!accountHolder.trim())} className="mt-2" onClick={()=>void savePayoutPreferences()}>Save payout preferences</Button></div>}</CardContent></Card>}</div>}
    {tab==="Qualifications"&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<Card><CardHeader><CardTitle>Qualifications</CardTitle></CardHeader><CardContent className="space-y-4">{(isOwner?qualifications:profile?.verified_qualifications||[]).map((q:any)=><div key={q.id||q.title} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-semibold">{q.title}</p><p className="text-sm text-muted-foreground">{q.institution||""}{q.year?" · "+q.year:""}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{q.verification_status||"verified"}</span></div>)}{!qualifications.length&&!profile?.verified_qualifications?.length&&<p className="text-sm text-muted-foreground">No qualifications have been added yet.</p>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">CV, resume & certificates</h3><p className="text-sm text-muted-foreground">Upload your own records. They are stored against your account; resumes and CVs remain private to you and authorized managers.</p><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Document type" className="rounded-md border bg-background p-2 text-sm text-foreground" value={documentType} onChange={e=>setDocumentType(e.target.value)}><option value="cv">CV</option><option value="resume">Resume</option><option value="certificate">Certificate</option><option value="proof">Other qualification proof</option></select><input aria-label="Choose document to upload" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={e=>void uploadProfileDocument(e.target.files?.[0])}/></div></div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&(qualifications||[]).map((q:any)=><label key={"upload-"+q.id} className="flex flex-wrap items-center gap-2 text-sm"><span>Upload document for {q.title}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={e=>void uploadDocument(q.id,e.target.files?.[0])}/></label>)}{documents.length>0&&<div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Uploaded documents</h3>{documents.map((doc:any)=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="font-medium">{doc.file_name}</p><p className="text-xs text-muted-foreground">{String(doc.document_type).toUpperCase()} · {Math.ceil(Number(doc.size_bytes||0)/1024)} KB</p></div><Button variant="outline" size="sm" disabled={busy} onClick={()=>void openProfileDocument(doc)}>Open</Button></div>)}</div>}{["owner","admin","platform_owner"].includes(String((user?.role||"")).toLowerCase())&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Pending verification</h3>{moderationQueue.length?moderationQueue.map((q:any)=><div key={"moderate-"+q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-semibold">{q.title}</p><p className="text-sm text-muted-foreground">{q.teacher_name} · {q.institution||"Institution not provided"}{q.year?" · "+q.year:""}</p>{q.document_id&&<button type="button" className="text-sm underline" disabled={busy} onClick={()=>void reviewDocument(q.document_id)}>Review document</button>}</div><div className="flex gap-2"><Button disabled={busy} onClick={()=>void verifyQualification(q.id,"verified")}>Verify</Button><Button variant="outline" disabled={busy} onClick={()=>void verifyQualification(q.id,"rejected")}>Reject</Button></div></div>):<p className="text-sm text-muted-foreground">No pending qualifications.</p>}</div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Add multiple qualifications</h3><p className="text-sm text-muted-foreground">Enter one qualification per line. All entries are saved together and marked pending verification.</p><textarea aria-label="Qualifications, one per line" rows={4} maxLength={25000} className="w-full rounded-md border bg-background p-3 text-sm text-foreground" placeholder={"Diploma in Education\nBachelor of Science\nMaster's Degree"} value={qualificationInput} onChange={e=>setQualificationInput(e.target.value)}/><Button disabled={busy||!qualificationInput.trim()} onClick={()=>void saveQualificationsBulk()}>Save all qualifications</Button></div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="grid gap-3 border-t pt-4 md:grid-cols-3"><input className="rounded-md border bg-background p-2 text-sm" placeholder="Qualification title *" value={title} onChange={e=>setTitle(e.target.value)}/><input className="rounded-md border bg-background p-2 text-sm" placeholder="Institution" value={institution} onChange={e=>setInstitution(e.target.value)}/><input className="rounded-md border bg-background p-2 text-sm" placeholder="Year" value={year} onChange={e=>setYear(e.target.value)}/><Button disabled={busy||!title.trim()} onClick={()=>void addQualification()}>Add qualification</Button></div>}</CardContent></Card>}
    {tab==="Subjects"&&<Card><CardHeader><CardTitle>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())?"Teaching subjects & specialization":"Learning subjects"}</CardTitle></CardHeader><CardContent className="space-y-3">{(profile?.subjects_to_teach||[]).map(s=><span key={s} className="mr-2 inline-block rounded-full bg-muted px-3 py-1 text-sm">{s}{profile?.primary_subject===s?" · Primary":""}</span>)}{!profile?.subjects_to_teach?.length&&<p className="text-sm text-muted-foreground">No subjects selected yet.</p>}{isOwner&&<div className="space-y-3 border-t pt-3"><p className="text-sm text-muted-foreground">Choose from subjects currently found in lessons and live classes, or add a subject by typing it below.</p><div className="flex flex-wrap gap-2">{subjectCatalog.map(s=><Button key={s} type="button" size="sm" variant={subjectInput.split(",").map(v=>v.trim()).includes(s)?"default":"outline"} onClick={()=>{const current=subjectInput.split(",").map(v=>v.trim()).filter(Boolean);setSubjectInput((current.includes(s)?current.filter(v=>v!==s):[...current,s]).join(", "));}}>{s}</Button>)}</div><label className="block text-sm font-medium">Selected subjects (comma-separated; editable)<input className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" placeholder="Add or edit subjects" value={subjectInput} onChange={e=>setSubjectInput(e.target.value)}/></label>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<label className="block text-sm font-medium">Primary specialization<select className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" value={primarySubject} onChange={e=>setPrimarySubject(e.target.value)}><option value="">Choose primary subject</option>{subjectInput.split(",").map(v=>v.trim()).filter(Boolean).map(s=><option key={s} value={s}>{s}</option>)}</select></label>}<Button disabled={busy} onClick={()=>void saveSubjects()}>Save subjects</Button></div>}</CardContent></Card>}
    {tab==="Enrollments"&&<Card><CardHeader><CardTitle>Enrollments</CardTitle></CardHeader><CardContent className="space-y-3">{isOwner?<>{enrollments.length?enrollments.map((entry:any)=><div key={entry.id} className="rounded-lg border p-3"><p className="font-semibold">{entry.title}</p><p className="text-sm text-muted-foreground">{entry.subject}{entry.grade?" · Grade "+entry.grade:""}{entry.teacher_name?" · "+entry.teacher_name:""}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:Math.max(0,Math.min(100,Number(entry.progress_percent)||0))+"%"}}/></div><p className="mt-1 text-xs text-muted-foreground">{entry.progress_percent}% complete · Enrolled {entry.enrolled_at?new Date(entry.enrolled_at).toLocaleDateString():"date unavailable"}</p></div>):<p className="text-sm text-muted-foreground">No active class enrollments recorded.</p>}</>:<p className="text-sm text-muted-foreground">Enrollment details are private.</p>}</CardContent></Card>}
    {tab==="Achievements"&&<Card><CardHeader><CardTitle>Achievements</CardTitle></CardHeader><CardContent className="space-y-3">{achievements.length?achievements.map((entry:any)=><div key={entry.id} className="flex items-start gap-3 rounded-lg border p-3"><span className="text-2xl" aria-hidden="true">{entry.achievement?.icon||"🏆"}</span><div className="min-w-0 flex-1"><p className="font-semibold">{entry.achievement?.name||"Achievement"}</p><p className="text-sm text-muted-foreground">{entry.achievement?.description||"Achievement awarded on the platform."}</p>{isOwner&&entry.note&&<p className="mt-1 text-sm">{entry.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{entry.earnedAt?new Date(entry.earnedAt).toLocaleDateString(): "Award date unavailable"} · {entry.achievement?.pointsValue??0} points</p></div></div>):<p className="text-sm text-muted-foreground">No achievements recorded yet.</p>}</CardContent></Card>}
  </main></DashboardLayout>;
}
