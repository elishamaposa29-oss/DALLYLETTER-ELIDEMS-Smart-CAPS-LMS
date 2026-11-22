import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { UserProfileLink } from "@/components/UserProfileLink";

type Mark = { isCorrect?:boolean; correctLabel?:string|null; correctOptionId?:number|null };
type Poll = {
  poll:{id:number;question:string;allowMultiple:boolean;closed:boolean;autoMark?:boolean;correctOptionId?:number|null};
  options:Array<{id:number;label:string;voteCount:number;selected:boolean}>;
  totalVotes:number;
  myMark?:Mark|null;
};
type LeaderboardEntry = {rank:number;userId:number|null;name:string;avatarUrl:string|null;answers:string[]};
type Palette = { background:string; card:string; border:string; foreground:string; mutedForeground:string; primary:string };

export function StudyGroupPollPanel({ groupId, token, colors, allowPolls }: { groupId:number|null; token:string|null; colors:Palette; allowPolls?:boolean }) {
  const [polls,setPolls]=useState<Poll[]>([]);
  const [loading,setLoading]=useState(false);
  const [composer,setComposer]=useState(false);
  const [question,setQuestion]=useState("");
  const [optionsText,setOptionsText]=useState("Yes\nNo");
  const [autoMark,setAutoMark]=useState(false);
  const [correctOptionIndex,setCorrectOptionIndex]=useState(0);
  const [marks,setMarks]=useState<Record<number,Mark>>({});
  const [selectedAnswers,setSelectedAnswers]=useState<Record<number,number>>({});
  const [leaderboardOpenId,setLeaderboardOpenId]=useState<number|null>(null);
  const [leaderboards,setLeaderboards]=useState<Record<number,LeaderboardEntry[]>>({});
  const [leaderboardLoadingId,setLeaderboardLoadingId]=useState<number|null>(null);
  const [error,setError]=useState("");
  const pollsEnabled=allowPolls !== false;
  const optionChoices=optionsText.split("\n").map(x=>x.trim()).filter(Boolean);

  const load=useCallback(async()=>{
    if(!groupId||!token||!pollsEnabled){setPolls([]);return;}
    setLoading(true);
    try{
      const r=await fetch(getApiUrl("/api/chat/groups/"+groupId+"/polls"),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      const data=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error(data?.error||"Polls unavailable");
      setPolls(Array.isArray(data)?data:[]);
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Polls could not be loaded.");}
    finally{setLoading(false);}
  },[groupId,token,pollsEnabled]);

  useEffect(()=>{void load();if(!groupId||!token||!pollsEnabled)return;const timer=setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[load,groupId,token,pollsEnabled]);

  const create=async()=>{
    if(!groupId||!token||!question.trim()||optionChoices.length<2){setError("Enter a question and at least two options.");return;}
    if(autoMark&&correctOptionIndex>=optionChoices.length){setError("Choose the correct answer before publishing.");return;}
    try{
      const r=await fetch(getApiUrl("/api/chat/groups/"+groupId+"/polls"),{
        method:"POST",
        headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({question:question.trim(),options:optionChoices,autoMark,correctOption:autoMark?optionChoices[correctOptionIndex]:undefined})
      });
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(data?.error||"Poll could not be created.");
      setQuestion("");setOptionsText("Yes\nNo");setAutoMark(false);setCorrectOptionIndex(0);setComposer(false);await load();
    }catch(e){setError(e instanceof Error?e.message:"Poll could not be created.");}
  };

  const vote=async(poll:Poll,optionId:number)=>{
    if(!token)return;
    const selectedIds=poll.poll.allowMultiple
      ? [...poll.options.filter(option=>option.selected&&option.id!==optionId).map(option=>option.id),...(poll.options.some(option=>option.id===optionId&&option.selected)?[]:[optionId])]
      : [optionId];
    if(selectedIds.length===0)return;
    try{
      const r=await fetch(getApiUrl("/api/chat/polls/"+poll.poll.id+"/vote"),{
        method:"POST",
        headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({optionIds:selectedIds})
      });
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(data?.error||"Vote not saved");
      if(data?.isCorrect!==undefined){
        setMarks(current=>({...current,[poll.poll.id]:data}));
        setSelectedAnswers(current=>({...current,[poll.poll.id]:optionId}));
        try{Vibration.vibrate(data.isCorrect?[45,35,70]:[110,45,110]);}catch{/* Haptics are optional on unsupported devices. */}
      }
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Vote could not be saved.");}
  };

  const toggleLeaderboard=async(pollId:number)=>{
    if(leaderboardOpenId===pollId){setLeaderboardOpenId(null);return;}
    setLeaderboardOpenId(pollId);
    setLeaderboardLoadingId(pollId);
    try{
      const r=await fetch(getApiUrl("/api/chat/polls/"+pollId+"/leaderboard"),{headers:{Authorization:"Bearer "+(token||"")},cache:"no-store"});
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(data?.error||"Leaderboard could not be loaded.");
      setLeaderboards(current=>({...current,[pollId]:Array.isArray(data?.entries)?data.entries:[]}));
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Leaderboard could not be loaded.");}
    finally{setLeaderboardLoadingId(null);}
  };

  if(!groupId||!pollsEnabled)return null;
  return <View style={{borderTopWidth:1,borderTopColor:colors.border,paddingHorizontal:14,paddingVertical:10,gap:9,maxHeight:420}}>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
      <Text style={{fontSize:14,fontWeight:"900",color:colors.foreground}}>📊 Group polls</Text>
      <View style={{flexDirection:"row",gap:8}}>
        <TouchableOpacity onPress={()=>void load()} accessibilityLabel="Refresh polls"><Text style={{fontSize:12,color:colors.primary,fontWeight:"700"}}>Refresh</Text></TouchableOpacity>
        <TouchableOpacity onPress={()=>setComposer(v=>!v)}><Text style={{fontSize:12,color:colors.primary,fontWeight:"800"}}>{composer?"Close":"Create poll"}</Text></TouchableOpacity>
      </View>
    </View>
    {composer&&<View style={{gap:7,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:10}}>
      <TextInput value={question} onChangeText={setQuestion} placeholder="Ask your group a question" placeholderTextColor={colors.mutedForeground} style={{color:colors.foreground,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:9}}/>
      <TextInput value={optionsText} onChangeText={value=>{setOptionsText(value);setCorrectOptionIndex(0);}} multiline placeholder="One option per line" placeholderTextColor={colors.mutedForeground} style={{color:colors.foreground,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:9,minHeight:56}}/>
      <TouchableOpacity onPress={()=>setAutoMark(value=>!value)} style={{borderWidth:1,borderColor:autoMark?"#15803D":colors.border,borderRadius:8,padding:9}}>
        <Text style={{fontSize:12,fontWeight:"800",color:autoMark?"#15803D":colors.foreground}}>{autoMark?"✓ Automatic marking enabled":"Enable automatic marking"}</Text>
      </TouchableOpacity>
      {autoMark&&<View style={{gap:5}}><Text style={{fontSize:11,color:colors.mutedForeground}}>Tap the correct answer:</Text>{optionChoices.map((option,index)=><TouchableOpacity key={index+"-"+option} onPress={()=>setCorrectOptionIndex(index)} style={{borderWidth:1,borderColor:correctOptionIndex===index?"#15803D":colors.border,backgroundColor:correctOptionIndex===index?"#DCFCE7":colors.card,borderRadius:8,padding:8}}><Text style={{fontSize:12,color:correctOptionIndex===index?"#166534":colors.foreground,fontWeight:correctOptionIndex===index?"800":"500"}}>{correctOptionIndex===index?"✓ ":""}{option}</Text></TouchableOpacity>)}</View>}
      <TouchableOpacity onPress={()=>void create()} style={{backgroundColor:colors.primary,padding:10,borderRadius:9,alignItems:"center"}}><Text style={{color:"#fff",fontWeight:"800"}}>Publish poll</Text></TouchableOpacity>
    </View>}
    {error!==""&&<Text accessibilityRole="alert" style={{color:"#B91C1C",fontSize:11}}>{error}</Text>}
    {loading&&polls.length===0?<ActivityIndicator color={colors.primary}/>:polls.length===0?<Text style={{fontSize:11,color:colors.mutedForeground}}>No polls yet. Create one to get the group involved.</Text>:<ScrollView style={{maxHeight:320}} nestedScrollEnabled contentContainerStyle={{gap:8}}>{polls.map(item=>{
      const feedback=marks[item.poll.id]??item.myMark??null;
      const selectedId=selectedAnswers[item.poll.id]??item.options.find(option=>option.selected)?.id;
      const correctOptionId=feedback?.correctOptionId??item.poll.correctOptionId;
      const showMark=feedback?.isCorrect!==undefined||(Boolean(item.poll.autoMark)&&correctOptionId!=null&&selectedId!=null);
      const isCorrect=feedback?.isCorrect??selectedId===correctOptionId;
      const entries=leaderboards[item.poll.id]||[];
      return <View key={item.poll.id} style={{backgroundColor:colors.card,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:10,gap:7}}>
        <View style={{flexDirection:"row",justifyContent:"space-between",gap:8}}><Text style={{fontWeight:"800",fontSize:13,color:colors.foreground,flex:1}}>{item.poll.question}</Text><Text style={{fontSize:10,color:colors.mutedForeground}}>{item.poll.closed?"Closed":"Active"}</Text></View>
        {item.options.map(option=>{
          const isSelected=option.selected||selectedId===option.id;
          const isCorrectAnswer=Boolean(item.poll.autoMark)&&showMark&&correctOptionId===option.id;
          const isWrongSelected=Boolean(item.poll.autoMark)&&isSelected&&feedback?.isCorrect===false;
          const isCorrectSelected=Boolean(item.poll.autoMark)&&isSelected&&feedback?.isCorrect===true;
          const borderColor=isCorrectAnswer||isCorrectSelected?"#16A34A":isWrongSelected?"#DC2626":isSelected?colors.primary:colors.border;
          const backgroundColor=isCorrectAnswer||isCorrectSelected?"#DCFCE7":isWrongSelected?"#FEE2E2":colors.background;
          const answerColor=isCorrectAnswer||isCorrectSelected?"#166534":isWrongSelected?"#991B1B":colors.foreground;
          return <TouchableOpacity key={option.id} disabled={item.poll.closed} onPress={()=>void vote(item,option.id)} style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor,backgroundColor,borderRadius:8,padding:9}}><Text style={{fontSize:12,color:answerColor,flex:1}}>{isSelected?"✓ ":""}{option.label}</Text><Text style={{fontSize:11,color:colors.mutedForeground}}>{option.voteCount}</Text></TouchableOpacity>;
        })}
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8}}><Text style={{fontSize:10,color:colors.mutedForeground}}>{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</Text><TouchableOpacity onPress={()=>void toggleLeaderboard(item.poll.id)}><Text style={{fontSize:11,fontWeight:"800",color:colors.primary}}>{leaderboardOpenId===item.poll.id?"Hide leaderboard":"Leaderboard"}</Text></TouchableOpacity></View>
        {showMark&&<View style={{borderWidth:1,borderColor:isCorrect?"#86EFAC":"#FDA4AF",backgroundColor:isCorrect?"#DCFCE7":"#FEE2E2",borderRadius:8,padding:9}}><Text style={{fontSize:11,fontWeight:"800",color:isCorrect?"#166534":"#991B1B"}}>{isCorrect?"✓ Correct answer!":"✕ Incorrect. Correct answer: "+(feedback?.correctLabel??item.options.find(option=>option.id===correctOptionId)?.label??"See teacher feedback")}</Text></View>}
        {leaderboardOpenId===item.poll.id&&<View style={{borderWidth:1,borderColor:colors.border,borderRadius:9,padding:8,gap:7}}><Text style={{fontSize:11,fontWeight:"900",color:colors.foreground}}>🏆 Poll leaderboard</Text>
          {leaderboardLoadingId===item.poll.id?<ActivityIndicator color={colors.primary}/>:entries.length===0?<Text style={{fontSize:10,color:colors.mutedForeground}}>No answers have been submitted yet.</Text>:<ScrollView style={{maxHeight:170}} nestedScrollEnabled contentContainerStyle={{gap:6}}>{entries.map(entry=><View key={entry.rank+"-"+(entry.userId??entry.rank)} style={{flexDirection:"row",alignItems:"center",gap:7,borderRadius:7,backgroundColor:colors.background,padding:6}}><Text style={{fontSize:10,fontWeight:"900",color:colors.mutedForeground}}>#{entry.rank}</Text>{entry.userId?<UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl}/>:<Text style={{fontSize:11,color:colors.foreground,flex:1}}>◉ Anonymous learner</Text>}<Text style={{fontSize:10,color:colors.foreground,flexShrink:1,textAlign:"right"}}>{entry.answers.join(", ")}</Text></View>)}</ScrollView>}
        </View>}
      </View>;
    })}</ScrollView>}
  </View>;
}
