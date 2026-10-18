import { getApiUrl } from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export function ProfileAvatarEditor() {
  const { user, token, login } = useAuth();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const chooseImage = async () => {
    if (!user || !token || busy) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Photo permission needed", "Allow photo access to choose a profile picture."); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.72, base64: true });
      if (picked.canceled || !picked.assets[0]?.base64) return;
      const asset = picked.assets[0];
      const mime = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
      const avatarUrl = "data:" + mime + ";base64," + asset.base64;
      if (avatarUrl.length > 180_000) { Alert.alert("Image too large", "Choose a smaller image and try again."); return; }
      setBusy(true);
      const response = await fetch(getApiUrl("/api/users/" + user.id), { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ avatarUrl }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your profile photo.");
      await login({ ...user, avatarUrl: data.avatarUrl || avatarUrl }, token);
    } catch (error) { Alert.alert("Photo upload failed", error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ alignItems: "center", marginBottom: 12 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.border }}>
        {user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={{ width: 84, height: 84 }} resizeMode="cover" /> : <Text style={{ color: colors.foreground, fontSize: 32, fontWeight: "700" }}>{user?.name?.charAt(0)?.toUpperCase() || "?"}</Text>}
      </View>
      <TouchableOpacity onPress={() => void chooseImage()} disabled={busy} accessibilityRole="button" accessibilityLabel="Change profile photo" style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)", flexDirection: "row", alignItems: "center", gap: 8 }}>
        {busy ? <ActivityIndicator color="#ffffff" size="small" /> : null}
        <Text style={{ color: "#ffffff", fontWeight: "600" }}>{busy ? "Saving photo…" : "Change photo"}</Text>
      </TouchableOpacity>
    </View>
  );
}
