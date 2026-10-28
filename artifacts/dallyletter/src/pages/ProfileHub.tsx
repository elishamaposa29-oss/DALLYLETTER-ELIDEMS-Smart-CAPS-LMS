import { useEffect, useMemo, useRef, useState, type MouseEventHandler } from "react";
import { useRoute } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tab = "Overview" | "Qualifications" | "Subjects" | "Enrollments" | "Achievements" | "Reports" | "Attendance" | "Payments" | "Transfer Letters";
type PublicProfile = { id: number; display_name: string; avatar: string | null; cover_url?: string | null; cover_type?: string | null; bio: string | null; role: string; verified_qualifications: Array<{title:string;verified:boolean}>; subjects_to_teach: string[]; subjects?: string[]; primary_subject?: string | null; grade?: string | null; is_prefect?: boolean; is_manager?: boolean; performance_score?: number; leaderboard_position?: number | null; badge_count?: number; streak_days?: number; groups_joined?: Array<{id:number;name:string;subject:string}>; groups_owned?: Array<{id:number;name:string;subject:string}>; groups_with_settings_permission?: Array<{id:number;name:string;subject:string}>; fees_status?: string; achievement_count?: number; lesson_requests_count?: number };
const tabs: Tab[] = ["Overview","Qualifications","Subjects","Enrollments","Achievements","Reports","Attendance","Payments","Transfer Letters"];

