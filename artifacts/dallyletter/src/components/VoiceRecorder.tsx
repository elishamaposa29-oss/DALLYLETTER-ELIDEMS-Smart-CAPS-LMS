import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Square } from "lucide-react";

interface VoiceRecorderProps {
  onSend: (audio: Blob) => void | Promise<void>;
  isSending?: boolean;
}

export function VoiceRecorder({ onSend, isSending }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopTracks();
    };
  }, []);

  const start = async () => {
    if (isSending || recording || starting) return;
    setError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Voice recording is not supported by this browser. Try the latest Chrome.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
        "audio/ogg",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (mountedRef.current) setError("Recording failed. Check microphone permission and try again.");
      };
      recorder.onstop = () => {
        clearTimer();
        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        recorderRef.current = null;
        stopTracks();
        if (mountedRef.current) setRecording(false);
        if (blob.size === 0) {
          if (mountedRef.current) setError("No audio was captured. Allow microphone access and record for at least one second.");
          return;
        }
        Promise.resolve(onSend(blob)).catch(reason => {
          if (mountedRef.current) setError(reason instanceof Error ? reason.message : "Voice message could not be sent.");
        });
      };
      recorder.start(250);
      setSeconds(0);
      setRecording(true);
      clearTimer();
      timerRef.current = setInterval(() => setSeconds(value => value + 1), 1000);
    } catch (reason) {
      stopTracks();
      setError(reason instanceof Error ? reason.message : "Microphone access failed. Check your browser permission.");
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearTimer();
    // Request the final buffered chunk before the browser closes the recorder.
    try { recorder.requestData(); } catch { /* Some browsers flush the final chunk automatically. */ }
    recorder.stop();
    setRecording(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        variant={recording ? "destructive" : "outline"}
        size="icon"
        className="shrink-0 rounded-full select-none"
        title={recording ? "Stop and send voice message" : "Tap to start recording"}
        aria-label={recording ? "Stop and send voice message" : "Start voice recording"}
        disabled={isSending || starting}
        onClick={() => recording ? stop() : void start()}
      >
        {isSending || starting ? <Loader2 className="h-5 w-5 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
      </Button>
      {recording && <span role="status" className="text-[10px] font-mono text-destructive">Recording · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
      {error && <p role="alert" className="max-w-[200px] text-center text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
