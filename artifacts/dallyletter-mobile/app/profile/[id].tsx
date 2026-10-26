import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import { useLocalSearchParams, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Profile = {
  id: number; display_name: string; avatar: string | null; bio: string | null; role: string;
  grade?: string | null; is_prefect?: boolean; subjects?: string[]; subjects_to_teach?: string[];
  primary_subject?: string | null; verified_qualifications?: Array<{title:string;verified:boolean}>;
  leaderboard_position?: number | null; performance_score?: number; badge_count?: number; streak_days?: number;
  groups_joined?: Array<{id:number;name:string;subject:string}>; groups_owned?: Array<{id:number;name:string;subject:string}>;
  groups_with_settings_permission?: Array<{id:number;name:string;subject:string}>; fees_status?: string;
  achievement_count?: number; lesson_requests_count?: number;
};
export default function PublicProfilePreview() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{id:string}>();
  const { token } = useAuth();
  const [profile,setProfile] = useState<Profile|null>(null);
  const [achievements,setAchievements] = useState<any[]>([]);
  const [documents,setDocuments] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const headers: Record<string, string> = token ? { Authorization: "Bearer " + token } : {};
        const [p, a, d] = await Promise.all([
          fetch(getApiUrl("/api/users/"+encodeURIComponent(String(id))+"/public-profile"),{headers}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||"Could not load this profile.");return x;}),
          fetch(getApiUrl("/api/achievements/user/"+encodeURIComponent(String(id)),),{headers}).then(r=>r.ok?r.json():[]).catch(()=>[]),
          fetch(getApiUrl("/api/users/"+encodeURIComponent(String(id))+"/teacher-documents"),{headers}).then(r=>r.ok?r.json():[]).catch(()=>[]),
        ]);
        if(active){setProfile(p);setAchievements(Array.isArray(a)?a:[]);setDocuments(Array.isArray(d)?d:[]);}
      } catch(e) { if(active)setError(e instanceof Error?e.message:"Could not load this profile."); }
      finally { if(active)setLoading(false); }
    };
    if(id && token) void load(); else {setLoading(false);setError("Sign in to view profiles.");}
    return ()=>{active=false;};
  },[id,token]);
  const professional = ["teacher","manager","senior_manager"].includes(String(profile?.role||"").toLowerCase());
  const roleLabel = profile?.is_prefect ? "Prefect" : String(profile?.role||"").toLowerCase()==="student" ? "Learner" : profile?.role||"Profile";
  const s = StyleSheet.create({
    screen:{flex:1,backgroundColor:colors.background},
    header:{backgroundColor:colors.primary,paddingTop:insets.top+12,paddingHorizontal:18,paddingBottom:24},
    back:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:10,alignSelf:"flex-start"},
    backText:{fontSize:14,color:"#fff",fontWeight:"600"},
    identity:{flexDirection:"row",alignItems:"center",gap:14,marginTop:12},
    avatar:{width:92,height:92,borderRadius:46,backgroundColor:"rgba(255,255,255,0.16)",alignItems:"center",justifyContent:"center",overflow:"hidden",borderWidth:2,borderColor:"rgba(255,255,255,0.35)"},
    avatarImage:{width:"100%",height:"100%"},
    name:{fontSize:22,fontWeight:"800",color:"#fff",flexShrink:1},
    role:{fontSize:12,fontWeight:"700",letterSpacing:1,textTransform:"uppercase",color:"#fbbf24",marginBottom:4},
    bio:{fontSize:13,lineHeight:19,color:"rgba(255,255,255,0.78)",marginTop:14},
    content:{padding:16,paddingBottom:40,gap:12},
    card:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:14,padding:15,gap:8},
    title:{fontSize:15,fontWeight:"800",color:colors.foreground},
    text:{fontSize:13,lineHeight:19,color:colors.foreground},
    muted:{fontSize:12,lineHeight:18,color:colors.mutedForeground},
    chipRow:{flexDirection:"row",flexWrap:"wrap",gap:7},
    chip:{borderRadius:20,borderWidth:1,borderColor:colors.border,paddingHorizontal:10,paddingVertical:6},
    chipText:{fontSize:12,color:colors.foreground},
    error:{color:colors.destructive,fontSize:14},
  });
  const section = (title:string, body:React.ReactNode) => <View style={s.card}><Text style={s.title}>{title}</Text>{body}</View>;
  if(loading)return <View style={[s.screen,{alignItems:"center",justifyContent:"center"}]}><ActivityIndicator size="large" color={colors.primary}/><Text style={[s.muted,{marginTop:10}]}>Loading profile…</Text></View>;
  if(error||!profile)return <View style={[s.screen,{padding:20,paddingTop:insets.top+20,gap:14}]}><TouchableOpacity onPress={()=>router.back()} style={s.back}><Feather name="arrow-left" size={20} color={colors.foreground}/><Text style={[s.backText,{color:colors.foreground}]}>Back</Text></TouchableOpacity><Text style={s.error}>{error||"Profile unavailable."}</Text></View>;
  return <View style={s.screen}><ScrollView>
    <View style={s.header}><TouchableOpacity onPress={()=>router.back()} style={s.back}><Feather name="arrow-left" size={20} color="#fff"/><Text style={s.backText}>Back</Text></TouchableOpacity>
      <View style={s.identity}><View style={s.avatar}>{profile.avatar?<Image source={{uri:/^https:\/\//i.test(profile.avatar)?profile.avatar:getApiUrl(profile.avatar),headers:token?{Authorization:"Bearer "+token}:{}}} style={s.avatarImage} resizeMode="cover"/>:<Feather name="user" size={42} color="#fff"/>}</View><View style={{flex:1}}><Text style={s.role}>{roleLabel}</Text><Text style={s.name}>{profile.display_name}</Text>{profile.grade?<Text style={s.muted}>Grade {profile.grade}</Text>:null}</View></View>{profile.bio?<Text style={s.bio}>{profile.bio}</Text>:null}
    </View>
    <View style={s.content}>
      {section("Subjects",<View style={s.chipRow}>{(profile.subjects||profile.subjects_to_teach||[]).length?(profile.subjects||profile.subjects_to_teach||[]).map(subject=><View key={subject} style={s.chip}><Text style={s.chipText}>{subject}{profile.primary_subject===subject?" · Primary":""}</Text></View>):<Text style={s.muted}>No subjects listed.</Text>}</View>)}
      {professional ? section("Qualifications & certificates",<><View style={{gap:8}}>{(profile.verified_qualifications||[]).length?profile.verified_qualifications!.map((q,index)=><Text key={q.title+index} style={s.text}>✓ {q.title}</Text>):<Text style={s.muted}>No verified qualifications listed.</Text>}</View>{documents.filter(d=>d.document_type==="certificate").map((d:any)=><Text key={d.id} style={s.text}>📄 {d.file_name}</Text>)}</>) : <>
        {section("Learning profile",<><Text style={s.text}>School fees: {profile.fees_status==="paid"?"Paid":profile.fees_status==="overdue"?"Overdue":profile.fees_status==="pending"?"Pending":"Not recorded"}</Text><Text style={s.text}>Leaderboard position: {profile.leaderboard_position?"#"+profile.leaderboard_position:"Not ranked"}</Text><Text style={s.text}>Achievements awarded: {profile.achievement_count??achievements.length}</Text><Text style={s.text}>Performance points: {profile.performance_score??0} · Badges: {profile.badge_count??0} · Streak: {profile.streak_days??0} days</Text></>)}
        {section("Groups joined",<View style={{gap:6}}>{(profile.groups_joined||[]).length?profile.groups_joined!.map(g=><Text key={g.id} style={s.text}>{g.name} · {g.subject}</Text>):<Text style={s.muted}>No groups recorded.</Text>}</View>)}
        {profile.is_prefect?section("Prefect activity",<><Text style={s.text}>Groups owned: {(profile.groups_owned||[]).map(g=>g.name).join(", ")||"None recorded"}</Text><Text style={s.text}>Groups with settings permission: {(profile.groups_with_settings_permission||[]).map(g=>g.name).join(", ")||"None recorded"}</Text><Text style={s.text}>Lesson requests: {profile.lesson_requests_count??0}</Text></>):null}
      </>}
      {section("Achievements",<View style={{gap:8}}>{achievements.length?achievements.map((a:any)=><View key={a.id} style={{gap:2}}><Text style={s.text}>{a.achievement?.icon||"🏆"} {a.achievement?.name||"Achievement"}</Text><Text style={s.muted}>{a.achievement?.description||""}</Text></View>):<Text style={s.muted}>No achievements recorded.</Text>}</View>)}
    </View>
  </ScrollView></View>;
}
