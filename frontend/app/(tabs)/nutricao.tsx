import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type Food = {
  id?: string;
  name: string;
  quantity: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  substitutions: string[];
};

type Meal = { id?: string; name: string; time: string; foods: Food[] };
type Diet = {
  id: string;
  total_kcal: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  tmb?: number;
  tdee?: number;
  kcal_target_reason?: string;
  meals: Meal[];
};

export default function NutricaoScreen() {
  const { token } = useAuth();
  const [diet, setDiet] = useState<Diet | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subFood, setSubFood] = useState<{ meal: number; food: number } | null>(null);
  const [editFood, setEditFood] = useState<{ meal: number; food: number } | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [rebalanceInfo, setRebalanceInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/diet/current", token);
      if (res.status === 404) setDiet(null);
      else if (res.ok) setDiet(await res.json());
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/diet/generate", token, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Falha ao gerar dieta.");
        return;
      }
      setDiet(await res.json());
    } catch {
      setError("Erro de rede.");
    } finally {
      setGenerating(false);
    }
  };

  const swapFood = (mealIdx: number, foodIdx: number, newName: string) => {
    if (!diet) return;
    const updated = {
      ...diet,
      meals: diet.meals.map((m, i) =>
        i === mealIdx
          ? { ...m, foods: m.foods.map((f, j) => (j === foodIdx ? { ...f, name: newName } : f)) }
          : m,
      ),
    };
    setDiet(updated);
    setSubFood(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>NUTRIÇÃO</Text>
          <Text style={styles.subtitle}>Seu plano alimentar do dia</Text>
        </View>
        {diet ? (
          <Pressable onPress={generate} disabled={generating} testID="regen-diet" hitSlop={12}>
            <Ionicons name="refresh" size={22} color={generating ? theme.color.surfaceTertiary : theme.color.brand} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : !diet ? (
        <View style={styles.center}>
          <Ionicons name="restaurant-outline" size={48} color={theme.color.surfaceTertiary} />
          <Text style={styles.emptyTitle}>Nenhum plano alimentar</Text>
          <Text style={styles.emptyDesc}>Gere um plano personalizado com IA baseado no seu objetivo.</Text>
          <Pressable style={styles.generateBtn} onPress={generate} disabled={generating} testID="generate-diet">
            {generating ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={theme.color.onBrand} />
                <Text style={styles.generateBtnText}>GERAR DIETA COM IA</Text>
              </>
            )}
          </Pressable>
          {error ? <Text style={styles.errText}>{error}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.macroBox}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={styles.macroKcal}>
                <Text style={styles.macroKcalVal}>{Math.round(diet.total_kcal)}</Text>
                <Text style={styles.macroKcalLabel}>KCAL / DIA</Text>
              </View>
              <Pressable
                onPress={() => setShowExplanation(true)}
                style={styles.whyBtn}
                testID="why-btn"
                hitSlop={8}
              >
                <Ionicons name="information-circle" size={16} color={theme.color.brand} />
                <Text style={styles.whyText}>Por quê?</Text>
              </Pressable>
            </View>
            <View style={styles.macroRow}>
              <MacroPill label="P" value={diet.total_protein} color="#FF5900" />
              <MacroPill label="C" value={diet.total_carbs} color="#00E676" />
              <MacroPill label="G" value={diet.total_fat} color="#FFD600" />
            </View>
          </View>

          {rebalanceInfo ? (
            <View style={styles.rebalanceBar} testID="rebalance-info">
              <Ionicons name="checkmark-circle" size={16} color={theme.color.success} />
              <Text style={styles.rebalanceText}>{rebalanceInfo}</Text>
              <Pressable onPress={() => setRebalanceInfo(null)} hitSlop={8}>
                <Ionicons name="close" size={16} color={theme.color.onSurfaceSecondary} />
              </Pressable>
            </View>
          ) : null}

          {diet.meals.map((meal, mi) => (
            <View key={mi} style={styles.mealCard} testID={`meal-${mi}`}>
              <View style={styles.mealHeader}>
                <View>
                  <Text style={styles.mealName}>{meal.name}</Text>
                  <Text style={styles.mealTime}>{meal.time}</Text>
                </View>
                <View style={styles.mealKcalPill}>
                  <Text style={styles.mealKcalText}>
                    {Math.round(meal.foods.reduce((s, f) => s + f.kcal, 0))} kcal
                  </Text>
                </View>
              </View>
              <View style={styles.foodList}>
                {meal.foods.map((f, fi) => (
                  <View key={fi} style={styles.foodRow} testID={`food-${mi}-${fi}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName}>{f.name}</Text>
                      <Text style={styles.foodQty}>{f.quantity}</Text>
                      <Text style={styles.foodMacros}>
                        {Math.round(f.kcal)} kcal · P{Math.round(f.protein)} C{Math.round(f.carbs)} G{Math.round(f.fat)}
                      </Text>
                    </View>
                    <View style={styles.actionCol}>
                      <Pressable
                        onPress={() => setEditFood({ meal: mi, food: fi })}
                        style={styles.actionBtn}
                        testID={`edit-food-${mi}-${fi}`}
                        hitSlop={6}
                      >
                        <Ionicons name="create-outline" size={16} color={theme.color.brand} />
                      </Pressable>
                      {f.substitutions?.length > 0 ? (
                        <Pressable
                          onPress={() => setSubFood({ meal: mi, food: fi })}
                          style={styles.actionBtn}
                          testID={`swap-btn-${mi}-${fi}`}
                          hitSlop={6}
                        >
                          <Ionicons name="swap-horizontal" size={16} color={theme.color.brand} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Substitution modal */}
      <Modal visible={!!subFood} transparent animationType="slide" onRequestClose={() => setSubFood(null)}>
        <View style={subStyles.backdrop}>
          <View style={subStyles.sheet}>
            <View style={subStyles.grabber} />
            <Text style={subStyles.title}>Substituir alimento</Text>
            <Text style={subStyles.original}>
              {subFood && diet ? diet.meals[subFood.meal].foods[subFood.food].name : ""}
            </Text>
            <ScrollView>
              {subFood && diet
                ? diet.meals[subFood.meal].foods[subFood.food].substitutions.map((s, idx) => (
                    <Pressable
                      key={idx}
                      style={subStyles.subOption}
                      onPress={() => swapFood(subFood.meal, subFood.food, s)}
                      testID={`sub-option-${idx}`}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color={theme.color.brand} />
                      <Text style={subStyles.subText}>{s}</Text>
                    </Pressable>
                  ))
                : null}
            </ScrollView>
            <Pressable style={subStyles.close} onPress={() => setSubFood(null)} testID="sub-close">
              <Text style={subStyles.closeText}>FECHAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Edit quantity + rebalance modal */}
      <EditQuantityModal
        visible={!!editFood}
        food={editFood && diet ? diet.meals[editFood.meal].foods[editFood.food] : null}
        mealName={editFood && diet ? diet.meals[editFood.meal].name : ""}
        onClose={() => setEditFood(null)}
        token={token}
        onRebalanced={(newDiet, explanation) => {
          setDiet(newDiet);
          setRebalanceInfo(explanation);
          setEditFood(null);
        }}
        mealIndex={editFood?.meal ?? 0}
        foodIndex={editFood?.food ?? 0}
      />

      {/* Explanation modal */}
      <Modal
        visible={showExplanation}
        transparent
        animationType="slide"
        onRequestClose={() => setShowExplanation(false)}
      >
        <View style={subStyles.backdrop}>
          <View style={subStyles.sheet}>
            <View style={subStyles.grabber} />
            <Text style={subStyles.title}>Como chegamos a essas calorias?</Text>
            <ScrollView style={{ marginTop: theme.spacing.md }}>
              {diet?.tmb ? (
                <View style={explainStyles.row}>
                  <Text style={explainStyles.label}>Taxa Metabólica Basal (TMB)</Text>
                  <Text style={explainStyles.val}>{Math.round(diet.tmb)} kcal</Text>
                </View>
              ) : null}
              {diet?.tdee ? (
                <View style={explainStyles.row}>
                  <Text style={explainStyles.label}>Gasto Energético Total (GET)</Text>
                  <Text style={explainStyles.val}>{Math.round(diet.tdee)} kcal</Text>
                </View>
              ) : null}
              <View style={explainStyles.row}>
                <Text style={explainStyles.label}>Alvo diário</Text>
                <Text style={[explainStyles.val, { color: theme.color.brand }]}>
                  {Math.round(diet?.total_kcal ?? 0)} kcal
                </Text>
              </View>
              <Text style={explainStyles.text}>
                {diet?.kcal_target_reason || "Explicação não disponível para este plano."}
              </Text>
            </ScrollView>
            <Pressable style={subStyles.close} onPress={() => setShowExplanation(false)} testID="explain-close">
              <Text style={subStyles.closeText}>FECHAR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EditQuantityModal({
  visible,
  food,
  mealName,
  mealIndex,
  foodIndex,
  onClose,
  token,
  onRebalanced,
}: {
  visible: boolean;
  food: Food | null;
  mealName: string;
  mealIndex: number;
  foodIndex: number;
  onClose: () => void;
  token: string | null;
  onRebalanced: (diet: Diet, explanation: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!food) return;
    if (!qty.trim()) {
      setErr("Informe a nova quantidade.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/diet/rebalance", token, {
        method: "POST",
        body: JSON.stringify({
          meal_index: mealIndex,
          food_index: foodIndex,
          new_quantity: qty.trim(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setErr(e.detail || "Falha ao rebalancear.");
        return;
      }
      const data = await res.json();
      onRebalanced(data.plan, data.explanation || "Plano rebalanceado.");
      setQty("");
    } catch {
      setErr("Erro de rede.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={subStyles.backdrop}>
        <View style={subStyles.sheet}>
          <View style={subStyles.grabber} />
          <Text style={subStyles.title}>Alterar quantidade</Text>
          <Text style={subStyles.original}>
            {food?.name} · {mealName}
          </Text>
          <Text style={editStyles.hint}>
            Quantidade atual: <Text style={{ color: theme.color.onSurface, fontWeight: "700" }}>{food?.quantity}</Text>
          </Text>
          <Text style={editStyles.label}>Nova quantidade</Text>
          <TextInput
            testID="input-new-qty"
            value={qty}
            onChangeText={setQty}
            placeholder="Ex: 200 g"
            placeholderTextColor={theme.color.surfaceTertiary}
            style={editStyles.input}
          />
          <Text style={editStyles.explain}>
            A IA vai recalcular os macros deste alimento e ajustar as demais refeições para manter o mesmo total calórico
            do dia.
          </Text>
          {err ? <Text style={editStyles.err}>{err}</Text> : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Pressable style={editStyles.cancelBtn} onPress={onClose} testID="edit-cancel" disabled={saving}>
              <Text style={editStyles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[editStyles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={submit}
              disabled={saving}
              testID="edit-save"
            >
              {saving ? (
                <ActivityIndicator color={theme.color.onBrand} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color={theme.color.onBrand} />
                  <Text style={editStyles.saveText}>REBALANCEAR</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroPillValue}>{Math.round(value)}g</Text>
      <Text style={styles.macroPillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md },
  emptyTitle: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginTop: theme.spacing.md },
  emptyDesc: { color: theme.color.onSurfaceSecondary, textAlign: "center", fontSize: 13 },
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
  errText: { color: theme.color.error, textAlign: "center", marginTop: theme.spacing.md },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  macroBox: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.spacing.md,
  },
  macroKcal: {},
  macroKcalVal: { color: theme.color.brand, fontSize: 40, fontWeight: "900" },
  macroKcalLabel: { color: theme.color.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "700" },
  whyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.brand,
    backgroundColor: theme.color.brandTertiary,
  },
  whyText: { color: theme.color.brand, fontSize: 11, fontWeight: "800" },
  macroRow: { flexDirection: "row", gap: theme.spacing.sm },
  macroPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroPillValue: { color: theme.color.onSurface, fontWeight: "800", fontSize: 14 },
  macroPillLabel: { color: theme.color.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  rebalanceBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.success,
    backgroundColor: "#052e1a",
  },
  rebalanceText: { flex: 1, color: theme.color.onSurface, fontSize: 12, lineHeight: 17 },
  mealCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: "hidden",
  },
  mealHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider,
  },
  mealName: { color: theme.color.onSurface, fontSize: 16, fontWeight: "800" },
  mealTime: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  mealKcalPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTertiary,
  },
  mealKcalText: { color: theme.color.brand, fontSize: 11, fontWeight: "800" },
  foodList: { padding: theme.spacing.md },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider,
  },
  foodName: { color: theme.color.onSurface, fontSize: 14, fontWeight: "600" },
  foodQty: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  foodMacros: { color: theme.color.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  actionCol: { gap: theme.spacing.xs },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});

const subStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.color.surfaceSecondary,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    maxHeight: "80%",
    gap: theme.spacing.sm,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surfaceTertiary, alignSelf: "center" },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800" },
  original: { color: theme.color.brand, fontSize: 14, fontWeight: "700" },
  subOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    marginBottom: theme.spacing.sm,
  },
  subText: { flex: 1, color: theme.color.onSurface, fontSize: 14, fontWeight: "600" },
  close: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center",
  },
  closeText: { color: theme.color.onSurface, fontWeight: "800", letterSpacing: 1 },
});

const explainStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider,
  },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 13 },
  val: { color: theme.color.onSurface, fontSize: 15, fontWeight: "800" },
  text: {
    color: theme.color.onSurfaceTertiary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.md,
  },
});

const editStyles = StyleSheet.create({
  hint: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: theme.spacing.sm },
  label: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.color.surface,
    color: theme.color.onSurface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: 18,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  explain: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: theme.spacing.sm,
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
    flexDirection: "row",
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: theme.color.onBrand, fontWeight: "800", letterSpacing: 1 },
});
