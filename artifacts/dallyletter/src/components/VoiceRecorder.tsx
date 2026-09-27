import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2 } from "lucide-react";

interface VoiceRecorderProps { onSend:(audio:Blob)=>void|Promise<void>; isSending?:boolean; }

export function VoiceRecorder({onSend,isSending}:VoiceRecorderProps){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState<string|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null),chunksRef=useRef<Blob[]>([]),timerRef=useRef<ReturnType<typeof setInterval>|null>(null),streamRef=useRef<MediaStream|null>(null);
 useEffect(()=>()=>{if(timerRef.current)clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 const start=async()=>{if(isSending||recording)return;setError(null);try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"audio/ogg";const rec=new MediaRecorder(stream,{mimeType:mime});recorderRef.current=rec;chunksRef.current=[];rec.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:mime});stream.getTracks().forEach(t=>t.stop());void onSend(blob).catch(e=>setError(e instanceof Error?e.message:"Voice message could not be sent."));};rec.start(100);setRecording(true);setSeconds(0);timerRef.current=setInterval(()=>setSeconds(s=>s+1),1000);}catch{setError("Microphone access denied. Please allow microphone access.");}};
 const stop=()=>{if(!recording)return;if(timerRef.current)clearInterval(timerRef.current);timerRef.current=null;setRecording(false);recorderRef.current?.stop();};
 return <div className="flex flex-col items-center gap-1">
   <Button type="button" variant={recording?"destructive":"outline"} size="icon" className="shrink-0 rounded-full select-none touch-none" title="Hold to record; release to send" disabled={isSending} onPointerDown={e=>{e.preventDefault();void start()}} onPointerUp={e=>{e.preventDefault();stop()}} onPointerCancel={stop} onPointerLeave={()=>{if(recording)stop()}}>{isSending?<Loader2 className="h-5 w-5 animate-spin"/>:<Mic className="h-5 w-5"/>}</Button>
   {recording&&<span className="text-[10px] text-destructive font-mono">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span>}
   {error&&<p className="text-[10px] text-destructive max-w-[180px] text-center">{error}</p>}
 </div>;
}