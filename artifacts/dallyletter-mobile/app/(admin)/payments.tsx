import { Feather } from "@expo/vector-icons";
import { useListPayments, useListUsers, useRecordPayment } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function AdminPayments() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: payments, isLoading, refetch } = useListPayments();
  const { data: users } = useListUsers();
  const [showModal, setShowModal] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState("");
  const [notes, setNotes] = useState("");

  const recordMutation = useRecordPayment({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetch();
        setShowModal(false);
        setStudentId(""); setAmount(""); setMonth(""); setNotes("");
      },
      onError: () => Alert.alert("Error", "Could not record payment."),
    },
  });

  const top = insets.top + (Platform.OS === "web" ? 67 : 0);
  const students = users?.filter((u: any) => u.role === "student") ?? [];
  const paid = payments?.filter((p: any) => p.status === "paid").length ?? 0;
  const overdue = payments?.filter((p: any) => p.status === "overdue").length ?? 0;

  const handleRecord = () => {
    if (!studentId || !amount || !month) {
      Alert.alert("Missing fields", "Student ID, amount, and month are required.");
      return;
    }
    recordMutation.mutate({
      data: { studentId: parseInt(studentId), amount: parseFloat(amount), month, status: "paid", notes: notes || undefined },
    });
  };

  const statusColor: Record<string, string> = { paid: "#22c55e", overdue: "#ef4444", pending: "#f59e0b" };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: top + 16,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
    addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    summaryRow: { flexDirection: "row", gap: 10 },
    summaryCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
    summaryNum: { fontSize: 22, fontFamily: "Inter_700Bold" },
    summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", marginTop: 2 },
    list: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
    info: { flex: 1 },
    studentName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    payMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    right: { alignItems: "flex-end", gap: 4 },
    amount: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modal: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
    modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6 },
    input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, height: 48, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#ffffff", fontFamily: "Inter_700Bold", fontSize: 16 },
    cancelText: { textAlign: "center", marginTop: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    studentPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    studentChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    studentChipActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    studentChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    studentChipTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
  });

  const getStudentName = (sid: number) => students.find((s: any) => s.id === sid)?.name ?? `Student #${sid}`;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.title}>Payments</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
            <Feather name="plus" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { backgroundColor: "rgba(34,197,94,0.2)" }]}>
            <Text style={[s.summaryNum, { color: "#22c55e" }]}>{paid}</Text>
            <Text style={s.summaryLabel}>Paid</Text>
          </View>
          <View style={[s.summaryCard, { backgroundColor: "rgba(239,68,68,0.2)" }]}>
            <Text style={[s.summaryNum, { color: "#ef4444" }]}>{overdue}</Text>
            <Text style={s.summaryLabel}>Overdue</Text>
          </View>
          <View style={[s.summaryCard, { backgroundColor: "rgba(212,175,55,0.2)" }]}>
            <Text style={[s.summaryNum, { color: colors.accent }]}>{payments?.length ?? "—"}</Text>
            <Text style={s.summaryLabel}>Total</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={payments ?? []}
        style={s.list}
        contentContainerStyle={s.listContent}
        keyExtractor={(item: any) => String(item.id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="credit-card" size={48} color={colors.border} />
            <Text style={s.emptyText}>{isLoading ? "Loading..." : "No payments yet"}</Text>
          </View>
        }
        renderItem={({ item: p }) => {
          const col = statusColor[p.status] ?? "#9ca3af";
          return (
            <View style={s.card}>
              <View style={s.avatar}>
                <Feather name="user" size={18} color={colors.primary} />
              </View>
              <View style={s.info}>
                <Text style={s.studentName}>{getStudentName(p.studentId)}</Text>
                <Text style={s.payMeta}>{p.month ?? "—"}</Text>
              </View>
              <View style={s.right}>
                <Text style={s.amount}>R{p.amount ?? "—"}</Text>
                <View style={[s.statusBadge, { backgroundColor: col + "20" }]}>
                  <Text style={[s.statusText, { color: col }]}>{p.status.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView>
            <View style={s.modal}>
              <Text style={s.modalTitle}>Record Payment</Text>
              <Text style={s.label}>Select Student</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={s.studentPicker}>
                  {students.map((st: any) => (
                    <TouchableOpacity
                      key={st.id}
                      style={[s.studentChip, studentId === String(st.id) && s.studentChipActive]}
                      onPress={() => setStudentId(String(st.id))}
                    >
                      <Text style={[s.studentChipText, studentId === String(st.id) && s.studentChipTextActive]}>{st.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={s.label}>Amount (R) *</Text>
              <TextInput style={s.input} placeholder="e.g. 500" placeholderTextColor={colors.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="numeric" />
              <Text style={s.label}>Month *</Text>
              <TextInput style={s.input} placeholder="e.g. January 2025" placeholderTextColor={colors.mutedForeground} value={month} onChangeText={setMonth} />
              <Text style={s.label}>Notes</Text>
              <TextInput style={s.input} placeholder="Optional notes" placeholderTextColor={colors.mutedForeground} value={notes} onChangeText={setNotes} />
              <TouchableOpacity style={s.submitBtn} onPress={handleRecord} disabled={recordMutation.isPending}>
                <Text style={s.submitText}>{recordMutation.isPending ? "Recording..." : "Record Payment"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
