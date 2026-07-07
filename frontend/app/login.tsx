import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { theme } from "@/src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalize = useCallback(
    async (sessionId: string) => {
      setLoading(true);
      try {
        const u = await signIn(sessionId);
        if (!u) {
          setError("Falha ao autenticar. Tente novamente.");
          return;
        }
        if (!u.onboarded) router.replace("/onboarding");
        else router.replace("/(tabs)");
      } catch (e) {
        setError("Erro ao conectar com o servidor.");
      } finally {
        setLoading(false);
      }
    },
    [signIn, router],
  );

  // Web: handle session_id in URL hash on mount
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const src = hash.startsWith("#") ? hash.slice(1) : search.startsWith("?") ? search.slice(1) : "";
      const params = new URLSearchParams(src);
      const sid = params.get("session_id");
      if (sid) {
        window.history.replaceState(null, "", window.location.pathname);
        finalize(sid);
      }
    } catch {
      /* noop */
    }
  }, [finalize]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (!user.onboarded) router.replace("/onboarding");
      else router.replace("/(tabs)");
    }
  }, [user, router]);

  const handleLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        const redirect = window.location.origin + "/login";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
        return;
      }
      const redirectUrl = Linking.createURL("login");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) {
        setLoading(false);
        return;
      }
      // parse session_id from url
      const url = result.url;
      const hashIdx = url.indexOf("#");
      const queryIdx = url.indexOf("?");
      let paramStr = "";
      if (hashIdx !== -1) paramStr = url.slice(hashIdx + 1);
      else if (queryIdx !== -1) paramStr = url.slice(queryIdx + 1);
      const params = new URLSearchParams(paramStr);
      const sid = params.get("session_id");
      if (!sid) {
        setError("Não recebemos o session_id.");
        setLoading(false);
        return;
      }
      await finalize(sid);
    } catch (e) {
      setError("Erro ao abrir o navegador de login.");
      setLoading(false);
    }
  }, [finalize]);

  return (
    <View style={styles.container} testID="login-screen">
      <View style={styles.hero}>
        <View style={styles.logoBadge}>
          <Ionicons name="barbell" size={44} color={theme.color.brand} />
        </View>
        <Text style={styles.brand}>FITJOURNEY</Text>
        <Text style={styles.tagline}>Treinos e nutrição sob medida para você.</Text>
      </View>

      <View style={styles.bottom}>
        {error ? (
          <View style={styles.errorBox} testID="login-error">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          testID="login-google-button"
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.color.onBrand} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={theme.color.onBrand} />
              <Text style={styles.buttonText}>Entrar com Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>Ao continuar, você concorda com os termos de uso.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface, padding: theme.spacing.xl, justifyContent: "space-between" },
  hero: { flex: 1, alignItems: "flex-start", justifyContent: "center" },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.brand,
  },
  brand: {
    color: theme.color.onSurface,
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: 2,
  },
  tagline: {
    color: theme.color.onSurfaceSecondary,
    fontSize: 16,
    marginTop: theme.spacing.sm,
    maxWidth: 280,
  },
  bottom: { gap: theme.spacing.md },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.color.brand,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.md,
    minHeight: 56,
  },
  buttonText: { color: theme.color.onBrand, fontSize: 16, fontWeight: "700" },
  hint: { color: theme.color.onSurfaceSecondary, fontSize: 12, textAlign: "center" },
  errorBox: {
    borderColor: theme.color.error,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: "#3a0a08",
  },
  errorText: { color: theme.color.error, fontSize: 13 },
});
