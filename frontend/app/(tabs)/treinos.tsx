import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";

import { theme } from "@/src/theme";

const MUSCLE_GROUPS = [
  { id: "peito", label: "Peito", icon: "body" as const, color: "#FF5900" },
  { id: "costas", label: "Costas", icon: "body-outline" as const, color: "#FF7A33" },
  { id: "pernas", label: "Pernas", icon: "walk" as const, color: "#FF5900" },
  { id: "ombros", label: "Ombros", icon: "fitness" as const, color: "#FF7A33" },
  { id: "bracos", label: "Braços", icon: "barbell" as const, color: "#FF5900" },
  { id: "abdomen", label: "Abdômen", icon: "flame" as const, color: "#FF7A33" },
];

export default function TreinosScreen() {
  const router = useRouter();
  const [key, setKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setKey((k) => k + 1);
    }, []),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TREINOS</Text>
          <Text style={styles.subtitle}>Escolha o grupamento muscular</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} key={key}>
        {MUSCLE_GROUPS.map((g) => (
          <Pressable
            key={g.id}
            testID={`muscle-${g.id}`}
            style={styles.card}
            onPress={() => router.push(`/treino/${g.id}`)}
          >
            <View style={[styles.cardIcon, { backgroundColor: theme.color.brandTertiary }]}>
              <Ionicons name={g.icon} size={24} color={g.color} />
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
  },
  cardTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700" },
  cardDesc: { color: theme.color.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
