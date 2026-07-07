import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          height: 66,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.onSurfaceSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="treinos"
        options={{
          title: "Treinos",
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" size={size} color={color} />,
          tabBarButtonTestID: "tab-treinos",
        }}
      />
      <Tabs.Screen
        name="nutricao"
        options={{
          title: "Nutrição",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} />,
          tabBarButtonTestID: "tab-nutricao",
        }}
      />
      <Tabs.Screen
        name="progresso"
        options={{
          title: "Progresso",
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" size={size} color={color} />,
          tabBarButtonTestID: "tab-progresso",
        }}
      />
    </Tabs>
  );
}
