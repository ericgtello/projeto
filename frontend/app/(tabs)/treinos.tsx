import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { theme } from "@/src/theme";
import { apiFetch, useAuth } from "@/src/auth";

const MUSCLE_GROUPS = [
  { id: "peito", label: "Peito", icon: "body" as const },
  { id: "costas", label: "Costas", icon: "body-outline" as const },
  { id: "pernas", label: "Pernas", icon: "walk" as const },
  { id: "ombros", label: "Ombros", icon: "fitness" as const },
  { id: "bracos", label: "Braços", icon: "barbell" as const },
  { id: "abdomen", label: "Abdômen", icon: "flame" as const },
];

const GROUP_LABEL: Record<string, string> = {
  peito: "Peito",
  costas: "Costas",
  pernas: "Pernas",
  ombros: "Ombros",
  bracos: "Braços",
  abdomen: "Abdômen",
};

type Plan = { id: string; name?: string | null; muscle_groups: string[] };

export default function TreinosScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [customPlans, setCustomPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/workout/plans/custom", token);
      if (res.ok) setCustomPlans(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TREINOS</Text>
          <Text style={styles.subtitle}>Escolha um grupamento ou monte o seu</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          style={styles.createCard}
          onPress={() => router.push("/treino/create")}
          testID="create-custom-btn"
        >
          <View style={styles.createIcon}>
            <Ionicons name="add" size={28} color={theme.color.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.createTitle}>Criar treino personalizado</Text>
            <Text style={styles.createDesc}>Combine 2 ou mais grupamentos (ex: peito + ombro + tríceps)</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.color.brand} />
        </Pressable>

        {loading ? (
          <ActivityIndicator color={theme.color.brand} style={{ marginVertical: 20 }} />
        ) : customPlans.length > 0 ? (
          <>
            <Text style={styles.section}>MEUS TREINOS PERSONALIZADOS</Text>
            {customPlans.map((p) => (
              <Pressable
                key={p.id}
                testID={`custom-${p.id}`}
                style={styles.card}
                onPress={() => router.push(`/treino/plan/${p.id}`)}
              >
                <View style={styles.cardIconAlt}>
                  <Ionicons name="star" size={20} color={theme.color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{p.name || p.muscle_groups.map((g) => GROUP_LABEL[g] ?? g).join(" + ")}</Text>
                  <Text style={styles.cardDesc}>{p.muscle_groups.length} grupamentos</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.color.onSurfaceSecondary} />
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>POR GRUPAMENTO</Text>
        {MUSCLE_GROUPS.map((g) => (
          <Pressable
            key={g.id}
            testID={`muscle-${g.id}`}
            style={styles.card}
            onPress={() => router.push(`/treino/${g.id}`)}
          >
            <View style={styles.cardIcon}>
              <Ionicons name={g.icon} size={24} color={theme.color.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{g.label}</Text>
              <Text style={styles.cardDesc}>Ver / gerar treino</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.color.onSurfaceSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: theme.color.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.color.brandTertiary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.brand,
  },
  createIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.brand,
  },
  createTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "800" },
  createDesc: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  section: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: theme.spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.brandTertiary,
  },
  cardIconAlt: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.surfaceTertiary,
  },
  cardTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700" },
  cardDesc: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
