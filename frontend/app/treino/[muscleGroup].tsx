import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  tips: string;
  equipment: string;
};
type Plan = { id: string; muscle_group: string; exercises: Exercise[] };

const GROUP_LABEL: Record<string, string> = {
  peito: "Peito",
  costas: "Costas",
  pernas: "Pernas",
  ombros: "Ombros",
  bracos: "Braços",
  abdomen: "Abdômen",
};

export default function TreinoDetail() {
  const params = useLocalSearchParams<{ muscleGroup: string }>();
  const muscleGroup = params.muscleGroup as string;
  const router = useRouter();
  const { token } = useAuth();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [logModal, setLogModal] = useState<{ exercise: Exercise } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/workout/plans/${muscleGroup}`, token);
      if (res.status === 404) {
        setPlan(null);
      } else if (res.ok) {
        setPlan(await res.json());
      } else {
        setError("Falha ao carregar treino.");
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, [muscleGroup, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/workout/generate", token, {
        method: "POST",
        body: JSON.stringify({ muscle_group: muscleGroup }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Falha ao gerar treino.");
        return;
      }
      setPlan(await res.json());
    } catch {
      setError("Erro de rede.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>{GROUP_LABEL[muscleGroup] ?? muscleGroup?.toUpperCase()}</Text>
        <Pressable onPress={generate} disabled={generating} testID="regenerate-btn" hitSlop={12}>
          <Ionicons
            name="refresh"
            size={22}
            color={generating ? theme.color.surfaceTertiary : theme.color.brand}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : !plan ? (
        <View style={styles.center}>
          <Ionicons name="barbell-outline" size={48} color={theme.color.surfaceTertiary} />
          <Text style={styles.emptyTitle}>Nenhum treino gerado</Text>
          <Text style={styles.emptyDesc}>Gere um treino personalizado com IA baseado nos seus equipamentos.</Text>
          <Pressable style={styles.generateBtn} onPress={generate} disabled={generating} testID="generate-btn">
            {generating ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={theme.color.onBrand} />
                <Text style={styles.generateBtnText}>GERAR TREINO COM IA</Text>
              </>
            )}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {plan.exercises.map((ex, idx) => {
            const key = `${idx}-${ex.name}`;
            const isOpen = expanded[key];
            return (
              <View key={key} style={styles.exCard} testID={`exercise-${idx}`}>
                <Pressable
                  onPress={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
                  style={styles.exHeader}
                >
                  <View style={styles.exNum}>
                    <Text style={styles.exNumText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exName}>{ex.name}</Text>
                    <Text style={styles.exMeta}>
                      {ex.sets} séries · {ex.reps} reps · {ex.rest_seconds}s descanso
                    </Text>
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.color.onSurfaceSecondary}
                  />
                </Pressable>
                {isOpen && (
                  <View style={styles.exBody}>
                    <View style={styles.tipBox}>
                      <Ionicons name="bulb" size={16} color={theme.color.warning} />
                      <Text style={styles.tipText}>{ex.tips}</Text>
                    </View>
                    <Text style={styles.eqText}>Equipamento: {ex.equipment}</Text>
                    <Pressable
                      style={styles.logBtn}
                      onPress={() => setLogModal({ exercise: ex })}
                      testID={`log-btn-${idx}`}
                    >
                      <Ionicons name="add-circle" size={18} color={theme.color.brand} />
                      <Text style={styles.logBtnText}>REGISTRAR SÉRIE</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <LogSetModal
        visible={!!logModal}
        exercise={logModal?.exercise ?? null}
        muscleGroup={muscleGroup}
        onClose={() => setLogModal(null)}
        token={token}
      />
    </SafeAreaView>
  );
}

function LogSetModal({
  visible,
  exercise,
  muscleGroup,
  onClose,
  token,
}: {
  visible: boolean;
  exercise: Exercise | null;
  muscleGroup: string;
  onClose: () => void;
  token: string | null;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNum, setSetNum] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!exercise) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/workout/logs", token, {
        method: "POST",
        body: JSON.stringify({
          exercise_name: exercise.name,
          muscle_group: muscleGroup,
          weight_kg: Number(weight),
          reps: Number(reps),
          set_number: Number(setNum),
        }),
      });
      if (!res.ok) {
        setErr("Falha ao salvar.");
        return;
      }
      setWeight("");
      setReps("");
      setSetNum("1");
      onClose();
    } catch {
      setErr("Erro de rede.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={modalStyles.backdrop}
      >
        <View style={modalStyles.sheet} testID="log-modal">
          <View style={modalStyles.grabber} />
          <Text style={modalStyles.title}>Registrar série</Text>
          <Text style={modalStyles.exName}>{exercise?.name}</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Série</Text>
              <TextInput
                testID="input-set-number"
                value={setNum}
                onChangeText={setSetNum}
                keyboardType="numeric"
                style={modalStyles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Reps</Text>
              <TextInput
                testID="input-reps"
                value={reps}
                onChangeText={setReps}
                keyboardType="numeric"
                style={modalStyles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Carga (kg)</Text>
              <TextInput
                testID="input-weight"
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                style={modalStyles.input}
              />
            </View>
          </View>
          {err ? <Text style={modalStyles.err}>{err}</Text> : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose} testID="log-cancel">
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={modalStyles.saveBtn}
              onPress={save}
              disabled={saving || !weight || !reps}
              testID="log-save"
            >
              {saving ? (
                <ActivityIndicator color={theme.color.onBrand} />
              ) : (
                <Text style={modalStyles.saveText}>SALVAR</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  title: { color: theme.color.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: 1 },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  emptyTitle: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginTop: theme.spacing.md },
  emptyDesc: { color: theme.color.onSurfaceSecondary, textAlign: "center", fontSize: 13, marginBottom: theme.spacing.md },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.color.brand,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.md,
    minHeight: 52,
  },
  generateBtnText: { color: theme.color.onBrand, fontWeight: "800", letterSpacing: 1 },
  errorText: { color: theme.color.error, textAlign: "center" },
  exCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  exHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.lg },
  exNum: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  exNumText: { color: theme.color.brand, fontWeight: "800" },
  exName: { color: theme.color.onSurface, fontSize: 15, fontWeight: "700" },
  exMeta: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  exBody: {
    padding: theme.spacing.lg,
    paddingTop: 0,
    gap: theme.spacing.md,
  },
  tipBox: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.color.warning,
  },
  tipText: { flex: 1, color: theme.color.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  eqText: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.brand,
  },
  logBtnText: { color: theme.color.brand, fontWeight: "700", letterSpacing: 0.5 },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.color.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surfaceTertiary, alignSelf: "center", marginBottom: theme.spacing.md },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800" },
  exName: { color: theme.color.brand, fontWeight: "700", marginBottom: theme.spacing.md },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: theme.spacing.xs, fontWeight: "700" },
  input: {
    backgroundColor: theme.color.surface,
    color: theme.color.onSurface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  err: { color: theme.color.error, textAlign: "center", marginTop: theme.spacing.sm },
  cancelBtn: {
    flex: 1,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: "center",
  },
  cancelText: { color: theme.color.onSurfaceSecondary, fontWeight: "700" },
  saveBtn: {
    flex: 1,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brand,
    alignItems: "center",
  },
  saveText: { color: theme.color.onBrand, fontWeight: "800", letterSpacing: 1 },
});
