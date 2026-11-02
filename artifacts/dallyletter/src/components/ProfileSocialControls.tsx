import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { MessageCircle, Users, ShieldCheck, Save, Check, UserPlus } from "lucide-react";

type PrivacyMode = "me_only_authorized" | "selected_friends" | "everyone";
type SectionSetting = { mode: PrivacyMode; selectedUserIds: number[] };
type Friend = { id: number; name: string; role: string };
type RequestRow = { id: number; requester_id: number; requester_name: string; requester_role: string; created_at: string };

const sections = [
  ["overview","Profile overview"],["qualifications","Qualifications / CV"],["subjects","Subjects"],["enrollments","Enrollments / classes"],
  ["achievements","Achievements"],["reports","Academic reports"],["attendance","Attendance"],["register","Attendance register"],
  ["payments","Payments / fee status"],["transfers","Transfer letters"],["teacher_documents","Teacher documents"],
  ["groups","Groups"],["activity","Activity summary"],
] as const;

function authHeaders(): Record<string,string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") : null;
  return token ? { Authorization: "Bearer " + token } : {};
}
async function api<T=any>(path:string, init:RequestInit={}):Promise<T> {
  const response=await fetch(getApiUrl(path),{...init,headers:{...authHeaders(),...(init.headers as Record<string,string>||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"The Profile Hub action could not be completed.");
  return data as T;
}

export function ProfileSocialControls({profileId,isSelf,role}:{profileId:number|undefined;isSelf:boolean;role?:string}) {
  const [,setLocation]=useLocation();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [social,setSocial]=useState<any>(null);
  const [friends,setFriends]=useState<Friend[]>([]);
  const [requests,setRequests]=useState<RequestRow[]>([]);
  const [settings,setSettings]=useState<Record<string,SectionSetting>>({});
  const [chatPrivacy,setChatPrivacy]=useState<"everyone"|"approval_required">("everyone");

  const load=async()=>{
    if(!profileId)return;
    try{
      const data=await api<any>("/api/profile/"+profileId+"/social");
      setSocial(data);
      if(isSelf){
        const [friendRows,requestRows]=await Promise.all([
          api<Friend[]>("/api/profile/connections/friends"),
          api<RequestRow[]>("/api/profile/connections/requests"),
        ]);
        setFriends(friendRows);setRequests(requestRows);
        const next:Record<string,SectionSetting>={};
        for(const [key] of sections){
          const saved=data.privacy?.[key];
          next[key]={mode:saved?.mode||"everyone",selectedUserIds:Array.isArray(saved?.selectedUserIds)?saved.selectedUserIds.map(Number):[]};
        }
        setSettings(next);setChatPrivacy(data.chatPrivacy==="approval_required"?"approval_required":"everyone");
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not load connections and privacy.");}
  };
  useEffect(()=>{void load();},[profileId,isSelf]);

  const chatPath=useMemo(()=>{
    const normalized=String(role||"").toLowerCase().replace(/[ -]+/g,"_");
    if(["owner","admin","platform_owner"].includes(normalized))return "/admin/chat";
    if(["manager","senior_manager","junior_manager"].includes(normalized))return "/manager/chat";
    if(normalized==="teacher")return "/teacher/chat";
    return "/student/chat";
  },[role]);

  const connectOrChat=async()=>{
    if(!profileId)return;
    setBusy(true);setError("");setNotice("");
    try{
      const current=await api<any>("/api/profile/"+profileId+"/social");
      setSocial(current);
      if(current.chatPrivacy==="approval_required"&&current.connection?.status!=="accepted"){
        if(current.connection?.status==="pending"&&current.connection?.requestedByMe){setNotice("Your connection request is awaiting a response.");return;}
        if(current.connection?.status==="pending"&&!current.connection?.requestedByMe){setNotice("This user has already requested to connect. Open your own Profile Hub to accept or reject the request.");setLocation("/profile-hub");return;}
        await api("/api/profile/"+profileId+"/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
        setNotice("Connection request sent. Both users have been notified; chat unlocks after acceptance.");
        await load();
      }else if(current.canChat){
        setLocation(chatPath+"?recipientId="+encodeURIComponent(String(profileId)));
      }else{
        setError("The existing school chat permissions do not allow this conversation.");
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not connect or open chat.");}
    finally{setBusy(false);}
  };

  const save=async()=>{
    setBusy(true);setError("");setNotice("");
    try{
      const result=await api<any>("/api/profile/me/privacy",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({sectionSettings:settings,chatPrivacy})});
      setSettings(result.sectionSettings);setChatPrivacy(result.chatPrivacy);setNotice("Your independent section privacy settings have been saved.");
    }catch(e){setError(e instanceof Error?e.message:"Privacy settings could not be saved.");}
    finally{setBusy(false);}
  };

  const decide=async(id:number,status:"accepted"|"rejected")=>{
    setBusy(true);setError("");
    try{await api("/api/profile/connections/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});await load();setNotice(status==="accepted"?"Connection accepted. Existing private chat is now available.":"Connection request rejected.");}
    catch(e){setError(e instanceof Error?e.message:"Could not update connection request.");}
    finally{setBusy(false);}
  };

  if(!profileId)return null;
  return <>
    {!isSelf&&<button type="button" onClick={()=>void connectOrChat()} disabled={busy} aria-label="Connect or open private chat" title="Connect / Chat" className="fixed bottom-6 right-5 z-[80] grid h-14 w-14 place-items-center rounded-full border-2 border-[#b38b00] bg-[#0f2a5a] text-white shadow-xl transition hover:scale-105 disabled:opacity-60">
      {social?.chatPrivacy==="approval_required"&&social?.connection?.status!=="accepted"?<UserPlus className="h-6 w-6"/>:<MessageCircle className="h-6 w-6"/>}
    </button>}
    {!isSelf&&(error||notice)&&<div role={error?"alert":"status"} className="fixed bottom-24 right-5 z-[80] max-w-[min(90vw,360px)] rounded-lg border bg-background p-3 text-sm shadow-lg">{error||notice}</div>}
    {isSelf&&<div className="mt-5 rounded-xl border border-[#b38b00]/40 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-bold text-[#0f2a5a]">Profile privacy & connections</h3><p className="text-xs text-muted-foreground">Each section has its own visibility rule. Institutional access is not controlled by learner privacy choices.</p></div>
        <button type="button" onClick={()=>setOpen(v=>!v)} className="rounded-lg border px-3 py-2 text-sm font-semibold">{open?"Close settings":"Manage privacy"}</button>
      </div>
      {open&&<div className="mt-4 space-y-4">
        <section className="rounded-lg border p-3">
          <h4 className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>Private chat access</h4>
          <select value={chatPrivacy} onChange={e=>setChatPrivacy(e.target.value as any)} className="w-full rounded-md border bg-background p-2 text-sm">
            <option value="everyone">Everyone allowed by existing school chat rules</option>
            <option value="approval_required">Approved connections only (request required)</option>
          </select>
        </section>
        <section className="space-y-3">
          <h4 className="font-semibold">Independent section visibility</h4>
          {sections.map(([key,label])=><div key={key} className="rounded-lg border p-3">
            <label className="mb-2 block text-sm font-semibold">{label}</label>
            <select value={settings[key]?.mode||"everyone"} onChange={e=>setSettings(v=>({...v,[key]:{...(v[key]||{selectedUserIds:[]}),mode:e.target.value as PrivacyMode}}))} className="w-full rounded-md border bg-background p-2 text-sm">
              <option value="me_only_authorized">Me only and authorized institutional staff</option>
              <option value="selected_friends">Selected approved friends</option>
              <option value="everyone">Everyone</option>
            </select>
            {settings[key]?.mode==="selected_friends"&&<div className="mt-2 space-y-2 rounded-md bg-muted/30 p-2">
              {friends.length?friends.map(friend=><label key={friend.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings[key]?.selectedUserIds.includes(friend.id)||false} onChange={e=>setSettings(v=>({...v,[key]:{...v[key],selectedUserIds:e.target.checked?[...(v[key]?.selectedUserIds||[]),friend.id]:(v[key]?.selectedUserIds||[]).filter(id=>id!==friend.id)}}))}/>
                {friend.name} <span className="text-xs text-muted-foreground">({friend.role})</span>
              </label>):<p className="text-xs text-muted-foreground">No approved connections yet.</p>}
            </div>}
          </div>)}
        </section>
        <button type="button" disabled={busy} onClick={()=>void save()} className="inline-flex items-center gap-2 rounded-lg bg-[#0f2a5a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Save all privacy settings</button>
        <section className="rounded-lg border p-3">
          <h4 className="mb-2 flex items-center gap-2 font-semibold"><Users className="h-4 w-4"/>Pending connection requests</h4>
          {requests.length?requests.map(request=><div key={request.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 first:border-0">
            <div><p className="text-sm font-semibold">{request.requester_name}</p><p className="text-xs text-muted-foreground">{request.requester_role} · {new Date(request.created_at).toLocaleString()}</p></div>
            <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void decide(request.id,"accepted")} className="rounded-md bg-[#0f2a5a] px-3 py-1.5 text-xs font-bold text-white"><Check className="mr-1 inline h-3 w-3"/>Accept</button><button type="button" disabled={busy} onClick={()=>void decide(request.id,"rejected")} className="rounded-md border px-3 py-1.5 text-xs font-semibold">Reject</button></div>
          </div>):<p className="text-sm text-muted-foreground">No pending requests.</p>}
        </section>
      </div>}
      {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {notice&&<p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
    </div>}
  </>;
}