type AuthenticatedProfileMediaProps = { url: string; type?: string; alt?: string; className?: string; decorative?: boolean; controls?: boolean; autoPlay?: boolean; muted?: boolean; loop?: boolean; onClick?: MouseEventHandler<any>; onError?: () => void };
function AuthenticatedProfileMedia({url,type="image",alt="",className="",decorative=false,controls=false,autoPlay=false,muted=false,loop=false,onClick,onError}:AuthenticatedProfileMediaProps) {
  const [source,setSource]=useState<string|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;let objectUrl:string|undefined;
    const load=async()=>{
      if(!url.startsWith("/api/")){setSource(url);return;}
      const token=typeof localStorage!=="undefined"?localStorage.getItem("dallyletter_token"):null;
      const response=await fetch(getApiUrl(url),{headers:token?{Authorization:"Bearer "+token}:{}});
      if(!response.ok)throw new Error("Profile media could not be loaded");
      const blob=await response.blob();objectUrl=URL.createObjectURL(blob);
      if(active)setSource(objectUrl);else URL.revokeObjectURL(objectUrl);
    };
    setSource(null);setFailed(false);void load().catch(()=>{if(active){setSource(null);setFailed(true);onError?.();}});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[url]);
  if(!source)return <div aria-hidden={!failed||decorative||undefined} role={failed&&!decorative?"status":undefined} className={className}>{failed&&!decorative?<span className="sr-only">Profile media could not be loaded. Check your connection and try again.</span>:null}</div>;
  if(type.startsWith("video/"))return <video src={source} aria-hidden={decorative||undefined} controls={controls} autoPlay={autoPlay} muted={muted} loop={loop} playsInline className={className} onClick={onClick} onError={()=>{setFailed(true);onError?.();}}/>;
  return <img src={source} alt={decorative?"":alt} aria-hidden={decorative||undefined} className={className} onClick={onClick} onError={()=>{setFailed(true);onError?.();}}/>;
}

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
  const [academicAttendance,setAcademicAttendance] = useState<any[]>([]);
  const [approvedReports,setApprovedReports] = useState<any[]>([]);
  const [transferRequests,setTransferRequests] = useState<any[]>([]);
  const [paymentRecords,setPaymentRecords] = useState<any[]>([]);
  const [termStart,setTermStart] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10));
  const [termEnd,setTermEnd] = useState(new Date().toISOString().slice(0,10));
  const [attendancePeriod,setAttendancePeriod] = useState<"Daily"|"Weekly"|"Monthly"|"Termly">("Weekly");
  const [transferReason,setTransferReason] = useState("");
  const [moderationQueue,setModerationQueue] = useState<any[]>([]);
  const [enrollments,setEnrollments] = useState<any[]>([]);
  const [notificationEmail,setNotificationEmail] = useState("");
  const [primaryEmailInput,setPrimaryEmailInput] = useState("");
  const [emailChangePassword,setEmailChangePassword] = useState("");
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
  const [coverBusy,setCoverBusy] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement|null>(null);
  const avatarCameraRef = useRef<HTMLInputElement|null>(null);
  const coverFileRef = useRef<HTMLInputElement|null>(null);
  const coverCameraRef = useRef<HTMLInputElement|null>(null);
  const [fullscreenMedia,setFullscreenMedia] = useState<{url:string;type:string}|null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement|null>(null);
  const openFullscreenMedia = (media:{url:string;type:string}) => {
    setFullscreenMediaError(false);
    const container = fullscreenContainerRef.current;
    if (container) {
      container.style.display = "flex";
      if (container.requestFullscreen) void container.requestFullscreen().catch(() => {});
    }
    if (typeof document !== "undefined") document.body.style.overflow = "hidden";
    setFullscreenMedia(media);
  };
  const closeFullscreenMedia = () => {
    const container = fullscreenContainerRef.current;
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
      if (document.fullscreenElement && (!container || document.fullscreenElement === container)) void document.exitFullscreen().catch(() => {});
    }
    if (container) container.style.display = "none";
    setFullscreenMedia(null);
  };
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (fullscreenMedia && document.fullscreenElement !== fullscreenContainerRef.current) {
        if (fullscreenContainerRef.current) fullscreenContainerRef.current.style.display = "none";
        document.body.style.overflow = "";
        setFullscreenMedia(null);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [fullscreenMedia]);
  const [fullscreenMediaError,setFullscreenMediaError] = useState(false);
  const [mediaRefreshKey,setMediaRefreshKey] = useState(0);
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
        const [me, q, s, academic, earned, enrolled, notification, payout, recovery, catalog, docs, publicSummary, academicRecords, reports, transfers, payments] = await Promise.all([
          request("/api/users/"+profileId),
          request("/api/users/me/qualifications").catch(()=>[]),
          request("/api/users/me/subjects").catch((error)=>{setMessage("Could not load saved subjects from the server. Your saved choices have not been changed. "+(error instanceof Error?error.message:"Please retry."));return {subjects:[],teaching_subjects:[],subjects_to_teach:[],primary_subject:null};}),
          
          request("/api/users/me/enrollments-summary").catch(()=>null),
          request("/api/achievements/my").catch(()=>[]),
          request("/api/users/me/enrollments").catch(()=>[]),
          request("/api/users/me/notification-email").catch(()=>({notification_email:null,notification_email_verified_at:null})),
          request("/api/users/me/payout-preferences").catch(()=>({})),
          request("/api/users/me/recovery-profile").catch(()=>({recovery_email:null,recovery_email_verified_at:null})),
          request("/api/subjects/catalog").catch(()=>({subjects:[]})),
          request("/api/users/"+profileId+"/teacher-documents").catch(()=>[]),
          request("/api/users/"+profileId+"/public-profile").catch(()=>({})),
          request("/api/academic-records/me").catch(()=>({attendance:[]})),
          request("/api/academic-records/reports/me").catch(()=>[]),
          request("/api/academic-records/transfer-requests").catch(()=>[]),
          (["student","prefect","learner"].includes(String(user?.role||"").toLowerCase())?request("/api/payments").catch(()=>[]):Promise.resolve([]))
        ]);
        const professional = ["teacher","manager","senior_manager"].includes(String(me.role).toLowerCase());
        const savedSubjects = professional ? (s.subjects_to_teach||[]) : (s.subjects||[]);
        setProfile({...publicSummary,id:me.id,display_name:me.name,avatar:me.avatarUrl,bio:me.bio,role:me.role,verified_qualifications:professional?(q||[]).filter((v:any)=>v.verification_status==="verified").map((v:any)=>({title:v.title,verified:true})):[],subjects_to_teach:savedSubjects,subjects:savedSubjects,primary_subject:s.primary_subject||null,grade:me.grade,is_prefect:Boolean(me.isPrefect),is_manager:Boolean(me.isManager)});
        setNameInput(me.name||""); setPhoneInput(me.phone||""); setPhoneVerified(Boolean(recovery.recovery_phone_verified_at&&recovery.recovery_phone===me.phone)); setSubjectCatalog(Array.isArray(catalog.subjects)?catalog.subjects:[]);
        setQualifications(professional?(q||[]):[]); setDocuments(professional&&Array.isArray(docs)?docs:[]); setSubjects(s||{teaching_subjects:[],subjects_to_teach:[]}); setSubjectInput(savedSubjects.join(", ")); setPrimarySubject(s.primary_subject||savedSubjects[0]||""); setSummary(academic); setAchievements(Array.isArray(earned)?earned:[]); setEnrollments(Array.isArray(enrolled)?enrolled:[]); setAcademicAttendance(Array.isArray(academicRecords?.attendance)?academicRecords.attendance:[]); setApprovedReports(Array.isArray(reports)?reports:[]); setTransferRequests(Array.isArray(transfers)?transfers:[]); setPaymentRecords(Array.isArray(payments)?payments:[]); setNotificationEmail(notification.notification_email||""); setNotificationEmailVerified(Boolean(notification.notification_email_verified_at)); setPayoutMethod(payout.method||"ecocash"); setPayoutDestinationMasked(payout.destination_masked||""); setBankName(payout.bank_name||""); setAccountHolder(payout.account_name_holder||""); setRecoveryEmail(recovery.recovery_email||""); setRecoveryEmailVerified(Boolean(recovery.recovery_email_verified_at)); if(["owner","admin","platform_owner"].includes(String(me.role).toLowerCase())) request("/api/qualifications/pending").then((rows:any)=>setModerationQueue(Array.isArray(rows)?rows:[])).catch(()=>setModerationQueue([]));
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
    if(file.size>8*1024*1024){setMessage("Profile photos must be 8 MB or smaller.");return;}
    const form=new FormData();form.append("file",file);setAvatarBusy(true);setMessage("");
    try{await request("/api/users/me/avatar",{method:"POST",body:form});const fresh=await request("/api/users/"+profileId+"/public-profile").catch(()=>null);const me= fresh ? null : await request("/api/users/"+profileId);setProfile(p=>({...p,...(fresh||{}),...(me||{}),id:profileId,display_name:(fresh?.display_name||fresh?.name||me?.name||p?.display_name),avatar:(fresh?.avatar||fresh?.avatarUrl||fresh?.avatar_url||me?.avatarUrl||p?.avatar||null),cover_url:fresh?.cover_url||fresh?.coverUrl||p?.cover_url||null,cover_type:fresh?.cover_type||fresh?.coverType||p?.cover_type||null}));setMediaRefreshKey(v=>v+1);setMessage("Profile photo saved. The refreshed account image is now shown in Profile Hub.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not upload profile image.");}
    finally{setAvatarBusy(false);}
  };
  const uploadCover = async (file?:File) => {
    if(!file)return;
    const allowed=["image/jpeg","image/png","image/webp","video/mp4","video/webm","video/quicktime"];
    if(!allowed.includes(file.type)){setMessage("Choose JPG, PNG, WebP, MP4, WebM or MOV media.");return;}
    if(file.size>20*1024*1024){setMessage("Cover media must be 20 MB or smaller on the current storage configuration.");return;}
    const form=new FormData();form.append("file",file);setCoverBusy(true);setMessage("");
    try{const uploaded=await request("/api/users/me/cover",{method:"POST",body:form});const fresh=await request("/api/users/"+profileId+"/public-profile").catch(()=>null);const me=fresh?null:await request("/api/users/"+profileId);setProfile(p=>({...p,...(fresh||{}),...(me||{}),id:profileId,display_name:(fresh?.display_name||fresh?.name||me?.name||p?.display_name),avatar:(fresh?.avatar||fresh?.avatarUrl||fresh?.avatar_url||me?.avatarUrl||p?.avatar||null),cover_url:(uploaded?.coverUrl||uploaded?.cover_url||fresh?.cover_url||fresh?.coverUrl||p?.cover_url||null),cover_type:(uploaded?.coverType||uploaded?.cover_type||fresh?.cover_type||fresh?.coverType||p?.cover_type||null)}));setMediaRefreshKey(v=>v+1);setMessage("Profile cover saved and displayed. Refresh the page to verify persistence.");}
    catch(e){setMessage(e instanceof Error?e.message:"Could not upload profile cover.");}
    finally{setCoverBusy(false);}
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
  const requestPrimaryEmailChange = async () => {
    if (!primaryEmailInput.trim() || !emailChangePassword) { setMessage("Enter the new email address and your current password."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/auth/email-change/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: primaryEmailInput.trim(), currentPassword: emailChangePassword }) });
      setEmailChangePassword("");
      setMessage(result.message || "Check the new email address for a confirmation link. Your current email stays active until confirmation.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not request an email change."); }
    finally { setBusy(false); }
  };
  if(!user) return <DashboardLayout><div className="p-6">Sign in to view profiles.</div></DashboardLayout>;
  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <Card className="overflow-hidden rounded-3xl border border-white/30 bg-transparent shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-none">
      <section aria-label="Profile identity card" className="relative isolate min-h-[340px] overflow-hidden bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-950 text-white sm:min-h-[380px]">
        <div className="absolute inset-0 z-0">
          {profile?.cover_url ? (
            String(profile.cover_type||"").startsWith("video/") ? (
              <AuthenticatedProfileMedia key={"cover-video-"+mediaRefreshKey+profile.cover_url} url={profile.cover_url} type={String(profile.cover_type||"")} decorative className="h-full w-full object-cover" autoPlay muted loop/>
            ) : (
              <AuthenticatedProfileMedia key={"cover-image-"+mediaRefreshKey+profile.cover_url} url={profile.cover_url} decorative className="h-full w-full object-cover"/>
            )
          ) : profile?.avatar ? (
            <AuthenticatedProfileMedia key={"cover-fallback-"+mediaRefreshKey+profile.avatar} url={profile.avatar} decorative className="h-full w-full scale-105 object-cover opacity-50 blur-sm"/>
          ) : null}
        </div>
        <div aria-hidden="true" className="absolute inset-0 z-[1] bg-gradient-to-t from-slate-950/20 via-slate-950/5 to-transparent"/>
        {profile?.cover_url&&<button type="button" onClick={()=>openFullscreenMedia({url:profile.cover_url!,type:String(profile.cover_type||"image")})} aria-label="Open profile cover fullscreen" className="absolute inset-0 z-[2] cursor-zoom-in"/>}
        <div className="relative z-10 flex min-h-[340px] flex-col justify-end p-4 sm:min-h-[380px] sm:p-7 md:p-9">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/95 shadow-lg backdrop-blur-xl">Dallyletter · Profile Hub</span>
            {profile?.cover_url&&<span className="rounded-full border border-white/25 bg-black/20 px-3 py-1 text-xs text-white/90 backdrop-blur-md">Tap cover to view</span>}
          </div>
          <div className="relative z-10 flex flex-col gap-4 rounded-[1.75rem] border border-white/25 bg-slate-950/[0.04] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-none sm:flex-row sm:items-center sm:gap-5 sm:p-5">
            <div className="flex shrink-0 items-center gap-4">
              {profile?.avatar ? (
                <button type="button" aria-label="Open profile avatar fullscreen" onClick={()=>openFullscreenMedia({url:profile.avatar!,type:"image"})} className="rounded-full focus:outline-none focus:ring-4 focus:ring-white/70">
                  <AuthenticatedProfileMedia key={"avatar-"+mediaRefreshKey+profile.avatar} url={profile.avatar} alt={"Profile avatar for "+(profile.display_name||"user")} className="h-24 w-24 rounded-full border-[5px] border-white/80 bg-white/20 object-cover shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-2 ring-white/30 sm:h-28 sm:w-28 md:h-32 md:w-32"/>
                </button>
              ) : (
                <div aria-label="Default profile avatar" className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-white/70 bg-white/20 text-4xl font-bold shadow-xl backdrop-blur-md sm:h-28 sm:w-28 md:h-32 md:w-32">{(profile?.display_name||"?").slice(0,1).toUpperCase()}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">{profile?.is_prefect?"Prefect":String(profile?.role||"").toLowerCase()==="student"?"Learner":profile?.role||"Profile"}</p>
              <h1 className="mt-1 break-words text-2xl font-bold leading-tight tracking-tight text-white drop-shadow sm:text-3xl">{profile?.display_name||"Profile Hub"}</h1>
              <p className="mt-2 text-sm text-white/85">{isOwner?"Manage your profile and professional records":"Public profile"}</p>
              {profile?.bio&&<p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90">{profile.bio}</p>}
              {isOwner&&<div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/20 pt-4 sm:flex sm:flex-wrap">
                <button type="button" disabled={avatarBusy} onClick={()=>avatarFileRef.current?.click()} className="inline-flex min-h-10 w-full items-center justify-center whitespace-normal rounded-xl border border-white/45 bg-slate-900/35 px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-sm transition hover:bg-slate-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-auto">{avatarBusy?"Uploading photo…":"Change avatar"}</button>
                <input ref={avatarFileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={e=>void uploadAvatar(e.target.files?.[0])}/>
                <button type="button" disabled={avatarBusy} onClick={()=>avatarCameraRef.current?.click()} className="inline-flex min-h-10 w-full items-center justify-center whitespace-normal rounded-xl border border-white/45 bg-slate-900/35 px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-sm transition hover:bg-slate-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-auto">{avatarBusy?"Camera busy":"Take photo"}</button>
                <input ref={avatarCameraRef} className="hidden" type="file" accept="image/*" capture="user" disabled={avatarBusy} onChange={e=>void uploadAvatar(e.target.files?.[0])}/>
                <button type="button" disabled={coverBusy} onClick={()=>coverFileRef.current?.click()} className="inline-flex min-h-10 w-full items-center justify-center whitespace-normal rounded-xl border border-white/45 bg-slate-900/35 px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-sm transition hover:bg-slate-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-auto">{coverBusy?"Uploading cover…":"Change cover image/video"}</button>
                <input ref={coverFileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={coverBusy} onChange={e=>void uploadCover(e.target.files?.[0])}/>
                <button type="button" disabled={coverBusy} onClick={()=>coverCameraRef.current?.click()} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">{coverBusy?"Camera busy":"Capture cover media"}</button>
                <input ref={coverCameraRef} className="hidden" type="file" accept="image/*,video/*" capture="environment" disabled={coverBusy} onChange={e=>void uploadCover(e.target.files?.[0])}/>
              </div>}
            </div>
          </div>
        </div>
      </section>
      <CardContent className="bg-white/70 p-3 backdrop-blur-xl dark:bg-slate-950/70 sm:p-4">
        <div className="flex max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Profile sections">
          {tabs.filter(t=>t!=="Qualifications"||["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())).filter(t=>isOwner||!["Reports","Attendance","Payments","Transfer Letters"].includes(t)).map(t=><Button key={t} role="tab" aria-selected={tab===t} variant={tab===t?"default":"outline"} size="sm" onClick={()=>setTab(t)} className="shrink-0 snap-start whitespace-nowrap">{t}</Button>)}
        </div>
      </CardContent>
    </Card>
    {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    {isOwner&&tab==="Overview"&&<Card><CardHeader><CardTitle>Account email</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Current email: {user.email || "Not available"}. Changing it requires your current password and confirmation from the new inbox. Your current email remains active until confirmation.</p><label className="block text-sm font-medium">New email address<input type="email" autoComplete="email" className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" maxLength={254} value={primaryEmailInput} onChange={e=>setPrimaryEmailInput(e.target.value)} placeholder="you@example.com"/></label><label className="block text-sm font-medium">Current password<input type="password" autoComplete="current-password" className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" value={emailChangePassword} onChange={e=>setEmailChangePassword(e.target.value)} placeholder="Confirm it is you"/></label><Button disabled={busy||!primaryEmailInput.trim()||!emailChangePassword} onClick={()=>void requestPrimaryEmailChange()}>Send confirmation email</Button></CardContent></Card>}
    {tab==="Overview"&&<div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Profile overview</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{isOwner?<div className="space-y-2"><label htmlFor="profile-legal-name" className="block font-semibold">Legal name</label><input id="profile-legal-name" className="w-full rounded-md border bg-background p-2 text-foreground" maxLength={200} value={nameInput} onChange={e=>setNameInput(e.target.value)} placeholder="Enter your legal name"/><Button disabled={busy||nameInput.trim().length<2} onClick={()=>void saveName()}>Save name</Button></div>:<p><strong>Name:</strong> {profile?.display_name||"Loading…"}</p>}<p><strong>Role:</strong> {String(profile?.role||"—").toLowerCase()==="student"?"Learner":profile?.role||"—"}</p>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<p><strong>Verified qualifications:</strong> {profile?.verified_qualifications?.length||0}</p>}<p><strong>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())?"Specialized subjects":"Learning subjects"}:</strong> {profile?.subjects_to_teach?.join(", ")||"Not listed"}</p>{!["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<><p><strong>Grade:</strong> {profile?.grade||"Not recorded"}</p>{isOwner&&<p><strong>School fees:</strong> {profile?.fees_status==="paid"?"Paid":profile?.fees_status==="overdue"?"Overdue":profile?.fees_status==="pending"?"Pending":"Not recorded"}</p>}<p><strong>Leaderboard position:</strong> {profile?.leaderboard_position?("#"+profile.leaderboard_position):"Not ranked"}</p><p><strong>Achievements awarded:</strong> {profile?.achievement_count??achievements.length}</p>{isOwner&&<p><strong>Groups joined:</strong> {(profile?.groups_joined||[]).length?profile!.groups_joined!.map(g=>g.name).join(", "):"None recorded"}</p>}{isOwner&&profile?.is_prefect&&<div className="space-y-1 rounded-md border p-3"><p className="font-semibold">Prefect activity</p><p>Groups owned: {(profile.groups_owned||[]).map(g=>g.name).join(", ")||"None recorded"}</p><p>Groups with settings permission: {(profile.groups_with_settings_permission||[]).map(g=>g.name).join(", ")||"None recorded"}</p><p>Lesson requests: {profile.lesson_requests_count??0}</p></div>}</>}{isOwner&&<div className="space-y-2 border-t pt-3"><label htmlFor="profile-phone" className="block font-semibold">Mobile phone number</label><input id="profile-phone" type="tel" autoComplete="tel" maxLength={40} className="w-full rounded-md border bg-background p-2 text-foreground" value={phoneInput} onChange={e=>{setPhoneInput(e.target.value);setPhoneVerified(false);}} placeholder="+263…"/><p className={phoneVerified?"text-xs text-emerald-700":"text-xs text-muted-foreground"}>{phoneVerified?"Verified — eligible for urgent SMS alerts":"Not verified"}</p><div className="flex flex-wrap gap-2"><Button disabled={busy||phoneInput.length>40} onClick={()=>void savePhone()}>Save phone number</Button><Button variant="outline" disabled={busy||!/^\+[1-9]\d{7,14}$/.test(phoneInput.trim())} onClick={()=>void requestPhoneCode()}>Send SMS code</Button></div><div className="flex gap-2"><input aria-label="Six-digit phone verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={phoneOtp} onChange={e=>setPhoneOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||phoneOtp.length!==6} onClick={()=>void verifyPhone()}>Verify phone</Button></div></div>}</CardContent></Card>{isOwner&&<Card><CardHeader><CardTitle>Profile completion</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Keep your qualifications and teaching subjects current. You can edit your own profile details. Verified academic records and platform roles remain controlled by the system; other users can only view information permitted for their role.</p><div className="space-y-2 border-t pt-3"><label htmlFor="notification-email" className="font-medium text-foreground">Notification email</label><input id="notification-email" type="email" autoComplete="email" className="w-full rounded-md border bg-background p-2 text-foreground" value={notificationEmail} onChange={e=>{setNotificationEmail(e.target.value);setNotificationEmailVerified(false);}} placeholder="you@example.com"/><p>{notificationEmailVerified?"Verified":"Not verified"}</p>{!notificationEmailVerified&&<Button disabled={busy||!notificationEmail.trim()} onClick={()=>void requestNotificationOtp()}>Send verification code</Button>}<div className="flex gap-2"><input aria-label="Six digit email verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={notificationOtp} onChange={e=>setNotificationOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||notificationOtp.length!==6} onClick={()=>void verifyNotificationOtp()}>Verify</Button></div></div>{isOwner&&!["owner","admin","platform_owner"].includes(String((user?.role||"")).toLowerCase())&&<div className="mt-4 border-t pt-4"><h3 className="font-semibold text-foreground">Account recovery</h3><p className="mt-1 text-xs text-muted-foreground">Add a backup email and verify control of it. Phone recovery is not enabled until an SMS provider is configured; security questions are not used alone to reset passwords.</p><input aria-label="Alternate recovery email" type="email" autoCapitalize="none" autoComplete="email" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={recoveryEmail} onChange={e=>{setRecoveryEmail(e.target.value);setRecoveryEmailVerified(false);}} placeholder="Backup email address"/><div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy||!recoveryEmail.trim()} onClick={()=>void saveRecoveryEmail()}>Save recovery email</Button><Button variant="outline" disabled={busy||!recoveryEmail.trim()||recoveryEmailVerified} onClick={()=>void requestRecoveryCode()}>Send verification code</Button></div><p className={recoveryEmailVerified?"mt-2 text-xs text-emerald-700":"mt-2 text-xs text-muted-foreground"}>{recoveryEmailVerified?"Backup email verified":"Backup email not verified"}</p><div className="mt-2 flex gap-2"><input aria-label="Recovery email verification code" inputMode="numeric" maxLength={6} className="min-w-0 flex-1 rounded-md border bg-background p-2 text-foreground" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.replace(/\\D/g,"").slice(0,6))} placeholder="6-digit code"/><Button disabled={busy||recoveryCode.length!==6} onClick={()=>void verifyRecoveryCode()}>Verify</Button></div></div>}{profile?.role==="teacher"&&<div className="mt-4 border-t pt-4"><h3 className="font-semibold text-foreground">Private payout preferences</h3><p className="mt-1 text-xs text-muted-foreground">Only EcoCash phone OR PayPal email OR bank name/account holder. Never enter a PIN, card number, CVV, or password.</p><select aria-label="Payout method" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutMethod} onChange={e=>{setPayoutMethod(e.target.value);setPayoutDestination("");}}><option value="ecocash">EcoCash</option><option value="paypal">PayPal</option><option value="bank">Bank transfer details</option></select>{payoutDestinationMasked&&<p className="mt-2 text-xs text-muted-foreground">Saved destination: {payoutDestinationMasked}</p>}{payoutMethod==="ecocash"&&<input aria-label="EcoCash phone number" autoComplete="tel" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutDestination} onChange={e=>setPayoutDestination(e.target.value)} placeholder="EcoCash phone number"/>}{payoutMethod==="paypal"&&<input aria-label="PayPal email" autoCapitalize="none" autoComplete="email" type="email" className="mt-2 w-full rounded-md border bg-background p-2 text-foreground" value={payoutDestination} onChange={e=>setPayoutDestination(e.target.value)} placeholder="PayPal email"/>}{payoutMethod==="bank"&&<div className="mt-2 grid gap-2"><input aria-label="Bank name" className="w-full rounded-md border bg-background p-2 text-foreground" value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Bank name"/><input aria-label="Account holder" className="w-full rounded-md border bg-background p-2 text-foreground" value={accountHolder} onChange={e=>setAccountHolder(e.target.value)} placeholder="Account holder name"/></div>}<Button disabled={busy||(payoutMethod==="ecocash"||payoutMethod==="paypal"?!payoutDestination.trim():!bankName.trim()||!accountHolder.trim())} className="mt-2" onClick={()=>void savePayoutPreferences()}>Save payout preferences</Button></div>}</CardContent></Card>}</div>}
    {tab==="Qualifications"&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<Card><CardHeader><CardTitle>Qualifications</CardTitle></CardHeader><CardContent className="space-y-4">{(isOwner?qualifications:profile?.verified_qualifications||[]).map((q:any)=><div key={q.id||q.title} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-semibold">{q.title}</p><p className="text-sm text-muted-foreground">{q.institution||""}{q.year?" · "+q.year:""}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{q.verification_status||"verified"}</span></div>)}{!qualifications.length&&!profile?.verified_qualifications?.length&&<p className="text-sm text-muted-foreground">No qualifications have been added yet.</p>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">CV, resume & certificates</h3><p className="text-sm text-muted-foreground">Upload your own records. They are stored against your account; resumes and CVs remain private to you and authorized managers.</p><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Document type" className="rounded-md border bg-background p-2 text-sm text-foreground" value={documentType} onChange={e=>setDocumentType(e.target.value)}><option value="cv">CV</option><option value="resume">Resume</option><option value="certificate">Certificate</option><option value="proof">Other qualification proof</option></select><input aria-label="Choose document to upload" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={e=>void uploadProfileDocument(e.target.files?.[0])}/></div></div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&(qualifications||[]).map((q:any)=><label key={"upload-"+q.id} className="flex flex-wrap items-center gap-2 text-sm"><span>Upload document for {q.title}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={e=>void uploadDocument(q.id,e.target.files?.[0])}/></label>)}{documents.length>0&&<div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Uploaded documents</h3>{documents.map((doc:any)=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="font-medium">{doc.file_name}</p><p className="text-xs text-muted-foreground">{String(doc.document_type).toUpperCase()} · {Math.ceil(Number(doc.size_bytes||0)/1024)} KB</p></div><Button variant="outline" size="sm" disabled={busy} onClick={()=>void openProfileDocument(doc)}>Open</Button></div>)}</div>}{["owner","admin","platform_owner"].includes(String((user?.role||"")).toLowerCase())&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Pending verification</h3>{moderationQueue.length?moderationQueue.map((q:any)=><div key={"moderate-"+q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-semibold">{q.title}</p><p className="text-sm text-muted-foreground">{q.teacher_name} · {q.institution||"Institution not provided"}{q.year?" · "+q.year:""}</p>{q.document_id&&<button type="button" className="text-sm underline" disabled={busy} onClick={()=>void reviewDocument(q.document_id)}>Review document</button>}</div><div className="flex gap-2"><Button disabled={busy} onClick={()=>void verifyQualification(q.id,"verified")}>Verify</Button><Button variant="outline" disabled={busy} onClick={()=>void verifyQualification(q.id,"rejected")}>Reject</Button></div></div>):<p className="text-sm text-muted-foreground">No pending qualifications.</p>}</div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Add multiple qualifications</h3><p className="text-sm text-muted-foreground">Enter one qualification per line. All entries are saved together and marked pending verification.</p><textarea aria-label="Qualifications, one per line" rows={4} maxLength={25000} className="w-full rounded-md border bg-background p-3 text-sm text-foreground" placeholder={"Diploma in Education\nBachelor of Science\nMaster's Degree"} value={qualificationInput} onChange={e=>setQualificationInput(e.target.value)}/><Button disabled={busy||!qualificationInput.trim()} onClick={()=>void saveQualificationsBulk()}>Save all qualifications</Button></div>}{isOwner&&["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<div className="grid gap-3 border-t pt-4 md:grid-cols-3"><input className="rounded-md border bg-background p-2 text-sm" placeholder="Qualification title *" value={title} onChange={e=>setTitle(e.target.value)}/><input className="rounded-md border bg-background p-2 text-sm" placeholder="Institution" value={institution} onChange={e=>setInstitution(e.target.value)}/><input className="rounded-md border bg-background p-2 text-sm" placeholder="Year" value={year} onChange={e=>setYear(e.target.value)}/><Button disabled={busy||!title.trim()} onClick={()=>void addQualification()}>Add qualification</Button></div>}</CardContent></Card>}
    {tab==="Subjects"&&<Card><CardHeader><CardTitle>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())?"Teaching subjects & specialization":"Learning subjects"}</CardTitle></CardHeader><CardContent className="space-y-3">{(profile?.subjects_to_teach||[]).map(s=><span key={s} className="mr-2 inline-block rounded-full bg-muted px-3 py-1 text-sm">{s}{profile?.primary_subject===s?" · Primary":""}</span>)}{!profile?.subjects_to_teach?.length&&<p className="text-sm text-muted-foreground">No subjects selected yet.</p>}{isOwner&&<div className="space-y-3 border-t pt-3"><p className="text-sm text-muted-foreground">Choose from subjects currently found in lessons and live classes, or add a subject by typing it below.</p><div className="flex flex-wrap gap-2">{subjectCatalog.map(s=><Button key={s} type="button" size="sm" variant={subjectInput.split(",").map(v=>v.trim()).includes(s)?"default":"outline"} onClick={()=>{const current=subjectInput.split(",").map(v=>v.trim()).filter(Boolean);setSubjectInput((current.includes(s)?current.filter(v=>v!==s):[...current,s]).join(", "));}}>{s}</Button>)}</div><label className="block text-sm font-medium">Selected subjects (comma-separated; editable)<input className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" placeholder="Add or edit subjects" value={subjectInput} onChange={e=>setSubjectInput(e.target.value)}/></label>{["teacher","manager","senior_manager"].includes(String(profile?.role||(user?.role||"")).toLowerCase())&&<label className="block text-sm font-medium">Primary specialization<select className="mt-1 w-full rounded-md border bg-background p-2 text-foreground" value={primarySubject} onChange={e=>setPrimarySubject(e.target.value)}><option value="">Choose primary subject</option>{subjectInput.split(",").map(v=>v.trim()).filter(Boolean).map(s=><option key={s} value={s}>{s}</option>)}</select></label>}<Button disabled={busy} onClick={()=>void saveSubjects()}>Save subjects</Button></div>}</CardContent></Card>}
    {tab==="Enrollments"&&<Card><CardHeader><CardTitle>Enrollments</CardTitle></CardHeader><CardContent className="space-y-3">{isOwner?<>{enrollments.length?enrollments.map((entry:any)=><div key={entry.id} className="rounded-lg border p-3"><p className="font-semibold">{entry.title}</p><p className="text-sm text-muted-foreground">{entry.subject}{entry.grade?" · Grade "+entry.grade:""}{entry.teacher_name?" · "+entry.teacher_name:""}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:Math.max(0,Math.min(100,Number(entry.progress_percent)||0))+"%"}}/></div><p className="mt-1 text-xs text-muted-foreground">{entry.progress_percent}% complete · Enrolled {entry.enrolled_at?new Date(entry.enrolled_at).toLocaleDateString():"date unavailable"}</p></div>):<p className="text-sm text-muted-foreground">No active class enrollments recorded.</p>}</>:<p className="text-sm text-muted-foreground">Enrollment details are private.</p>}</CardContent></Card>}
    {tab==="Achievements"&&<Card><CardHeader><CardTitle>Achievements</CardTitle></CardHeader><CardContent className="space-y-3">{achievements.length?achievements.map((entry:any)=><div key={entry.id} className="flex items-start gap-3 rounded-lg border p-3"><span className="text-2xl" aria-hidden="true">{entry.achievement?.icon||"🏆"}</span><div className="min-w-0 flex-1"><p className="font-semibold">{entry.achievement?.name||"Achievement"}</p><p className="text-sm text-muted-foreground">{entry.achievement?.description||"Achievement awarded on the platform."}</p>{isOwner&&entry.note&&<p className="mt-1 text-sm">{entry.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{entry.earnedAt?new Date(entry.earnedAt).toLocaleDateString(): "Award date unavailable"} · {entry.achievement?.pointsValue??0} points</p></div></div>):<p className="text-sm text-muted-foreground">No achievements recorded yet.</p>}</CardContent></Card>}
    {isOwner&&tab==="Reports"&&<Card><CardHeader><CardTitle>Approved reports</CardTitle></CardHeader><CardContent className="space-y-3">{approvedReports.length?approvedReports.map((report:any)=><div key={report.id} className="rounded-lg border p-3"><p className="font-semibold">{report.report_type==="attendance_register"?"Attendance register":"Term performance"} · {report.term_label}</p><p className="text-xs text-muted-foreground">Approved {report.reviewed_at?new Date(report.reviewed_at).toLocaleDateString():"date unavailable"}</p><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(report.draft_content?.commentary||report.draft_content?.records||report.draft_content?.factualRecords||"Approved report available",null,2)}</pre><Button onClick={()=>void (async()=>{try{const response=await fetch(getApiUrl("/api/academic-records/reports/drafts/"+report.id+"/download"),{headers});if(!response.ok)throw new Error("Report download is unavailable.");const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="dallyletter-report-"+report.id+".json";a.click();URL.revokeObjectURL(url);}catch(e){setMessage(e instanceof Error?e.message:"Could not download report.");}})()}>Download report</Button></div>):<p className="text-sm text-muted-foreground">No approved reports are available yet. Reports appear here after manager approval.</p>}</CardContent></Card>}
    {isOwner&&tab==="Attendance"&&<Card><CardHeader><CardTitle>Attendance history</CardTitle></CardHeader><CardContent className="space-y-3"><label className="block text-sm font-medium">Period<select className="ml-2 rounded-md border bg-background p-2" value={attendancePeriod} onChange={e=>setAttendancePeriod(e.target.value as typeof attendancePeriod)}><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Termly</option></select></label>{(()=>{const now=new Date();const start=new Date(now);if(attendancePeriod==="Daily")start.setHours(0,0,0,0);else if(attendancePeriod==="Weekly")start.setDate(now.getDate()-6);else if(attendancePeriod==="Monthly")start.setDate(now.getDate()-29);else {start.setTime(new Date(termStart+"T00:00:00").getTime());now.setTime(new Date(termEnd+"T23:59:59").getTime());}const rows=academicAttendance.filter((row:any)=>{const d=new Date(row.joined_at);return !Number.isNaN(d.getTime())&&d>=start&&d<=now;});return <>{attendancePeriod==="Termly"&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Term start date<input type="date" className="mt-1 block w-full rounded-md border bg-background p-2" value={termStart} onChange={e=>setTermStart(e.target.value)}/></label><label className="text-sm">Term end date<input type="date" className="mt-1 block w-full rounded-md border bg-background p-2" value={termEnd} onChange={e=>setTermEnd(e.target.value)}/></label></div>}<p className="text-sm text-muted-foreground">{attendancePeriod==="Termly"?"Termly configured date range":attendancePeriod} · {rows.length} saved records</p>{rows.length?rows.map((row:any,index:number)=><div key={String(row.class_id)+"-"+String(row.joined_at)+"-"+index} className="rounded-lg border p-3"><p className="font-medium">{row.joined_at?new Date(row.joined_at).toLocaleString():"Date unavailable"}</p><p className="text-sm text-muted-foreground">Class {row.class_id} · {row.status||"Not recorded"} · {row.is_late?"Late":"On time/not marked late"} · {row.duration_minutes??"—"} minutes</p></div>):<p className="text-sm text-muted-foreground">No saved attendance records found for this period. Attendance is not inferred or created by this view.</p>}</>})()}</CardContent></Card>}
    {isOwner&&tab==="Payments"&&<Card><CardHeader><CardTitle>Recorded school payments</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">These are ledger records, not payout preferences. A reported or pending payment is not proof that school fees have been cleared.</p>{paymentRecords.length?paymentRecords.map((payment:any)=><div key={payment.id} className="rounded-lg border p-3"><p className="font-semibold">{payment.month} {payment.year}</p><p className="text-sm">{payment.currency||"USD"} {Number(payment.amount||0).toFixed(2)} · {payment.status||"Not recorded"}</p><p className="text-xs text-muted-foreground">Recorded {payment.createdAt?new Date(payment.createdAt).toLocaleDateString():"date unavailable"} · {payment.notes||"No reference notes"}</p></div>):<p className="text-sm text-muted-foreground">No payment records are available for this account.</p>}</CardContent></Card>}
    {isOwner&&tab==="Transfer Letters"&&<Card><CardHeader><CardTitle>Transfer letters</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Requests require authorized manager review. Downloads are available only after approval.</p><label className="block text-sm font-medium">Reason<textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-2" value={transferReason} onChange={e=>setTransferReason(e.target.value)} maxLength={2000} placeholder="Explain why a transfer letter is needed"/></label><Button disabled={busy||transferReason.trim().length<3} onClick={()=>void (async()=>{setBusy(true);try{await request("/api/academic-records/transfer-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:transferReason.trim()})});setTransferReason("");setTransferRequests(await request("/api/academic-records/transfer-requests"));setMessage("Transfer letter request submitted for manager review.");}catch(e){setMessage(e instanceof Error?e.message:"Could not submit transfer request.");}finally{setBusy(false);}})()}>Request transfer letter</Button>{transferRequests.length?transferRequests.map((entry:any)=><div key={entry.id} className="rounded-lg border p-3"><p className="font-semibold">Request #{entry.id} · {entry.status}</p><p className="text-sm">{entry.reason}</p><p className="text-xs text-muted-foreground">{entry.created_at?new Date(entry.created_at).toLocaleDateString():"Date unavailable"}</p>{entry.status==="approved"&&<Button className="mt-2" onClick={()=>void (async()=>{try{const response=await fetch(getApiUrl("/api/academic-records/transfer-requests/"+entry.id+"/download"),{headers});if(!response.ok)throw new Error("Approved transfer letter could not be downloaded.");const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="dallyletter-transfer-letter-"+entry.id+".txt";a.click();URL.revokeObjectURL(url);}catch(e){setMessage(e instanceof Error?e.message:"Could not download transfer letter.");}})()}>Download approved letter</Button>}</div>):<p className="text-sm text-muted-foreground">No transfer requests recorded.</p>}</CardContent></Card>}
    <div ref={fullscreenContainerRef} role="dialog" aria-modal={fullscreenMedia?"true":undefined} aria-label="Fullscreen profile media" className="fixed inset-0 z-[99999] items-center justify-center bg-black" style={{display:fullscreenMedia?"flex":"none",position:"fixed",inset:0,width:"100vw",height:"100vh",background:"#000",padding:0,margin:0}} onClick={closeFullscreenMedia}>{fullscreenMedia&&<><button type="button" aria-label="Close fullscreen media" className="absolute right-4 top-4 z-10 rounded-full bg-white/20 px-4 py-2 text-white" onClick={e=>{e.stopPropagation();closeFullscreenMedia();}}>Close ✕</button><AuthenticatedProfileMedia url={fullscreenMedia.url} type={fullscreenMedia.type} alt="Fullscreen profile media" controls autoPlay className="h-full w-full object-contain" onError={()=>setFullscreenMediaError(true)} onClick={e=>e.stopPropagation()}/>{fullscreenMediaError&&<p role="alert" className="absolute bottom-6 left-4 right-4 rounded-lg bg-white/10 p-4 text-center text-sm text-white">This media could not be loaded from the API. The file may be missing or the current server may not support this profile-media route.</p>}</>}</div>
  </main></DashboardLayout>;
}
