import { useState } from "react";
import { Plus, GripVertical, Trash2, Save, Send, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@workspace/api-client-react";

interface PollOption { id:string; label:string; value:string; isCorrect:boolean }
interface ExerciseQuestionDraft { id:string; prompt:string; type:"input"|"poll"|"drawbox"; marks:number; options:PollOption[]; width:number; height:number }
interface ExerciseBuilderPanelProps { lessonId:number; onSaved?:()=>void }
interface AIReadiness { provider:string; configured:boolean; canMark:boolean; clarifications:string[]; reason?:string|null }

export function ExerciseBuilderPanel({lessonId,onSaved}:ExerciseBuilderPanelProps){
 const [title,setTitle]=useState("");const [instructions,setInstructions]=useState("");const [questions,setQuestions]=useState<ExerciseQuestionDraft[]>([]);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);
 const [preparedExerciseId,setPreparedExerciseId]=useState<number|null>(null);const [aiEnabled,setAiEnabled]=useState(false);const [aiApproved,setAiApproved]=useState(false);const [aiReadiness,setAiReadiness]=useState<AIReadiness|null>(null);const [aiClarification,setAiClarification]=useState("");
 const addQuestion=(type:ExerciseQuestionDraft["type"]="input")=>setQuestions(c=>[...c,{id:crypto.randomUUID(),prompt:"",type,marks:1,width:100,height:240,options:type==="poll"?[{id:crypto.randomUUID(),label:"",value:"A",isCorrect:false},{id:crypto.randomUUID(),label:"",value:"B",isCorrect:false}]:[]}]);
 const moveQuestion=(from:number,to:number)=>setQuestions(c=>{if(to<0||to>=c.length||from===to)return c;const next=[...c];const [item]=next.splice(from,1);next.splice(to,0,item);return next.map((q,i)=>({...q,position:i} as ExerciseQuestionDraft));});
 const invalidateAIReadiness=()=>{setAiReadiness(null);setAiApproved(false);setPreparedExerciseId(null)};
 const updateQuestion=(id:string,patch:Partial<ExerciseQuestionDraft>)=>{invalidateAIReadiness();setQuestions(c=>c.map(q=>q.id===id?{...q,...patch}:q))};
 const updateOption=(qid:string,oid:string,patch:Partial<PollOption>)=>{invalidateAIReadiness();setQuestions(c=>c.map(q=>q.id===qid?{...q,options:q.options.map(o=>o.id===oid?{...o,...patch}:o)}:q))};
 const removeQuestion=(id:string)=>{invalidateAIReadiness();setQuestions(c=>c.filter(q=>q.id!==id))};

 const checkAI=async()=>{
   setBusy(true);setMessage(null);
   try{
     const token=localStorage.getItem("dallyletter_token");const headers:HeadersInit={"Content-Type":"application/json"};if(token)headers.Authorization=`Bearer ${token}`;
     const er=await fetch(getApiUrl(`/api/exercises/lessons/${lessonId}/exercises`),{method:"POST",headers,body:JSON.stringify({title:title.trim(),instructions:instructions.trim()||undefined,layout:{version:1,page:"book",mode:"freeform"}})});
     if(!er.ok)throw new Error((await er.json().catch(()=>null))?.error||"Could not prepare the exercise");
     const exercise=await er.json() as {id:number};
     for(const[index,q]of questions.entries()){
       const qr=await fetch(getApiUrl(`/api/exercises/${exercise.id}/questions`),{method:"POST",headers,body:JSON.stringify({prompt:q.prompt.trim(),type:q.type,marksAllocated:q.marks,position:index,config:{layout:"book",width:q.width,height:q.height},options:q.type==="poll"?q.options.map(o=>({label:o.label.trim(),value:o.value.trim()||o.label.trim(),isCorrect:o.isCorrect})):undefined})});
       if(!qr.ok)throw new Error((await qr.json().catch(()=>null))?.error||`Could not save question ${index+1}`);
     }
     const rr=await fetch(getApiUrl(`/api/exercises/${exercise.id}/ai-marking/check`),{method:"POST",headers,body:JSON.stringify({teacherClarification:aiClarification})});
     const data=await rr.json();
     if(!rr.ok)throw new Error(data.error||"AI readiness check failed");
     setPreparedExerciseId(exercise.id);setAiReadiness(data);setAiApproved(Boolean(data.canMark)&&data.clarifications?.length===0);
     setMessage(data.canMark&&data.clarifications?.length===0?"AI marking is ready. Confirm below before publishing.":data.clarifications?.length?"AI needs clarification before it can be enabled.":"AI marking cannot be enabled for this exercise yet.");
   }catch(e){setMessage(e instanceof Error?e.message:"AI readiness check failed.");}finally{setBusy(false)}
 };

 const save=async(publish:boolean)=>{
   if(!title.trim()||questions.some(q=>!q.prompt.trim()||(q.type==="poll"&&(q.options.length<2||q.options.some(o=>!o.label.trim())||!q.options.some(o=>o.isCorrect))))){setMessage("Complete the title, questions, and poll options before saving.");return;}
   if(publish&&aiEnabled&&(!aiReadiness?.canMark||aiReadiness.clarifications.length>0||!aiApproved)){setMessage("Run the AI marking check, resolve any clarification, and confirm AI marking before publishing.");return;}
   setBusy(true);setMessage(null);
   try{
     const token=localStorage.getItem("dallyletter_token");const headers:HeadersInit={"Content-Type":"application/json"};if(token)headers.Authorization=`Bearer ${token}`;
     let exercise:{id:number};
     if(publish&&preparedExerciseId){ exercise={id:preparedExerciseId}; }
     else {
       const er=await fetch(getApiUrl(`/api/exercises/lessons/${lessonId}/exercises`),{method:"POST",headers,body:JSON.stringify({title:title.trim(),instructions:instructions.trim()||undefined,layout:{version:1,page:"book",mode:"freeform",aiMarking:{enabled:false,approved:false}}})});
       if(!er.ok)throw new Error((await er.json().catch(()=>null))?.error||"Could not create exercise");
       exercise=await er.json() as {id:number};
     }
     if(!preparedExerciseId){
       for(const[index,q]of questions.entries()){
         const qr=await fetch(getApiUrl(`/api/exercises/${exercise.id}/questions`),{method:"POST",headers,body:JSON.stringify({prompt:q.prompt.trim(),type:q.type,marksAllocated:q.marks,position:index,config:{layout:"book",width:q.width,height:q.height},options:q.type==="poll"?q.options.map(o=>({label:o.label.trim(),value:o.value.trim()||o.label.trim(),isCorrect:o.isCorrect})):undefined})});
         if(!qr.ok)throw new Error((await qr.json().catch(()=>null))?.error||`Could not save question ${index+1}`);
       }
     }
     if(publish){
       const pr=await fetch(getApiUrl(`/api/exercises/${exercise.id}/publish`),{method:"POST",headers,body:JSON.stringify({aiMarking:{enabled:aiEnabled,approved:aiEnabled&&aiApproved},teacherClarification:aiClarification||undefined})});
       if(!pr.ok)throw new Error((await pr.json().catch(()=>null))?.error||"Could not publish exercise");
       setMessage(aiEnabled?"Exercise published with AI marking enabled. AI will remain teacher-controlled and will never auto-return a result.":"Exercise published and attached to this lesson.");
     }else setMessage("Exercise saved as a draft.");
     onSaved?.();
   }catch(e){setMessage(e instanceof Error?e.message:"Something went wrong while saving the exercise.");}finally{setBusy(false)}
 };

 return <Card className="border-primary/20 bg-card/80 shadow-sm">
  <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Lesson Exercise</CardTitle><p className="mt-1 text-xs text-muted-foreground">Build questions directly beside this lesson's media.</p></div><Badge variant="outline">Attached to lesson</Badge></div></CardHeader>
  <CardContent className="space-y-4">
   <div className="grid gap-3 sm:grid-cols-2"><Input value={title} onChange={e=>{setTitle(e.target.value);setAiReadiness(null);setAiApproved(false);setPreparedExerciseId(null)}} placeholder="Exercise title"/><Input value={instructions} onChange={e=>{setInstructions(e.target.value);setAiReadiness(null);setAiApproved(false)}} placeholder="Instructions (optional)"/></div>
   <div className="rounded-xl border bg-background/60 p-3 sm:p-4"><div className="mb-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={()=>addQuestion("input")}><Plus className="mr-1 h-4 w-4"/>Question</Button><Button type="button" size="sm" variant="outline" onClick={()=>addQuestion("poll")}><Plus className="mr-1 h-4 w-4"/>Poll</Button><Button type="button" size="sm" variant="outline" onClick={()=>addQuestion("drawbox")}><Plus className="mr-1 h-4 w-4"/>Drawbox</Button></div>
    <div className="mx-auto min-h-[520px] max-w-3xl rounded-2xl border-2 border-dashed bg-[#fffdf7] p-4 shadow-inner sm:p-6"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Book-page workspace</span><span className="text-xs text-muted-foreground">Drag questions to reorder • resize each block</span></div><div className="space-y-3">{questions.map((q,i)=><div key={q.id} draggable onDragStart={e=>e.dataTransfer.setData("text/exercise-index",String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{const from=Number(e.dataTransfer.getData("text/exercise-index"));if(Number.isInteger(from))moveQuestion(from,i)}} style={{width:`${q.width}%`,minHeight:q.height}} className="rounded-lg border bg-card p-3 transition-shadow hover:shadow-md"><div className="mb-2 flex items-center gap-2"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" title="Drag to reorder"/><Badge variant="secondary">Q{i+1} · {q.type}</Badge><div className="ml-auto flex items-center gap-2"><Input type="number" min={0.5} step="0.5" className="w-20" value={q.marks} onChange={e=>updateQuestion(q.id,{marks:Number(e.target.value)||0})} aria-label={`Marks for question ${i+1}`}/><Button type="button" variant="ghost" size="icon" onClick={()=>removeQuestion(q.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></div></div><Textarea value={q.prompt} onChange={e=>{updateQuestion(q.id,{prompt:e.target.value});setAiReadiness(null);setAiApproved(false)}} placeholder="Type the exercise question..." className="min-h-20"/>{q.type==="poll"&&<div className="mt-3 space-y-2"><p className="text-xs font-medium">Poll options — select the correct answer</p>{q.options.map((o,oi)=><div key={o.id} className="flex items-center gap-2"><input type="radio" name={`correct-${q.id}`} checked={o.isCorrect} onChange={()=>updateQuestion(q.id,{options:q.options.map(x=>({...x,isCorrect:x.id===o.id}))})}/><Input value={o.label} onChange={e=>updateOption(q.id,o.id,{label:e.target.value,value:e.target.value})} placeholder={`Option ${oi+1}`}/>{q.options.length>2&&<Button type="button" variant="ghost" size="icon" onClick={()=>updateQuestion(q.id,{options:q.options.filter(x=>x.id!==o.id)})}><Trash2 className="h-4 w-4"/></Button>}</div>)}<Button type="button" size="sm" variant="ghost" onClick={()=>updateQuestion(q.id,{options:[...q.options,{id:crypto.randomUUID(),label:"",value:String.fromCharCode(65+q.options.length),isCorrect:false}]})}><Plus className="mr-1 h-4 w-4"/>Option</Button></div>}{q.type==="drawbox"&&<p className="mt-2 text-xs text-muted-foreground">Learners receive a drawing workspace for this question.</p>}</div>)}{!questions.length&&<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Add a question, poll, or drawbox to start.</div>}</div></div>
   </div>
   <div className="rounded-xl border p-4 space-y-3">
    <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1" checked={aiEnabled} onChange={e=>{setAiEnabled(e.target.checked);setAiReadiness(null);setAiApproved(false)}}/><span><span className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4"/>Allow ELIDEMS AI marking <Badge variant="outline">Optional</Badge></span><span className="block text-xs text-muted-foreground">AI may propose marks and feedback, but it will never return results to learners without teacher confirmation.</span></span></label>
    {aiEnabled&&<div className="space-y-3 rounded-lg bg-muted/50 p-3">
      <Button type="button" variant="outline" disabled={busy||!questions.length} onClick={checkAI}><Sparkles className="mr-2 h-4 w-4"/>Check whether AI can mark this exercise</Button>
      {aiReadiness&&<div className="space-y-2 text-sm">{aiReadiness.configured&&aiReadiness.canMark&&aiReadiness.clarifications.length===0?<p className="text-emerald-700">AI readiness check passed ({aiReadiness.provider}).</p>:<p className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0"/>{aiReadiness.configured?"AI needs attention before it can be enabled.":"No live AI provider is configured yet."}</p>}
       {aiReadiness.clarifications.length>0&&<div className="space-y-2"><p className="font-medium">AI clarification questions</p><ul className="list-disc space-y-1 pl-5">{aiReadiness.clarifications.map((q,i)=><li key={i}>{q}</li>)}</ul><Textarea value={aiClarification} onChange={e=>setAiClarification(e.target.value)} placeholder="Answer the AI's clarification here, then run the check again."/></div>}
       {aiReadiness.canMark&&aiReadiness.clarifications.length===0&&<label className="flex items-center gap-2"><input type="checkbox" checked={aiApproved} onChange={e=>setAiApproved(e.target.checked)}/><span>I reviewed the AI check and approve AI marking for this exercise.</span></label>}
      </div>}
    </div>}
   </div>
   {message&&<div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm" role="status"><CheckCircle2 className="h-4 w-4"/>{message}</div>}
   <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>save(false)}><Save className="mr-2 h-4 w-4"/>Save draft</Button><Button type="button" disabled={busy||!questions.length} onClick={()=>save(true)}><Send className="mr-2 h-4 w-4"/>Publish exercise</Button></div>
  </CardContent>
 </Card>;
}
