import { Feather } from "@expo/vector-icons";
import { useLoginUser } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
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

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const loginMutation = useLoginUser({
    mutation: {
      onSuccess: async (data) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await login(data.user as any, data.token);
        const role = (data.user as any).role;
        if (role === "owner") router.replace("/(admin)/home");
        else if (role === "teacher") router.replace("/(teacher)/home");
        else router.replace("/(student)/home");
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("Invalid email or password. Please try again.");
      },
    },
  });

  const handleLogin = () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    loginMutation.mutate({ data: { email: email.trim(), password } });
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primary },
    scroll: { flexGrow: 1 },
    hero: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
      paddingHorizontal: 28,
      paddingBottom: 32,
      alignItems: "center",
    },
    logo: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    appName: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
      letterSpacing: 0.5,
    },
    tagline: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.7)",
      marginTop: 6,
      textAlign: "center",
    },
    card: {
      flex: 1,
      backgroundColor: colors.background,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingHorizontal: 24,
      paddingTop: 36,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 20,
    },
    heading: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subheading: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 28,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: 18,
      paddingHorizontal: 14,
      height: 52,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    eyeBtn: { padding: 6 },
    errorBox: {
      backgroundColor: "#fef2f2",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "#dc2626",
      flex: 1,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    btnText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
      letterSpacing: 0.3,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
    },
    divLine: { flex: 1, height: 1, backgroundColor: colors.border },
    divText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginHorizontal: 12,
    },
    hintBox: {
      backgroundColor: colors.secondary,
      borderRadius: 12,
      padding: 14,
    },
    hintTitle: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
      marginBottom: 6,
    },
    hintRow: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
    },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.logo}>
            <Feather name="book-open" size={32} color={colors.primary} />
          </View>
          <Text style={s.appName}>DALLYLETTER ELIDEMS</Text>
          <Text style={s.tagline}>CAPS Education Platform</Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Welcome back</Text>
          <Text style={s.subheading}>Sign in to continue learning</Text>

          <Text style={s.label}>Email</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              testID="email-input"
            />
          </View>

          <Text style={s.label}>Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              testID="password-input"
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={15} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.btn, loginMutation.isPending && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loginMutation.isPending}
            testID="login-btn"
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={s.btnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={s.divider}>
            <View style={s.divLine} />
            <Text style={s.divText}>Demo accounts</Text>
            <View style={s.divLine} />
          </View>

          <View style={s.hintBox}>
            <Text style={s.hintTitle}>Quick Access</Text>
            <Text style={s.hintRow}>Owner: elishamaposa29@gmail.com</Text>
            <Text style={s.hintRow}>Teacher: teacher.sarah@dallyletter.com</Text>
            <Text style={s.hintRow}>Student: student.alice@dallyletter.com</Text>
            <Text style={[s.hintRow, { marginTop: 4, fontFamily: "Inter_600SemiBold" }]}>
              Owner pw: Admin@12345 | Others: password123
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
