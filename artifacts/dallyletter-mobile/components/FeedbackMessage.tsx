import React, { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type FeedbackTone = "success" | "error" | "warning" | "info";
type Props = { message: string; onDismiss: () => void; tone?: FeedbackTone; durationMs?: number };

function inferTone(message: string): FeedbackTone {
  const value = message.toLowerCase();
  if (/\b(failed|failure|could not|cannot|denied|invalid|expired|error|not authorized|not allowed|unable|rejected)\b/.test(value)) return "error";
  if (/\b(offline|queued|pending|retry|waiting|not yet|in progress|check your)\b/.test(value)) return "warning";
  if (/\b(loading|uploading|syncing|please wait|processing)\b/.test(value)) return "info";
  return "success";
}

const palette: Record<FeedbackTone, { background: string; border: string; foreground: string; label: string }> = {
  success: { background: "#ecfdf5", border: "#86efac", foreground: "#14532d", label: "Success" },
  error: { background: "#fef2f2", border: "#fca5a5", foreground: "#991b1b", label: "Failed" },
  warning: { background: "#fffbeb", border: "#fcd34d", foreground: "#92400e", label: "Notice" },
  info: { background: "#eff6ff", border: "#93c5fd", foreground: "#1e3a8a", label: "Working" },
};

export function FeedbackMessage({ message, onDismiss, tone, durationMs }: Props) {
  const dismissRef = useRef(onDismiss);
  const [secondsLeft, setSecondsLeft] = useState(0);
  dismissRef.current = onDismiss;
  const resolvedTone = tone || inferTone(message);
  const duration = durationMs ?? (resolvedTone === "error" ? 10000 : resolvedTone === "warning" ? 8000 : 6000);
  useEffect(() => {
    if (!message) return;
    const deadline = Date.now() + duration;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) dismissRef.current();
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [message, duration]);
  if (!message) return null;
  const colors = palette[resolvedTone];
  return (
    <TouchableOpacity accessibilityRole={resolvedTone === "error" ? "alert" : "status"} accessibilityLiveRegion={resolvedTone === "error" ? "assertive" : "polite"} onPress={onDismiss} activeOpacity={0.85} style={{ marginHorizontal: 14, marginVertical: 5, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "800", marginBottom: 2 }}>{colors.label}</Text>
          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>{message}</Text>
        </View>
        <Text style={{ color: colors.foreground, fontSize: 10, fontWeight: "700" }}>{secondsLeft}s · Dismiss</Text>
      </View>
    </TouchableOpacity>
  );
}
