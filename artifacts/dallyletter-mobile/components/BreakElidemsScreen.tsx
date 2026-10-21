import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Volunteer={id:number;userId:number;userName:string;role:string;isSelected:boolean;details?:string|null};
type EventRow={id:number;title:string;description?:string|null;eventDate:string;startTime:string;endTime:string;meetLink?:string|null;status:string;volunteers?:Volunteer[]};
export default function BreakElidemsScreen(){
 const colors=useColors(),insets=useSafeAreaInsets();
 const {user,token}=useAuth();
 const role=String(user?.role||"").toLowerCase().replace(/[ -]+/g,"_");
 const isOwner=role==="owner";
 const canVolunteer=role==="teacher"||Boolean((user as any)?.isPrefect);
 const [events,setEvents]=useState<EventRow[]>([]),[today,setToday]=useState<EventRow|null>(null),[selected,setSelected]=useState<EventRow|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[eventDate,setEventDate]=useState(new Date().toISOString().slice(0,10)),[startTime,setStartTime]=useState("10:00"),[endTime,setEndTime]=useState("12:00"),[meetLink,setMeetLink]=useState("");
 const [volunteerDetails,setVolunteerDetails]=useState("");
 const request=useCallback(async(path:string,init:RequestInit={})=>{
  const headers=new Headers(init.headers);if(token)headers.set("Authorization","Bearer "+token);
  if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const response=await fetch(getApiUrl(path),{...init,headers});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(body?.error||`Request failed (${response.status})`);
  return body;
 },[token]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{const [all,now]=await Promise.all([request("/api/break-elidems"),request("/api/break-elidems/today")]);setEvents(Array.isArray(all)?all:[]);setToday(now||null);}
  catch(e){setError(e instanceof Error?e.message:"Could not load BREAK-ELIDEMS.");}
  finally{setLoading(false);}
 },[request]);
 useEffect(()=>{void load();},[load]);
 const act=async(fn:()=>Promise<unknown>,message:string)=>{setBusy(true);setError("");try{await fn();Alert.alert("BREAK-ELIDEMS",message);await load();if(selected)await openEvent(selected.id);}catch(e){setError(e instanceof Error?e.message:"Action failed.");}finally{setBusy(false);}};
 const openEvent=async(id:number)=>{try{setSelected(await request(`/api/break-elidems/${id}`));}catch(e){setError(e instanceof Error?e.message:"Could not load event volunteers.");}};
 const createEvent=()=>act(async()=>{
  if(!title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||!startTime.trim()||!endTime.trim())throw new Error("Enter a title, date (YYYY-MM-DD), start time and end time.");
  await request("/api/break-elidems",{method:"POST",body:JSON.stringify({title:title.trim(),description:description.trim(),eventDate,startTime,endTime,meetLink:meetLink.trim()||null})});
  setTitle("");setDescription("");setMeetLink("");
 },"Event scheduled and notification queued for the community.");
 const volunteer=(event:EventRow)=>act(async()=>{await request(`/api/break-elidems/${event.id}/volunteer`,{method:"POST",body:JSON.stringify({details:volunteerDetails.trim()})});setVolunteerDetails("");},"Your volunteer request was sent to the owner.");
 const setStatus=(event:EventRow,status:string)=>act(()=>request(`/api/break-elidems/${event.id}`,{method:"PATCH",body:JSON.stringify({status})}),status==="active"?"Event is live; a notification was queued.":status==="ended"?"Event marked as ended.":"Event status updated.");
 const deleteEvent=(event:EventRow)=>Alert.alert("Delete event?",`Delete “${event.title}”? This cannot be undone.`,[{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>void act(()=>request(`/api/break-elidems/${event.id}`,{method:"DELETE"}),"Event deleted.")}]);
 const toggleVolunteer=(v:Volunteer)=>act(()=>request(`/api/break-elidems/${selected?.id}/volunteers/${v.id}`,{method:"PATCH",body:JSON.stringify({isSelected:!v.isSelected})}),v.isSelected?"Volunteer unselected.":"Volunteer selected.");
 const s=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},header:{backgroundColor:colors.primary,paddingTop:insets.top+14,paddingHorizontal:18,paddingBottom:18},title:{fontSize:22,fontFamily:"Inter_700Bold",color:"#fff"},subtitle:{fontSize:12,color:"rgba(255,255,255,.78)",marginTop:5},
  content:{padding:14,paddingBottom:120,gap:10},card:{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:14,gap:8},row:{flexDirection:"row",alignItems:"center",gap:8},heading:{fontSize:16,fontFamily:"Inter_700Bold",color:colors.foreground},body:{fontSize:13,color:colors.foreground,lineHeight:19},muted:{fontSize:12,color:colors.mutedForeground,lineHeight:17},input:{minHeight:43,padding:10,borderWidth:1,borderColor:colors.border,borderRadius:8,color:colors.foreground,backgroundColor:colors.background},button:{minHeight:40,paddingHorizontal:12,paddingVertical:9,borderRadius:8,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"},buttonText:{fontSize:12,color:"#fff",fontWeight:"700"},chip:{padding:8,borderRadius:7,borderWidth:1,borderColor:colors.border},
 });
 const eventCard=(event:EventRow)=> <View key={event.id} style={s.card}>
  <View style={[s.row,{justifyContent:"space-between"}]}><View style={{flex:1}}><Text style={s.heading}>{event.title}</Text><Text style={s.muted}>{event.eventDate} · {event.startTime}–{event.endTime}</Text></View><Text style={{fontSize:11,fontWeight:"700",color:event.status==="active"?"#15803d":event.status==="ended"?"#64748b":"#a16207"}}>{event.status.toUpperCase()}</Text></View>
  {event.description?<Text style={s.body}>{event.description}</Text>:null}
  <View style={[s.row,{flexWrap:"wrap"}]}>{event.meetLink&&event.status==="active"?<TouchableOpacity style={[s.button,{flex:1,backgroundColor:"#15803d"}]} onPress={()=>void Linking.openURL(event.meetLink!)}><Text style={s.buttonText}>Join live session</Text></TouchableOpacity>:null}
   {canVolunteer&&event.status!=="ended"&&<TouchableOpacity style={[s.button,{flex:1,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border}]} onPress={()=>void volunteer(event)}><Text style={[s.buttonText,{color:colors.foreground}]}>Volunteer</Text></TouchableOpacity>}
   {isOwner?<><TouchableOpacity style={s.button} onPress={()=>void openEvent(event.id)}><Text style={s.buttonText}>Volunteers</Text></TouchableOpacity>{event.status==="scheduled"?<TouchableOpacity style={[s.button,{backgroundColor:"#15803d"}]} onPress={()=>void setStatus(event,"active")}><Text style={s.buttonText}>Go live</Text></TouchableOpacity>:null}{event.status==="active"?<TouchableOpacity style={[s.button,{backgroundColor:"#475569"}]} onPress={()=>void setStatus(event,"ended")}><Text style={s.buttonText}>End event</Text></TouchableOpacity>:null}<TouchableOpacity style={[s.button,{backgroundColor:"#b91c1c"}]} onPress={()=>deleteEvent(event)}><Text style={s.buttonText}>Delete</Text></TouchableOpacity></>:null}
  </View>
 </View>;
 const upcoming=events.filter(e=>e.status==="scheduled"&&e.id!==today?.id);
 return <View style={s.root}><View style={s.header}><Text style={s.title}>BREAK-ELIDEMS</Text><Text style={s.subtitle}>Community learning sessions, live events and volunteering</Text></View>
  <ScrollView contentContainerStyle={s.content}>
   <TouchableOpacity style={[s.row,{alignSelf:"flex-start"}]} onPress={()=>void load()}><Feather name="refresh-cw" size={15} color={colors.primary}/><Text style={{color:colors.primary,fontSize:12,fontWeight:"600"}}>Refresh events</Text></TouchableOpacity>
   {error?<View style={[s.card,{borderColor:"#b91c1c"}]}><Text style={{color:"#b91c1c",fontWeight:"700"}}>{error}</Text></View>:null}
   {loading?<View style={[s.row,{justifyContent:"center",padding:20}]}><ActivityIndicator color={colors.primary}/><Text style={s.body}>Loading events…</Text></View>:null}
   {isOwner?<View style={s.card}><Text style={s.heading}>Schedule a community event</Text><TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.mutedForeground}/><TextInput style={[s.input,{minHeight:70}]} multiline value={description} onChangeText={setDescription} placeholder="Description and learning topic" placeholderTextColor={colors.mutedForeground}/><TextInput style={s.input} value={eventDate} onChangeText={setEventDate} placeholder="Date YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}/><View style={s.row}><TextInput style={[s.input,{flex:1}]} value={startTime} onChangeText={setStartTime} placeholder="Start HH:MM" placeholderTextColor={colors.mutedForeground}/><TextInput style={[s.input,{flex:1}]} value={endTime} onChangeText={setEndTime} placeholder="End HH:MM" placeholderTextColor={colors.mutedForeground}/></View><TextInput style={s.input} value={meetLink} onChangeText={setMeetLink} placeholder="Meeting URL (optional)" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={s.button} onPress={()=>void createEvent()} disabled={busy}><Text style={s.buttonText}>{busy?"Saving…":"Schedule and notify users"}</Text></TouchableOpacity></View>:null}
   {today?<><Text style={s.heading}>Today’s event</Text>{eventCard(today)}{canVolunteer&&today.status!=="ended"?<View style={s.card}><Text style={s.heading}>Volunteer note</Text><TextInput style={s.input} value={volunteerDetails} onChangeText={setVolunteerDetails} placeholder="How would you like to help?" placeholderTextColor={colors.mutedForeground}/><TouchableOpacity style={s.button} onPress={()=>void volunteer(today)} disabled={busy}><Text style={s.buttonText}>Send volunteer request</Text></TouchableOpacity></View>:null}</>:<View style={s.card}><Text style={s.heading}>No event scheduled for today</Text><Text style={s.muted}>Check upcoming community sessions below.</Text></View>}
   <Text style={s.heading}>Upcoming events</Text>{upcoming.length?upcoming.map(eventCard):<Text style={s.muted}>No upcoming events have been scheduled.</Text>}
   {selected&&isOwner?<View style={s.card}><View style={[s.row,{justifyContent:"space-between"}]}><Text style={s.heading}>Volunteers · {selected.title}</Text><TouchableOpacity onPress={()=>setSelected(null)}><Feather name="x" size={18} color={colors.mutedForeground}/></TouchableOpacity></View>{(selected.volunteers||[]).length?selected.volunteers!.map(v=><View key={v.id} style={[s.row,{justifyContent:"space-between",paddingVertical:6,borderBottomWidth:1,borderBottomColor:colors.border}]}><View style={{flex:1}}><Text style={s.body}>{v.userName} · {v.role}</Text><Text style={s.muted}>{v.details||"No note"}</Text></View><TouchableOpacity style={[s.chip,{backgroundColor:v.isSelected?"#dcfce7":colors.card}]} onPress={()=>void toggleVolunteer(v)} disabled={busy}><Text style={{fontSize:11,color:v.isSelected?"#166534":colors.foreground}}>{v.isSelected?"Selected":"Select"}</Text></TouchableOpacity></View>):<Text style={s.muted}>No volunteer requests yet.</Text>}</View>:null}
  </ScrollView></View>;
}
