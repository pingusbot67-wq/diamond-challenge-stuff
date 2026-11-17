import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '@/ui';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.bg },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Cook', tabBarIcon: ({ color, size }) => <Ionicons name="flame" color={color as string} size={size} /> }} />
      <Tabs.Screen name="saved" options={{ title: 'My recipes', tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" color={color as string} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color as string} size={size} /> }} />
    </Tabs>
  );
}
