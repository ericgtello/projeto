import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type EquipmentItem = { id: string; name: string };

export default function PerfilScreen() {
  const router = useRouter();
  const { user, token, signOut, refresh } = useAuth();
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentItem[]>([]);
  const [equipment, setEquipment] = useState<string[]>(user?.equipment ?? []);
  const [targetWeight, setTargetWeight] = useState(user?.target_weight?.toString() ?? "");
  const [deadline, setDeadline] = useState(user?.deadline_weeks?.toString() ?? "");
  const [newWeight, setNewWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/equipment/catalog", token);
        if (res.ok) setEquipmentCatalog(await res.json());
      } catch {
        /* noop */
      }
    })();
  }, [token]);

  useEffect(() => {
    setEquipment(user?.equipment ?? []);
    setTargetWeight(user?.target_weight?.toString() ?? "");
    setDeadline(user?.deadline_weeks?.toString() ?? "");
  }, [user]);

  const toggle = (id: string) => {
    setEquipment((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const saveProfile = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const body: any = { equipment };
      if (targetWeight) body.target_weight = Number(targetWeight);
      if (deadline) body.deadline_weeks = Number(deadline);
      const res = await apiFetch("/api/profile", token, { method: "PATCH", body: JSON.stringify(body) });
      if (res.ok) {
        setStatus("Perfil atualizado.");
        await refresh();
      } else {
        setStatus("Falha ao salvar.");
      }
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setSaving(false);
    }
  }, [equipment, targetWeight, deadline, token, refresh]);

  const logWeight = useCallback(async () => {
    if (!newWeight) return;
    setSavingWeight(true);
    setStatus(null);
    try {
      const res = await apiFetch("/api/weight/logs", token, {
        method: "POST",
        body: JSON.stringify({ weight_kg: Number(newWeight) }),
      });
      if (res.ok) {
        setStatus("Peso registrado.");
        setNewWeight("");
        await refresh();
      } else setStatus("Falha ao registrar peso.");
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setSavingWeight(false);
    }
  }, [newWeight, token, refresh]);

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="perfil-back" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>PERFIL</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.userCard}>
            <Ionicons name="person-circle" size={56} color={theme.color.onSurfaceSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || "Usuário"}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>

          <SectionTitle>REGISTRAR PESO</SectionTitle>
          <View style={styles.inlineRow}>
            <TextInput
              testID="input-new-weight"
              value={newWeight}
              onChangeText={setNewWeight}
              keyboardType="numeric"
              placeholder="Ex: 78.5"
              placeholderTextColor={theme.color.surfaceTertiary}
              style={styles.input}
            />
            <Pressable style={styles.primaryBtn} onPress={logWeight} disabled={savingWeight} testID="save-weight">
              {savingWeight ? <ActivityIndicator color={theme.color.onBrand} /> : <Text style={styles.primaryBtnText}>SALVAR</Text>}
            </Pressable>
          </View>

          <SectionTitle>META</SectionTitle>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Peso alvo (kg)</Text>
              <TextInput
                testID="input-target"
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Prazo (semanas)</Text>
              <TextInput
                testID="input-deadline"
                value={deadline}
                onChangeText={setDeadline}
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
          </View>

          <SectionTitle>EQUIPAMENTOS DA ACADEMIA</SectionTitle>
          <View style={styles.grid}>
            {equipmentCatalog.map((eq) => {
              const sel = equipment.includes(eq.id);
              return (
                <Pressable
                  key={eq.id}
                  onPress={() => toggle(eq.id)}
                  style={[styles.chip, sel && styles.chipActive]}
                  testID={`eq-${eq.id}`}
                >
                  <Ionicons
                    name={sel ? "checkmark-circle" : "add-circle-outline"}
                    size={18}
                    color={sel ? theme.color.brand : theme.color.onSurfaceSecondary}
                  />
                  <Text style={[styles.chipText, sel && styles.chipTextActive]}>{eq.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.primaryBtn} onPress={saveProfile} disabled={saving} testID="save-profile">
            {saving ? <ActivityIndicator color={theme.color.onBrand} /> : <Text style={styles.primaryBtnText}>SALVAR PERFIL</Text>}
          </Pressable>

          {status ? <Text style={styles.status}>{status}</Text> : null}

          <Pressable style={styles.logoutBtn} onPress={logout} testID="logout-btn">
            <Ionicons name="log-out-outline" size={18} color={theme.color.error} />
            <Text style={styles.logoutText}>SAIR</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  userName: { color: theme.color.onSurface, fontSize: 16, fontWeight: "800" },
  userEmail: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  section: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: theme.spacing.md,
  },
  inlineRow: { flexDirection: "row", gap: theme.spacing.sm },
  input: {
    flex: 1,
    backgroundColor: theme.color.surfaceSecondary,
    color: theme.color.onSurface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    fontSize: 16,
    fontWeight: "600",
  },
  row2: { flexDirection: "row", gap: theme.spacing.md },
  label: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  chipActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandTertiary },
  chipText: { color: theme.color.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: theme.color.brand },
  primaryBtn: {
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  primaryBtnText: { color: theme.color.onBrand, fontWeight: "800", letterSpacing: 1 },
  status: { color: theme.color.success, textAlign: "center", fontSize: 13 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.error,
    marginTop: theme.spacing.lg,
  },
  logoutText: { color: theme.color.error, fontWeight: "800", letterSpacing: 1 },
});
