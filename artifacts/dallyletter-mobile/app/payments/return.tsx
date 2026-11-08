import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function PayPalReturnScreen() {
  const params = useLocalSearchParams<{ token?: string; cancel?: string }>();
  const orderId = Array.isArray(params.token) ? params.token[0] : params.token;
  const cancelled = params.cancel === "1";
  const { token, user, isLoading } = useAuth();
  const colors = useColors();
  const started = useRef(false);
  const [state, setState] = useState<"waiting" | "working" | "success" | "error" | "cancelled">("waiting");
  const [message, setMessage] = useState("Checking your PayPal payment…");

  useEffect(() => {
    if (isLoading || started.current) return;
    if (cancelled) {
      setState("cancelled");
      setMessage("You cancelled PayPal checkout. No payment has been recorded as paid.");
      return;
    }
    if (!orderId) {
      setState("error");
      setMessage("PayPal did not return an order reference. Check your school-fee records before trying again.");
      return;
    }
    if (!token || !user || user.role !== "student") {
      setState("error");
      setMessage("Sign in to the same learner account that started this payment, then reopen the payment confirmation.");
      return;
    }
    started.current = true;
    setState("working");
    setMessage("Confirming the approved order with PayPal…");
    fetch(getApiUrl("/api/payments/paypal/capture"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ orderId }),
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.captured !== true) throw new Error(data.error || "PayPal capture is not confirmed.");
        setState("success");
        setMessage(data.awaitingWebhook
          ? "PayPal confirms the capture. Your school-fee record will change to paid after the verified PayPal webhook is received."
          : data.alreadyCompleted
            ? "PayPal has already completed this payment. Your school-fee record is being checked."
            : "PayPal has completed capture. Your school-fee record will update after the verified PayPal webhook is received.");
      })
      .catch(error => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Payment confirmation failed. Please contact your school.");
      });
  }, [cancelled, isLoading, orderId, token, user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {state === "working" || state === "waiting" ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        <Text style={[styles.title, { color: colors.text }]}>
          {state === "success" ? "PayPal capture confirmed" : state === "cancelled" ? "Checkout cancelled" : state === "error" ? "Confirmation needs attention" : "PayPal payment"}
        </Text>
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Return to DallyLetter</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", gap: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: { paddingVertical: 13, paddingHorizontal: 20, borderRadius: 10, marginTop: 8 },
  buttonText: { color: "#ffffff", fontWeight: "700" },
});
