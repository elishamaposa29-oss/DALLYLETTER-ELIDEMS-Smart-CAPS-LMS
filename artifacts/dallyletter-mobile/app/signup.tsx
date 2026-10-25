import { useRegisterUser } from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [error, setError] = useState("");

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: async (data) => {
        await login(data.user as any, data.token);
        if (data.user.role === "teacher") router.replace("/(teacher)/home");
        else router.replace("/(student)/home");
      },
      onError: (err: any) => {
        const message = err?.message || err?.response?.data?.error;
        setError(typeof message === "string" ? message : "Account creation failed. Check your details and try again.");
      },
    },
  });

  const submit = () => {
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Enter your name, email and password.");
      return;
    }
    if (password.length < 8 || password.length > 256) {
      setError("Use a password between 8 and 256 characters.");
      return;
    }
    registerMutation.mutate({ data: { name: name.trim(), email: email.trim().toLowerCase(), password, role } });
  };

  const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.primary },
    hero: { paddingTop: insets.top + 30, paddingHorizontal: 24, paddingBottom: 24 },
    title: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
    subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 8, fontFamily: "Inter_400Regular" },
    panel: { flexGrow: 1, backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: insets.bottom + 24 },
    heading: { color: colors.foreground, fontSize: 23, fontFamily: "Inter_700Bold", marginBottom: 6 },
    hint: { color: colors.mutedForeground, fontSize: 14, marginBottom: 22, fontFamily: "Inter_400Regular" },
    label: { color: colors.foreground, fontSize: 13, marginBottom: 7, fontFamily: "Inter_600SemiBold" },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, borderRadius: 12, paddingHorizontal: 14, height: 50, marginBottom: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
    roleRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
    roleButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, alignItems: "center" },
    primaryButton: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 8 },
    primaryText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    error: { color: "#dc2626", marginBottom: 12, fontSize: 13, fontFamily: "Inter_400Regular" },
    footer: { alignItems: "center", paddingTop: 20 },
  });

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Text style={s.title}>Join Dallyletter Elidems</Text>
          <Text style={s.subtitle}>Create your account to learn, teach and share lessons.</Text>
        </View>
        <View style={s.panel}>
          <Text style={s.heading}>Create account</Text>
          <Text style={s.hint}>Choose the account type that fits you.</Text>
          <Text style={s.label}>I want to join as</Text>
          <View style={s.roleRow}>
            {(["student", "teacher"] as const).map((item) => (
              <TouchableOpacity
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: role === item }}
                onPress={() => setRole(item)}
                style={[s.roleButton, role === item && { borderColor: colors.primary, backgroundColor: colors.secondary }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>Full name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={colors.mutedForeground} autoCapitalize="words" autoComplete="name" />
          <Text style={s.label}>Email</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Text style={s.label}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry autoComplete="new-password" />
          {role === "teacher" ? <Text style={s.hint}>Teacher accounts may require approval before teaching features are enabled.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <TouchableOpacity accessibilityRole="button" style={[s.primaryButton, registerMutation.isPending && { opacity: 0.7 }]} onPress={submit} disabled={registerMutation.isPending}>
            {registerMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Create account</Text>}
          </TouchableOpacity>
          <View style={s.footer}>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.replace("/login")}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
