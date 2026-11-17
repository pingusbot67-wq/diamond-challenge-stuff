import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
import { LoadingState, colors } from '@/ui';

function RootStack() {
  const { ready, session, profile } = useAuth();
  if (!ready || (session && !profile)) return <LoadingState title="Kitchen AI" subtitle="Getting things ready…" />;

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!isConfigured}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={isConfigured && !signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan/confirm" options={{ headerShown: true, title: 'Confirm ingredients', headerBackTitle: 'Back', headerShadowVisible: false }} />
        <Stack.Screen name="scan/results" options={{ headerShown: true, title: 'Your recipes', headerBackTitle: 'Edit', headerShadowVisible: false }} />
        <Stack.Screen name="recipe/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Back', headerShadowVisible: false }} />
        <Stack.Screen name="cook/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
