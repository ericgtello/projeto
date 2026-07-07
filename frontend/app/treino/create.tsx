import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

const MUSCLE_GROUPS = [
  { id: "peito", label: "Peito" },
  { id: "costas", label: "Costas" },
  { id: "ombros", label: "Ombros" },
  { id: "bracos", label: "Braços" },
  { id: "pernas", label: "Pernas" },
  { id: "abdomen", label: "Abdômen" },
];

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const create = async () => {
    if (selected.length === 0) {
      setError("Selecione ao menos um grupamento.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/workout/generate", token, {
        method: "POST",
        body: JSON.stringify({
          muscle_groups: selected,
          name: name.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Falha ao gerar treino.");
        return;
      }
      const plan = await res.json();
      router.replace(`/treino/plan/${plan.id}`);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="create-back" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>NOVO TREINO</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Monte seu treino</Text>
          <Text style={styles.desc}>Selecione os grupamentos musculares que você quer treinar hoje.</Text>

          <Text style={styles.section}>NOME DO TREINO (OPCIONAL)</Text>
          <TextInput
            testID="input-name"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Push Day, Superior A"
            placeholderTextColor={theme.color.surfaceTertiary}
            style={styles.input}
            maxLength={40}
          />

          <Text style={styles.section}>GRUPAMENTOS</Text>
          <View style={styles.grid}>
            {MUSCLE_GROUPS.map((g) => {
              const isSel = selected.includes(g.id);
              return (
                <Pressable
                  key={g.id}
                  testID={`group-${g.id}`}
                  onPress={() => toggle(g.id)}
                  style={[styles.chip, isSel && styles.chipActive]}
                >
                  <Ionicons
                    name={isSel ? "checkmark-circle" : "add-circle-outline"}
                    size={18}
                    color={isSel ? theme.color.brand : theme.color.onSurfaceSecondary}
                  />
                  <Text style={[styles.chipText, isSel && styles.chipTextActive]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {selected.length > 0 ? (
            <Text style={styles.summary}>
              Total selecionado: <Text style={{ color: theme.color.brand, fontWeight: "800" }}>{selected.length}</Text>{" "}
              grupamento(s)
            </Text>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="create-generate"
            style={[styles.primaryBtn, selected.length === 0 && styles.primaryBtnDisabled]}
            onPress={create}
            disabled={loading || selected.length === 0}
          >
            {loading ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={theme.color.onBrand} />
                <Text style={styles.primaryBtnText}>GERAR TREINO COM IA</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
  headerTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  title: { color: theme.color.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: 0.5 },
  desc: { color: theme.color.onSurfaceSecondary, fontSize: 13 },
  section: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    color: theme.color.onSurface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 16,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  chipActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandTertiary },
  chipText: { color: theme.color.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: theme.color.brand },
  summary: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: theme.spacing.sm },
  errorText: { color: theme.color.error, textAlign: "center" },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    minHeight: 56,
  },
  primaryBtnDisabled: { backgroundColor: theme.color.surfaceTertiary },
  primaryBtnText: { color: theme.color.onBrand, fontWeight: "800", letterSpacing: 1 },
});
