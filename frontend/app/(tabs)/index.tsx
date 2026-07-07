import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { useAuth, apiFetch } from "@/src/auth";
import { theme } from "@/src/theme";

type Progress = {
  has_goal: boolean;
  goal?: string;
  start_weight?: number;
  current_weight?: number;
  target_weight?: number;
  deadline_weeks?: number;
  progress_pct?: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/goal/progress", token);
      if (res.ok) setProgress(await res.json());
    } catch {
      /* noop */
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const kgToLose = progress?.has_goal
    ? Math.abs((progress.current_weight ?? 0) - (progress.target_weight ?? 0))
    : 0;
  const goalIsCut = progress?.goal === "emagrecimento";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.brand} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0] || "Atleta"}</Text>
            <Text style={styles.subhello}>Vamos treinar hoje?</Text>
          </View>
          <Pressable onPress={() => router.push("/perfil")} testID="home-profile-btn" style={styles.avatar}>
            <Ionicons name="person-circle" size={40} color={theme.color.onSurfaceSecondary} />
          </Pressable>
        </View>

        {progress?.has_goal ? (
          <View style={styles.goalCard} testID="goal-card">
            <View style={styles.goalHeader}>
              <View style={styles.goalBadge}>
                <Ionicons
                  name={goalIsCut ? "flame" : "barbell"}
                  size={14}
                  color={theme.color.brand}
                />
                <Text style={styles.goalBadgeText}>
                  {goalIsCut ? "EMAGRECIMENTO" : "HIPERTROFIA"}
                </Text>
              </View>
              <Text style={styles.goalPct}>{progress.progress_pct?.toFixed(0)}%</Text>
            </View>
            <View style={styles.goalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalNumber}>{progress.current_weight?.toFixed(1)} kg</Text>
                <Text style={styles.goalLabel}>ATUAL</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={theme.color.onSurfaceSecondary} />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.goalNumber}>{progress.target_weight?.toFixed(1)} kg</Text>
                <Text style={styles.goalLabel}>META</Text>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress.progress_pct ?? 0}%` }]} />
            </View>
            <Text style={styles.goalHint}>
              Faltam {kgToLose.toFixed(1)} kg em até {progress.deadline_weeks} semanas.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>ATALHOS</Text>
        <View style={styles.grid}>
          <ShortcutCard
            testID="shortcut-treinos"
            icon="barbell"
            label="Meu treino"
            desc="Grupamentos e execução"
            onPress={() => router.push("/(tabs)/treinos")}
          />
          <ShortcutCard
            testID="shortcut-nutricao"
            icon="restaurant"
            label="Dieta"
            desc="Cardápio do dia"
            onPress={() => router.push("/(tabs)/nutricao")}
          />
          <ShortcutCard
            testID="shortcut-progresso"
            icon="trending-up"
            label="Progresso"
            desc="Gráficos e evolução"
            onPress={() => router.push("/(tabs)/progresso")}
          />
          <ShortcutCard
            testID="shortcut-peso"
            icon="scale"
            label="Registrar peso"
            desc="Atualize seu peso"
            onPress={() => router.push("/perfil")}
          />
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="bulb" size={20} color={theme.color.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Dica do dia</Text>
            <Text style={styles.tipDesc}>
              Consistência supera intensidade. Um treino regular a cada 48h traz mais resultado do que
              sessões pesadas esporádicas.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ShortcutCard({
  icon,
  label,
  desc,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  desc: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable style={styles.shortcut} onPress={onPress} testID={testID}>
      <View style={styles.shortcutIcon}>
        <Ionicons name={icon} size={22} color={theme.color.brand} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
      <Text style={styles.shortcutDesc}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hello: { color: theme.color.onSurface, fontSize: 22, fontWeight: "800" },
  subhello: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  avatar: { padding: 2 },
  goalCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.spacing.md,
  },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTertiary,
  },
  goalBadgeText: { color: theme.color.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  goalPct: { color: theme.color.brand, fontSize: 26, fontWeight: "900" },
  goalRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  goalNumber: { color: theme.color.onSurface, fontSize: 24, fontWeight: "800" },
  goalLabel: { color: theme.color.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  progressBar: {
    height: 6,
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: theme.color.brand },
  goalHint: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  sectionTitle: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
  shortcut: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.spacing.sm,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutLabel: { color: theme.color.onSurface, fontSize: 15, fontWeight: "700" },
  shortcutDesc: { color: theme.color.onSurfaceSecondary, fontSize: 12 },
  tipCard: {
    flexDirection: "row",
    gap: theme.spacing.md,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: "flex-start",
  },
  tipTitle: { color: theme.color.onSurface, fontSize: 14, fontWeight: "700" },
  tipDesc: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
});
