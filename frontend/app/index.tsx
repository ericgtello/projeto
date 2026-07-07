import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // gate handled in render
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.container} testID="auth-loading">
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (!user.onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
