import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth';
import { pickFridgePhoto } from '@/lib/image';
import { flow } from '@/lib/store';
import { todaysTotals, type Totals } from '@/lib/today';
import { GLP1_NOTE } from '@/lib/format';
import { TodayBar } from '@/features/TodayBar';
import { Banner, Button, Card, Screen, T, colors, space } from '@/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { session, profile } = useAuth();
  const [eaten, setEaten] = useState<Totals>({ kcal: 0, protein_g: 0 });
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (session) todaysTotals(session.user.id).then(setEaten).catch(() => {});
    }, [session]),
  );

  async function start(source: 'camera' | 'library') {
    setError(null);
    setBusy(source);
    try {
      const photo = await pickFridgePhoto(source);
      if (!photo) return;
      flow.reset();
      flow.set({ photoUri: photo.uri, photoBase64: photo.base64 });
      router.push('/scan/confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t open the camera.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space.xs }}>
        <T variant="caption" color={colors.inkFaint}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </T>
        <T variant="title">{greeting()}</T>
      </Animated.View>

      <Card tone="white" style={{ gap: space.lg }}>
        <T variant="overline" color={colors.inkSoft}>Today</T>
        <TodayBar eaten={eaten} protein={profile?.protein_target_g ?? 120} calories={profile?.calorie_target ?? 2000} />
      </Card>

      <Animated.View entering={FadeInDown.delay(80).duration(350)}>
        <Card style={{ gap: space.lg, backgroundColor: colors.ink, padding: space.xl }}>
          <Ionicons name="camera" size={32} color={colors.accent} />
          <View style={{ gap: space.xs }}>
            <T variant="title" color={colors.white}>What can I cook?</T>
            <T color="#C9C6C0">Snap your fridge. Get 3 high-protein meals that fit what you have left today.</T>
          </View>
          <Button title="Take a photo" variant="accent" onPress={() => start('camera')} loading={busy === 'camera'} disabled={!!busy} />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button title="Upload" size="md" variant="secondary" onPress={() => start('library')} loading={busy === 'library'} disabled={!!busy} style={{ flex: 1 }} />
            <Button
              title="Type it in"
              size="md"
              variant="secondary"
              disabled={!!busy}
              style={{ flex: 1 }}
              onPress={() => {
                flow.reset();
                router.push('/scan/confirm');
              }}
            />
          </View>
        </Card>
      </Animated.View>

      {error ? <Banner tone="danger" text={error} /> : null}
      {profile?.goal === 'glp1' ? <Banner tone="info" text={GLP1_NOTE} /> : null}
    </Screen>
  );
}
