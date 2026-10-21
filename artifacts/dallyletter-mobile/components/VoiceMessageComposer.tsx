import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export type VoiceRecordingFile = { uri: string; fileName: string; mimeType: string };
export default function VoiceMessageComposer({ disabled, onSend }: { disabled?: boolean; onSend: (file: VoiceRecordingFile) => Promise<void> | void }) {
  const colors = useColors();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { if (!state.isRecording) return; const timer = setInterval(() => setSeconds(v => v + 1), 1000); return () => clearInterval(timer); }, [state.isRecording]);
  const start = async () => {
    if (disabled || starting || sending || state.isRecording) return;
    setStarting(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Microphone permission is required to record a voice message.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setSeconds(0);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) { Alert.alert("Could not start recording", e instanceof Error ? e.message : "Check microphone permission and retry."); }
    finally { setStarting(false); }
  };
  const stop = async () => {
    if (!state.isRecording || sending) return;
    setSending(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("The recorder did not save an audio file.");
      await onSend({ uri, fileName: "voice-message.m4a", mimeType: "audio/mp4" });
    } catch (e) { Alert.alert("Voice message not sent", e instanceof Error ? e.message : "Reconnect and try again."); }
    finally { setSending(false); await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined); }
  };
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={state.isRecording ? "Stop and send voice message" : "Record voice message"} disabled={disabled || starting || sending} onPress={() => void (state.isRecording ? stop() : start())} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 8, opacity: disabled || starting || sending ? 0.6 : 1 }}>
      {starting || sending ? <ActivityIndicator size="small" color={colors.primary}/> : <Text style={{ color: state.isRecording ? "#dc2626" : colors.primary, fontWeight: "700" }}>{state.isRecording ? "■ Stop & send" : "🎙 Record voice"}</Text>}
    </TouchableOpacity>
    {state.isRecording ? <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontSize: 12 }}>Recording {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</Text> : null}
  </View>;
}
