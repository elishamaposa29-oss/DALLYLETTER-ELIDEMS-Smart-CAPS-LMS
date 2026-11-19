import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";

type Poll = { poll: { id:number; question:string; allowMultiple:boolean; closed:boolean }; options:Array<{id:number;label:string;voteCount:number;selected:boolean}>; totalVotes:number };
type Palette = { background:string; card:string; border:string; foreground:string; mutedForeground:string; primary:string };

export function StudyGroupPollPanel({ groupId, token, colors, allowPolls }: { groupId:number|null; token:string|null; colors:Palette; allowPolls?:boolean }) {
  const [polls,setPolls]=useState<Poll[]>([]);
  const [loading,setLoading]=useState(false);
  const [composer,setComposer]=useState(false);
  const [question,setQuestion]=useState("");
  const [optionsText,setOptionsText]=useState("Yes\nNo");
  const [error,setError]=useState("");
  const pollsEnabled=allowPolls !== false;

  const load=useCallback(async()=>{
    if(!groupId||!token||!pollsEnabled){setPolls([]);return;}
    setLoading(true);
    try{const r=await fetch(getApiUrl(`/api/chat/groups/${groupId}/polls`),{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});const data=await r.json().catch(()=>[]);if(!r.ok)throw new Error(data?.error||"Polls unavailable");setPolls(Array.isArray(data)?data:[]);setError("");}
    catch(e){setError(e instanceof Error?e.message:"Polls could not be loaded.");}
    finally{setLoading(false);}
  },[groupId,token,pollsEnabled]);

  useEffect(()=>{void load();if(!groupId||!token||!pollsEnabled)return;const timer=setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[load,groupId,token,pollsEnabled]);

  const create=async()=>{
    const options=optionsText.split("\n").map(x=>x.trim()).filter(Boolean);
    if(!groupId||!token||!question.trim()||options.length<2){setError("Enter a question and at least two options.");return;}
    try{const r=await fetch(getApiUrl(`/api/chat/groups/${groupId}/polls`),{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({question:question.trim(),options})});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||"Poll could not be created.");setQuestion("");setOptionsText("Yes\nNo");setComposer(false);await load();}
    catch(e){setError(e instanceof Error?e.message:"Poll could not be created.");}
  };

  const vote=async(poll:Poll,optionId:number)=>{
    if(!token)return;
    const selectedIds=poll.poll.allowMultiple?[...poll.options.filter(option=>option.selected&&option.id!==optionId).map(option=>option.id),...(poll.options.some(option=>option.id===optionId&&option.selected)?[]:[optionId])]:[optionId];
    try{const r=await fetch(getApiUrl(`/api/chat/polls/${poll.poll.id}/vote`),{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({optionIds:selectedIds})});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||"Vote not saved");await load();}
    catch(e){setError(e instanceof Error?e.message:"Vote could not be saved.");}
  };

  if(!groupId||!pollsEnabled)return null;
  return <View style={{borderTopWidth:1,borderTopColor:colors.border,paddingHorizontal:14,paddingVertical:10,gap:9,maxHeight:250}}>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
      <Text style={{fontSize:14,fontWeight:"900",color:colors.foreground}}>📊 Group polls</Text>
      <View style={{flexDirection:"row",gap:8}}>
        <TouchableOpacity onPress={()=>void load()} accessibilityLabel="Refresh polls"><Text style={{fontSize:12,color:colors.primary,fontWeight:"700"}}>Refresh</Text></TouchableOpacity>
        <TouchableOpacity onPress={()=>setComposer(v=>!v)}><Text style={{fontSize:12,color:colors.primary,fontWeight:"800"}}>{composer?"Close":"Create poll"}</Text></TouchableOpacity>
      </View>
    </View>
    {composer&&<View style={{gap:7,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:10}}>
      <TextInput value={question} onChangeText={setQuestion} placeholder="Ask your group a question" placeholderTextColor={colors.mutedForeground} style={{color:colors.foreground,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:9}}/>
      <TextInput value={optionsText} onChangeText={setOptionsText} multiline placeholder="One option per line" placeholderTextColor={colors.mutedForeground} style={{color:colors.foreground,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:9,minHeight:56}}/>
      <TouchableOpacity onPress={()=>void create()} style={{backgroundColor:colors.primary,padding:10,borderRadius:9,alignItems:"center"}}><Text style={{color:"#fff",fontWeight:"800"}}>Publish poll</Text></TouchableOpacity>
    </View>}
    {error!==""&&<Text accessibilityRole="alert" style={{color:"#B91C1C",fontSize:11}}>{error}</Text>}
    {loading&&polls.length===0?<ActivityIndicator color={colors.primary}/>:polls.length===0?<Text style={{fontSize:11,color:colors.mutedForeground}}>No polls yet. Create one to get the group involved.</Text>:<View style={{gap:8}}>{polls.map(item=><View key={item.poll.id} style={{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:10,gap:7}}>
      <View style={{flexDirection:"row",justifyContent:"space-between",gap:8}}><Text style={{fontWeight:"800",fontSize:13,color:colors.foreground,flex:1}}>{item.poll.question}</Text><Text style={{fontSize:10,color:colors.mutedForeground}}>{item.poll.closed?"Closed":"Active"}</Text></View>
      {item.options.map(option=><TouchableOpacity key={option.id} disabled={item.poll.closed} onPress={()=>void vote(item,option.id)} style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor:option.selected?colors.primary:colors.border,backgroundColor:colors.background,borderRadius:8,padding:9}}><Text style={{fontSize:12,color:colors.foreground,flex:1}}>{option.selected?"✓ ":""}{option.label}</Text><Text style={{fontSize:11,color:colors.mutedForeground}}>{option.voteCount}</Text></TouchableOpacity>)}
      <Text style={{fontSize:10,color:colors.mutedForeground}}>{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</Text>
    </View>)}</View>}
  </View>;
}
