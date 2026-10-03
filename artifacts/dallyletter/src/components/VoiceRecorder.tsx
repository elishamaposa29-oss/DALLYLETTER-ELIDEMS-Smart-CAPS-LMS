import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Square } from "lucide-react";

interface VoiceRecorderProps { onSend:(audio:Blob)=>void|Promise<void>; isSending?:boolean; }

export function VoiceRecorder({onSend,isSending}:VoiceRecorderProps){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState<string|null>(null);
 const recorderRef=useRef<MediaRecorder|null>(null),chunksRef=useRef<Blob[]>([]),timerRef=useRef<ReturnType<typeof setInterval>|null>(null),streamRef=useRef<MediaStream|null>(null),buttonRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>()=>{if(timerRef.current)clearInterval(timerRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 const start=async()=>{if(isSending||recording)return;setError(null);try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("Voice recording is not supported by this browser.");const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")?"audio/ogg;codecs=opus":MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"audio/ogg";const rec=new MediaRecorder(stream,{mimeType:mime});recorderRef.current=rec;chunksRef.current=[];rec.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};rec.onerror=()=>setError("The microphone stopped unexpectedly. Try again.");rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:mime});stream.getTracks().forEach(t=>t.stop());recorderRef.current=null;if(blob.size===0){setError("No audio was captured. Hold the microphone a little longer.");return;}Promise.resolve(onSend(blob)).catch((e: unknown)=>setError(e instanceof Error?e.message:"Voice message could not be sent."));};rec.start(200);setRecording(true);setSeconds(0);timerRef.current=setInterval(()=>setSeconds(s=>s+1),1000);}catch(e){setError(e instanceof Error?e.message:"Microphone access denied. Please allow microphone access.");}};
 const stop=()=>{const rec=recorderRef.current;if(!rec||rec.state==="inactive")return;if(timerRef.current)clearInterval(timerRef.current);timerRef.current=null;rec.stop();setRecording(false);};
 const handlePointerDown=(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();buttonRef.current=e.currentTarget;buttonRef.current.setPointerCapture?.(e.pointerId);void start();};
 return <div className="flex flex-col items-center gap-1">
   <Button ref={buttonRef} type="button" variant={recording?"destructive":"outline"} size="icon" className="shrink-0 rounded-full select-none touch-none" title={recording?"Release/stop recording":"Tap or hold to record a voice message"} disabled={isSending} onPointerDown={handlePointerDown} onPointerUp={e=>{e.preventDefault()}} onPointerCancel={stop} onClick={e=>{e.preventDefault();if(recording)stop();else void start()}}>{isSending?<Loader2 className="h-5 w-5 animate-spin"/>:recording?<Square className="h-4 w-4"/>:<Mic className="h-5 w-5"/>}</Button>
   {recording&&<span className="text-[10px] text-destructive font-mono">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span>}
   {error&&<p className="text-[10px] text-destructive max-w-[200px] text-center">{error}</p>}
 </div>;
}