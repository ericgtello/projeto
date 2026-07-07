import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth, apiFetch } from "@/src/auth";
import { theme } from "@/src/theme";

type Step = 0 | 1 | 2 | 3;

type EquipmentItem = { id: string; name: string };

export default function OnboardingScreen() {
  const router = useRouter();
  const { token, refresh } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);

  const [goal, setGoal] = useState<"emagrecimento" | "hipertrofia" | null>(null);
  const [sex, setSex] = useState<"M" | "F" | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [deadlineWeeks, setDeadlineWeeks] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentItem[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const toggleEquipment = useCallback((id: string) => {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const canProceed = () => {
    if (step === 0) return goal !== null;
    if (step === 1) return sex !== null && !!age && !!height && !!currentWeight;
    if (step === 2) return !!targetWeight && !!deadlineWeeks && !!activity;
    if (step === 3) return equipment.length > 0;
    return false;
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        goal,
        sex,
        age: Number(age),
        height: Number(height),
        current_weight: Number(currentWeight),
        target_weight: Number(targetWeight),
        deadline_weeks: Number(deadlineWeeks),
        activity_level: activity,
        equipment,
        onboarded: true,
      };
      const res = await apiFetch("/api/profile", token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Não foi possível salvar seu perfil.");
        return;
      }
      // seed initial weight log
      await apiFetch("/api/weight/logs", token, {
        method: "POST",
        body: JSON.stringify({ weight_kg: Number(currentWeight) }),
      });
      await refresh();
      router.replace("/(tabs)");
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!canProceed()) {
      setError("Preencha os campos para continuar.");
      return;
    }
    setError(null);
    if (step < 3) setStep((step + 1) as Step);
    else finish();
  };

  const back = () => {
    setError(null);
    if (step > 0) setStep((step - 1) as Step);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={back} disabled={step === 0} testID="onboarding-back" hitSlop={12}>
          <Ionicons
            name="chevron-back"
            size={26}
            color={step === 0 ? theme.color.surfaceTertiary : theme.color.onSurface}
          />
        </Pressable>
        <View style={styles.progress}>
          {[0, 1, 2, 3].map((s) => (
            <View key={s} style={[styles.dot, step >= s && styles.dotActive]} />
          ))}
        </View>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View>
              <Text style={styles.title}>QUAL SEU OBJETIVO?</Text>
              <Text style={styles.subtitle}>Vamos personalizar treinos e dieta para você.</Text>
              <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
                {[
                  { id: "emagrecimento", label: "Emagrecimento", desc: "Perder gordura e definir." },
                  { id: "hipertrofia", label: "Hipertrofia", desc: "Ganhar massa muscular." },
                ].map((opt) => {
                  const selected = goal === (opt.id as any);
                  return (
                    <Pressable
                      key={opt.id}
                      testID={`goal-${opt.id}`}
                      onPress={() => setGoal(opt.id as any)}
                      style={[styles.optionCard, selected && styles.optionCardSelected]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{opt.label}</Text>
                        <Text style={styles.optionDesc}>{opt.desc}</Text>
                      </View>
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={26}
                        color={selected ? theme.color.brand : theme.color.borderStrong}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.title}>SEUS DADOS</Text>
              <Text style={styles.subtitle}>Usaremos para calcular treinos e macros.</Text>
              <View style={styles.chipRow}>
                {(["M", "F"] as const).map((s) => (
                  <Pressable
                    key={s}
                    testID={`sex-${s}`}
                    onPress={() => setSex(s)}
                    style={[styles.chip, sex === s && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, sex === s && styles.chipTextActive]}>
                      {s === "M" ? "Masculino" : "Feminino"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Idade" value={age} onChange={setAge} keyboardType="numeric" testID="input-age" suffix="anos" />
              <Field label="Altura" value={height} onChange={setHeight} keyboardType="numeric" testID="input-height" suffix="cm" />
              <Field
                label="Peso atual"
                value={currentWeight}
                onChange={setCurrentWeight}
                keyboardType="numeric"
                testID="input-current-weight"
                suffix="kg"
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.title}>SUA META</Text>
              <Text style={styles.subtitle}>Onde você quer chegar e em quanto tempo.</Text>
              <Field
                label="Peso alvo"
                value={targetWeight}
                onChange={setTargetWeight}
                keyboardType="numeric"
                testID="input-target-weight"
                suffix="kg"
              />
              <Field
                label="Prazo desejado"
                value={deadlineWeeks}
                onChange={setDeadlineWeeks}
                keyboardType="numeric"
                testID="input-deadline"
                suffix="semanas"
              />
              <Text style={styles.fieldLabel}>Nível de atividade</Text>
              <View style={{ gap: theme.spacing.sm }}>
                {[
                  { id: "sedentario", label: "Sedentário", desc: "Pouco ou nenhum exercício" },
                  { id: "leve", label: "Leve", desc: "1-2x por semana" },
                  { id: "moderado", label: "Moderado", desc: "3-4x por semana" },
                  { id: "intenso", label: "Intenso", desc: "5-6x por semana" },
                ].map((opt) => {
                  const selected = activity === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      testID={`activity-${opt.id}`}
                      onPress={() => setActivity(opt.id)}
                      style={[styles.optionCard, selected && styles.optionCardSelected]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{opt.label}</Text>
                        <Text style={styles.optionDesc}>{opt.desc}</Text>
                      </View>
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={selected ? theme.color.brand : theme.color.borderStrong}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.title}>SUA ACADEMIA</Text>
              <Text style={styles.subtitle}>Marque os equipamentos disponíveis.</Text>
              <View style={styles.equipmentGrid}>
                {equipmentCatalog.map((eq) => {
                  const selected = equipment.includes(eq.id);
                  return (
                    <Pressable
                      key={eq.id}
                      testID={`equipment-${eq.id}`}
                      onPress={() => toggleEquipment(eq.id)}
                      style={[styles.equipmentChip, selected && styles.equipmentChipActive]}
                    >
                      <Ionicons
                        name={selected ? "checkmark-circle" : "add-circle-outline"}
                        size={18}
                        color={selected ? theme.color.brand : theme.color.onSurfaceSecondary}
                      />
                      <Text style={[styles.equipmentText, selected && styles.equipmentTextActive]}>{eq.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {error ? (
            <Text style={styles.errorText} testID="onboarding-error">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="onboarding-next"
            style={[styles.primaryBtn, !canProceed() && styles.primaryBtnDisabled]}
            onPress={next}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>{step === 3 ? "COMEÇAR" : "CONTINUAR"}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
  suffix,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: "numeric" | "default";
  suffix?: string;
  testID?: string;
}) {
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          style={styles.input}
          placeholder="0"
          placeholderTextColor={theme.color.surfaceTertiary}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
    </View>
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
  },
  progress: { flexDirection: "row", gap: 6 },
  dot: { width: 24, height: 4, borderRadius: 2, backgroundColor: theme.color.surfaceTertiary },
  dotActive: { backgroundColor: theme.color.brand },
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  title: {
    color: theme.color.onSurface,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  subtitle: { color: theme.color.onSurfaceSecondary, fontSize: 14 },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    gap: theme.spacing.md,
  },
  optionCardSelected: { borderColor: theme.color.brand, backgroundColor: theme.color.brandTertiary },
  optionTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700" },
  optionDesc: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary,
  },
  chipActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandTertiary },
  chipText: { color: theme.color.onSurfaceSecondary, fontWeight: "600" },
  chipTextActive: { color: theme.color.brand },
  fieldLabel: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 12,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  input: { flex: 1, color: theme.color.onSurface, fontSize: 18, paddingVertical: 14, fontWeight: "600" },
  inputSuffix: { color: theme.color.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  equipmentGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  equipmentChip: {
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
  equipmentChipActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandTertiary },
  equipmentText: { color: theme.color.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  equipmentTextActive: { color: theme.color.brand },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  primaryBtn: {
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  primaryBtnDisabled: { backgroundColor: theme.color.surfaceTertiary },
  primaryBtnText: { color: theme.color.onBrand, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  errorText: { color: theme.color.error, marginTop: theme.spacing.md, textAlign: "center" },
});
