import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  tips: string;
  equipment: string;
  muscle_group?: string;
  exercise_type?: "compound" | "isolation" | string;
  emphasis?: string;
  is_unilateral?: boolean;
};

export type Plan = {
  id: string;
  muscle_groups: string[];
  name?: string | null;
  is_custom?: boolean;
  exercises: Exercise[];
};

type LastSession = {
  has_history: boolean;
  date?: string;
  sets?: { set_number: number; weight_kg: number; reps: number }[];
  max_weight?: number;
};

const GROUP_LABEL: Record<string, string> = {
  peito: "Peito",
  costas: "Costas",
  pernas: "Pernas",
  ombros: "Ombros",
  bracos: "Braços",
  abdomen: "Abdômen",
};

function planTitle(plan: Plan | null): string {
  if (!plan) return "Treino";
  if (plan.name) return plan.name;
  return plan.muscle_groups.map((g) => GROUP_LABEL[g] ?? g).join(" + ");
}

export function WorkoutDetail({
  mode,
  keyValue,
}: {
  mode: "group" | "plan";
  keyValue: string;
}) {
  const router = useRouter();
  const { token } = useAuth();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lastMap, setLastMap] = useState<Record<string, LastSession>>({});
  const [logModal, setLogModal] = useState<{ index: number; exercise: Exercise } | null>(null);
  const [editingRest, setEditingRest] = useState<{ index: number; value: string } | null>(null);

  const fetchPlan = useCallback(async (): Promise<Plan | null> => {
    const path =
      mode === "group"
        ? `/api/workout/plans/group/${encodeURIComponent(keyValue)}`
        : `/api/workout/plans/id/${encodeURIComponent(keyValue)}`;
    const res = await apiFetch(path, token);
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as Plan;
    throw new Error("failed");
  }, [mode, keyValue, token]);

  const loadLast = useCallback(
    async (exs: Exercise[]) => {
      const results = await Promise.all(
        exs.map(async (ex) => {
          const r = await apiFetch(`/api/workout/logs/last?exercise=${encodeURIComponent(ex.name)}`, token);
          if (!r.ok) return [ex.name, { has_history: false } as LastSession] as const;
          return [ex.name, (await r.json()) as LastSession] as const;
        }),
      );
      setLastMap(Object.fromEntries(results));
    },
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchPlan();
      setPlan(p);
      if (p) await loadLast(p.exercises);
    } catch {
      setError("Falha ao carregar treino.");
    } finally {
      setLoading(false);
    }
  }, [fetchPlan, loadLast]);

  useEffect(() => {
    load();
  }, [load]);

  const generateForGroup = async () => {
    if (mode !== "group") return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/workout/generate", token, {
        method: "POST",
        body: JSON.stringify({ muscle_groups: [keyValue] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Falha ao gerar treino.");
        return;
      }
      const p = (await res.json()) as Plan;
      setPlan(p);
      await loadLast(p.exercises);
    } catch {
      setError("Erro de rede.");
    } finally {
      setGenerating(false);
    }
  };

  const saveRest = async () => {
    if (!editingRest || !plan) return;
    const val = Number(editingRest.value);
    if (!Number.isFinite(val) || val < 0 || val > 600) {
      setError("Descanso deve estar entre 0 e 600 segundos.");
      return;
    }
    const res = await apiFetch(`/api/workout/plans/${plan.id}/rest`, token, {
      method: "PATCH",
      body: JSON.stringify({ exercise_index: editingRest.index, rest_seconds: val }),
    });
    if (res.ok) {
      const updated = { ...plan };
      updated.exercises = updated.exercises.map((e, i) =>
        i === editingRest.index ? { ...e, rest_seconds: val } : e,
      );
      setPlan(updated);
      setEditingRest(null);
    } else {
      setError("Falha ao atualizar descanso.");
    }
  };

  const onLogSaved = async (exerciseName: string) => {
    // reload last-session summary for this exercise
    const r = await apiFetch(`/api/workout/logs/last?exercise=${encodeURIComponent(exerciseName)}`, token);
    if (r.ok) {
      const data = await r.json();
      setLastMap((m) => ({ ...m, [exerciseName]: data }));
    }
    setLogModal(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {planTitle(plan) || (mode === "group" ? GROUP_LABEL[keyValue] : "Treino")}
        </Text>
        {mode === "group" ? (
          <Pressable onPress={generateForGroup} disabled={generating} testID="regenerate-btn" hitSlop={12}>
            <Ionicons
              name="refresh"
              size={22}
              color={generating ? theme.color.surfaceTertiary : theme.color.brand}
            />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
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
          {mode === "group" ? (
            <Pressable style={styles.generateBtn} onPress={generateForGroup} disabled={generating} testID="generate-btn">
              {generating ? (
                <ActivityIndicator color={theme.color.onBrand} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color={theme.color.onBrand} />
                  <Text style={styles.generateBtnText}>GERAR TREINO COM IA</Text>
                </>
              )}
            </Pressable>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {plan.is_custom && plan.muscle_groups.length > 0 ? (
            <View style={styles.groupPills}>
              {plan.muscle_groups.map((g) => (
                <View key={g} style={styles.groupPill}>
                  <Text style={styles.groupPillText}>{GROUP_LABEL[g] ?? g}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {plan.exercises.map((ex, idx) => {
            const key = `${idx}-${ex.name}`;
            const isOpen = expanded[key];
            const last = lastMap[ex.name];
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
                    <View style={styles.badgeRow}>
                     {ex.exercise_type ? (
                     <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {ex.exercise_type === "compound" ? "Composto" : "Isolado"}
                           </Text>
                         </View>
                         ) : null}

                          {ex.emphasis ? (
                           <View style={styles.badge}>
                          <Text style={styles.badgeText}>Ênfase: {ex.emphasis}</Text>
                             </View>
                             ) : null}

                              {ex.is_unilateral ? (
                                    <View style={styles.badge}>
                                     <Text style={styles.badgeText}>Unilateral</Text>
                                      </View>
                                ) : null}
                               </View>
                    <Text style={styles.exMeta}>
                      {ex.sets} séries · {ex.reps} reps · {ex.rest_seconds}s descanso
                    </Text>
                    {last?.has_history ? (
                      <Text style={styles.lastLine} testID={`last-${idx}`}>
                        Última: {last.max_weight}kg máx · {last.sets?.length ?? 0} séries
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.color.onSurfaceSecondary}
                  />
                </Pressable>
                {isOpen && (
                  <View style={styles.exBody}>
                    {last?.has_history ? (
                      <View style={styles.lastBox} testID={`last-box-${idx}`}>
                        <View style={styles.lastHeader}>
                          <Ionicons name="trophy" size={16} color={theme.color.brand} />
                          <Text style={styles.lastTitle}>ÚLTIMA SESSÃO · {formatDate(last.date!)}</Text>
                        </View>
                        {last.sets?.map((s) => (
                          <View key={s.set_number} style={styles.lastRow}>
                            <Text style={styles.lastSetLabel}>Série {s.set_number}</Text>
                            <Text style={styles.lastSetVal}>
                              {s.weight_kg}kg × {s.reps} reps
                            </Text>
                          </View>
                        ))}
                        <Text style={styles.beatHint}>Meta hoje: superar {last.max_weight}kg!</Text>
                      </View>
                    ) : null}

                    <View style={styles.tipBox}>
                      <Ionicons name="bulb" size={16} color={theme.color.warning} />
                      <Text style={styles.tipText}>{ex.tips}</Text>
                    </View>

                    <View style={styles.restRow}>
                      <Text style={styles.eqText}>Equipamento: {ex.equipment}</Text>
                      <Pressable
                        onPress={() => setEditingRest({ index: idx, value: ex.rest_seconds.toString() })}
                        style={styles.editRestBtn}
                        testID={`edit-rest-${idx}`}
                      >
                        <Ionicons name="timer-outline" size={14} color={theme.color.brand} />
                        <Text style={styles.editRestText}>Descanso {ex.rest_seconds}s</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      style={styles.logBtn}
                      onPress={() => setLogModal({ index: idx, exercise: ex })}
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
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      )}

      <LogSetModal
        visible={!!logModal}
        exercise={logModal?.exercise ?? null}
        muscleGroup={plan?.muscle_groups?.[0] ?? "custom"}
        onClose={() => setLogModal(null)}
        onSaved={onLogSaved}
        token={token}
      />

      <EditRestModal
        visible={!!editingRest}
        value={editingRest?.value ?? ""}
        onChange={(v) => setEditingRest((prev) => (prev ? { ...prev, value: v } : prev))}
        onClose={() => setEditingRest(null)}
        onSave={saveRest}
      />
    </SafeAreaView>
  );
}

function LogSetModal({
  visible,
  exercise,
  muscleGroup,
  onClose,
  onSaved,
  token,
}: {
  visible: boolean;
  exercise: Exercise | null;
  muscleGroup: string;
  onClose: () => void;
  onSaved: (exerciseName: string) => void;
  token: string | null;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNum, setSetNum] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setWeight("");
      setReps("");
      setSetNum("1");
      setErr(null);
    }
  }, [visible]);

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
      onSaved(exercise.name);
    } catch {
      setErr("Erro de rede.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.backdrop}>
        <View style={modalStyles.sheet} testID="log-modal">
          <View style={modalStyles.grabber} />
          <Text style={modalStyles.title}>Registrar série</Text>
          <Text style={modalStyles.exName}>{exercise?.name}</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Série</Text>
              <TextInput testID="input-set-number" value={setNum} onChangeText={setSetNum} keyboardType="numeric" style={modalStyles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Reps</Text>
              <TextInput testID="input-reps" value={reps} onChangeText={setReps} keyboardType="numeric" style={modalStyles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.label}>Carga (kg)</Text>
              <TextInput testID="input-weight" value={weight} onChangeText={setWeight} keyboardType="numeric" style={modalStyles.input} />
            </View>
          </View>
          {err ? <Text style={modalStyles.err}>{err}</Text> : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose} testID="log-cancel">
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={modalStyles.saveBtn} onPress={save} disabled={saving || !weight || !reps} testID="log-save">
              {saving ? <ActivityIndicator color={theme.color.onBrand} /> : <Text style={modalStyles.saveText}>SALVAR</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditRestModal({
  visible,
  value,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.backdrop}>
        <View style={modalStyles.sheet} testID="rest-modal">
          <View style={modalStyles.grabber} />
          <Text style={modalStyles.title}>Ajustar descanso</Text>
          <Text style={modalStyles.label}>Segundos entre séries</Text>
          <TextInput
            testID="input-rest"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            style={[modalStyles.input, { fontSize: 22 }]}
          />
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose} testID="rest-cancel">
              <Text style={modalStyles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={modalStyles.saveBtn} onPress={onSave} testID="rest-save">
              <Text style={modalStyles.saveText}>SALVAR</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
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
    gap: theme.spacing.md,
  },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: 0.5, flex: 1, textAlign: "center" },
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
  groupPills: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  groupPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTertiary,
  },
  groupPillText: { color: theme.color.brand, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
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
  lastLine: { color: theme.color.brand, fontSize: 11, marginTop: 3, fontWeight: "700" },
  exBody: { padding: theme.spacing.lg, paddingTop: 0, gap: theme.spacing.md },
  lastBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.brand,
    gap: 4,
  },
  lastHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  lastTitle: { color: theme.color.brand, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  lastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  lastSetLabel: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  lastSetVal: { color: theme.color.onSurface, fontSize: 12, fontWeight: "700" },
  beatHint: { color: theme.color.warning, fontSize: 11, fontWeight: "700", marginTop: theme.spacing.xs },
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
  restRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eqText: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  editRestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.brand,
  },
  editRestText: { color: theme.color.brand, fontSize: 11, fontWeight: "700" },
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
  ,

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
   },

badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTertiary,
},

badgeText: {
    color: theme.color.brand,
    fontSize: 10,
    fontWeight: "800",
},

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
  label: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: theme.spacing.xs,
    fontWeight: "700",
  },
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
