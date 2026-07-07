import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LineChart } from "react-native-gifted-charts";

import { apiFetch, useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

type Tab = "cargas" | "peso";

type WorkoutLog = {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  set_number: number;
  date: string;
};

type WeightLog = { id: string; weight_kg: number; date: string };

const SCREEN_W = Dimensions.get("window").width;

export default function ProgressoScreen() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("cargas");
  const [exercises, setExercises] = useState<string[]>([]);
  const [selectedEx, setSelectedEx] = useState<string | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, wRes] = await Promise.all([
        apiFetch("/api/workout/logs/exercises", token),
        apiFetch("/api/weight/logs", token),
      ]);
      let exs: string[] = [];
      if (exRes.ok) {
        exs = await exRes.json();
        setExercises(exs);
      }
      if (wRes.ok) setWeightLogs(await wRes.json());
      const chosen = selectedEx && exs.includes(selectedEx) ? selectedEx : exs[0] || null;
      setSelectedEx(chosen);
      if (chosen) {
        const logRes = await apiFetch(`/api/workout/logs?exercise=${encodeURIComponent(chosen)}`, token);
        if (logRes.ok) setWorkoutLogs(await logRes.json());
      } else {
        setWorkoutLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, selectedEx]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectExercise = async (name: string) => {
    setSelectedEx(name);
    const res = await apiFetch(`/api/workout/logs?exercise=${encodeURIComponent(name)}`, token);
    if (res.ok) setWorkoutLogs(await res.json());
  };

  const weightChart = useMemo(() => {
    if (!weightLogs.length) return [];
    return weightLogs.map((l) => ({ value: l.weight_kg, label: fmtDay(l.date) }));
  }, [weightLogs]);

  const cargaChart = useMemo(() => {
    if (!workoutLogs.length) return { weight: [], reps: [] };
    // aggregate by date (max carga per day, sum reps)
    const by: Record<string, { weight: number; reps: number }> = {};
    workoutLogs.forEach((l) => {
      const d = l.date.slice(0, 10);
      if (!by[d]) by[d] = { weight: 0, reps: 0 };
      by[d].weight = Math.max(by[d].weight, l.weight_kg);
      by[d].reps += l.reps;
    });
    const dates = Object.keys(by).sort();
    return {
      weight: dates.map((d) => ({ value: by[d].weight, label: fmtDayFromDate(d) })),
      reps: dates.map((d) => ({ value: by[d].reps, label: fmtDayFromDate(d) })),
    };
  }, [workoutLogs]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>PROGRESSO</Text>
        <Text style={styles.subtitle}>Sua evolução ao longo das semanas</Text>
      </View>

      <View style={styles.tabRow}>
        {(["cargas", "peso"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            testID={`tab-${t}`}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "cargas" ? "CARGAS" : "PESO CORPORAL"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : tab === "cargas" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {exercises.length === 0 ? (
            <EmptyState
              icon="bar-chart-outline"
              title="Sem registros ainda"
              desc="Registre séries nos treinos para ver sua evolução aqui."
            />
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {exercises.map((ex) => (
                  <Pressable
                    key={ex}
                    onPress={() => selectExercise(ex)}
                    style={[styles.chip, selectedEx === ex && styles.chipActive]}
                    testID={`ex-chip-${ex}`}
                  >
                    <Text
                      style={[styles.chipText, selectedEx === ex && styles.chipTextActive]}
                      numberOfLines={1}
                    >
                      {ex}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <ChartCard title="CARGA MÁX / DIA (kg)" data={cargaChart.weight} color={theme.color.brand} />
              <ChartCard title="REPETIÇÕES TOTAIS / DIA" data={cargaChart.reps} color={theme.color.success} />
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>ÚLTIMAS SÉRIES</Text>
                {[...workoutLogs].reverse().slice(0, 5).map((l) => (
                  <View key={l.id} style={styles.statsRow}>
                    <Text style={styles.statsDate}>{fmtDate(l.date)}</Text>
                    <Text style={styles.statsVal}>
                      {l.weight_kg}kg × {l.reps} reps · série {l.set_number}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {weightChart.length === 0 ? (
            <EmptyState
              icon="scale-outline"
              title="Sem histórico de peso"
              desc="Registre seu peso no perfil para acompanhar a evolução."
            />
          ) : (
            <>
              <ChartCard title="PESO CORPORAL (kg)" data={weightChart} color={theme.color.brand} />
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>HISTÓRICO</Text>
                {[...weightLogs].reverse().slice(0, 8).map((l) => (
                  <View key={l.id} style={styles.statsRow}>
                    <Text style={styles.statsDate}>{fmtDate(l.date)}</Text>
                    <Text style={styles.statsVal}>{l.weight_kg} kg</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ChartCard({ title, data, color }: { title: string; data: any[]; color: string }) {
  if (!data.length) return null;
  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title}</Text>
      <LineChart
        data={data}
        thickness={3}
        color={color}
        hideRules
        yAxisColor={theme.color.border}
        xAxisColor={theme.color.border}
        xAxisLabelTextStyle={{ color: theme.color.onSurfaceSecondary, fontSize: 10 }}
        yAxisTextStyle={{ color: theme.color.onSurfaceSecondary, fontSize: 10 }}
        dataPointsColor={color}
        dataPointsRadius={4}
        curved
        initialSpacing={16}
        spacing={Math.max(30, (SCREEN_W - 100) / Math.max(1, data.length))}
        noOfSections={4}
        adjustToWidth
        areaChart
        startFillColor={color}
        endFillColor={color}
        startOpacity={0.35}
        endOpacity={0.02}
        backgroundColor="transparent"
        height={180}
      />
    </View>
  );
}

function EmptyState({ icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name={icon} size={44} color={theme.color.surfaceTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
function fmtDayFromDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(day)}/${Number(m)}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  tabBtnActive: { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brand },
  tabText: { color: theme.color.onSurfaceSecondary, fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  tabTextActive: { color: theme.color.brand },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  chipRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
    justifyContent: "center",
    maxWidth: 220,
  },
  chipActive: { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brand },
  chipText: { color: theme.color.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: theme.color.brand },
  chartCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    overflow: "hidden",
  },
  chartTitle: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
  },
  statsCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.spacing.lg,
  },
  statsTitle: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider,
  },
  statsDate: { color: theme.color.onSurfaceSecondary, fontSize: 13 },
  statsVal: { color: theme.color.onSurface, fontSize: 13, fontWeight: "700" },
  emptyBox: { alignItems: "center", padding: theme.spacing.xxl, gap: theme.spacing.sm },
  emptyTitle: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginTop: theme.spacing.md },
  emptyDesc: { color: theme.color.onSurfaceSecondary, fontSize: 13, textAlign: "center" },
});
