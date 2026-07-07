import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "fj_session_token";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  goal?: "emagrecimento" | "hipertrofia" | null;
  current_weight?: number | null;
  target_weight?: number | null;
  height?: number | null;
  age?: number | null;
  sex?: "M" | "F" | null;
  activity_level?: string | null;
  deadline_weeks?: number | null;
  equipment?: string[];
  onboarded?: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (sessionId: string) => Promise<User | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<User | null>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  signIn: async () => null,
  signOut: async () => {},
  refresh: async () => null,
  setUser: () => {},
});

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setStoredToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<User | null> => {
    const t = await getStoredToken();
    if (!t) {
      setUser(null);
      setToken(null);
      return null;
    }
    try {
      const res = await fetch(`${BACKEND}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        await setStoredToken(null);
        setUser(null);
        setToken(null);
        return null;
      }
      const u = await res.json();
      setUser(u);
      setToken(t);
      return u;
    } catch {
      setUser(null);
      setToken(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (sessionId: string): Promise<User | null> => {
    const res = await fetch(`${BACKEND}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await setStoredToken(data.session_token);
    setToken(data.session_token);
    setUser(data.user);
    return data.user as User;
  }, []);

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${BACKEND}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* noop */
      }
    }
    await setStoredToken(null);
    setUser(null);
    setToken(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function apiFetch(path: string, token: string | null, init?: RequestInit) {
  return fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}
