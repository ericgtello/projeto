import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type Food = {
  name: string;
  quantity: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  substitutions: string[];
};

type Meal = { name: string; time: string; foods: Food[] };
type Diet = {
  id: string;
  total_kcal: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  meals: Meal[];
};

export default function NutricaoScreen() {
  const { token } = useAuth();
  const [diet, setDiet] = useState<Diet | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subFood, setSubFood] = useState<{ meal: number; food: number } | null>(null);

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
    const updated = { ...diet, meals: diet.meals.map((m, i) => i === mealIdx ? {
      ...m,
      foods: m.foods.map((f, j) => j === foodIdx ? { ...f, name: newName } : f),
    } : m) };
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
            <Ionicons
              name="refresh"
              size={22}
              color={generating ? theme.color.surfaceTertiary : theme.color.brand}
            />
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
            <View style={styles.macroKcal}>
              <Text style={styles.macroKcalVal}>{Math.round(diet.total_kcal)}</Text>
              <Text style={styles.macroKcalLabel}>KCAL / DIA</Text>
            </View>
            <View style={styles.macroRow}>
              <MacroPill label="P" value={diet.total_protein} color="#FF5900" />
              <MacroPill label="C" value={diet.total_carbs} color="#00E676" />
              <MacroPill label="G" value={diet.total_fat} color="#FFD600" />
            </View>
          </View>

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
                    {f.substitutions?.length > 0 ? (
                      <Pressable
                        onPress={() => setSubFood({ meal: mi, food: fi })}
                        style={styles.swapBtn}
                        testID={`swap-btn-${mi}-${fi}`}
                        hitSlop={8}
                      >
                        <Ionicons name="swap-horizontal" size={18} color={theme.color.brand} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={!!subFood}
        transparent
        animationType="slide"
        onRequestClose={() => setSubFood(null)}
      >
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
    </SafeAreaView>
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
  macroKcal: { alignItems: "flex-start" },
  macroKcalVal: { color: theme.color.brand, fontSize: 40, fontWeight: "900" },
  macroKcalLabel: { color: theme.color.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "700" },
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
  swapBtn: {
    width: 36,
    height: 36,
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
    maxHeight: "70%",
    gap: theme.spacing.md,
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
