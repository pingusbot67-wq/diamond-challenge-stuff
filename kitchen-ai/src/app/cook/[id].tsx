// Cook mode: big text, one step per page, swipe or tap, timers, screen stays on.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Vibration, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { messageOf } from '@/lib/api';
import { clock } from '@/lib/format';
import { getRecipe, logMeal } from '@/lib/recipes';
import type { Recipe } from '@/lib/types';
import { Banner, Button, ErrorState, LoadingState, T, colors, radius, space } from '@/ui';

type Timer = { total: number; endsAt: number | null; left: number; done: boolean };

export default function CookMode() {
  useKeepAwake(); // screen stays on while this screen is open
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [timers, setTimers] = useState<Record<number, Timer>>({});
  const [logged, setLogged] = useState<'idle' | 'busy' | 'done'>('idle');
  const list = useRef<FlatList>(null);

  const load = useCallback(() => {
    setError(null);
    getRecipe(id).then(setRecipe).catch((e) => setError(messageOf(e)));
  }, [id]);
  useEffect(load, [load]);

  // one ticking clock for all timers (keeps working if you swipe to another step)
  useEffect(() => {
    const t = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(prev)) {
          if (!v.endsAt || v.done) continue;
          const left = Math.max(0, (v.endsAt - Date.now()) / 1000);
          if (left === 0) {
            next[+k] = { ...v, left: 0, endsAt: null, done: true };
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Vibration.vibrate([0, 400, 200, 400, 200, 400]);
          } else next[+k] = { ...v, left };
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  if (error) return <SafeAreaView style={{ flex: 1 }}><ErrorState message={error} onRetry={load} /></SafeAreaView>;
  if (!recipe) return <LoadingState title="Getting your kitchen ready…" />;

  const steps = recipe.steps;
  const pages = steps.length + 1; // last page = done
  const go = (i: number) => {
    const p = Math.max(0, Math.min(pages - 1, i));
    list.current?.scrollToIndex({ index: p, animated: true });
    setPage(p);
    Haptics.selectionAsync().catch(() => {});
  };

  function toggleTimer(i: number, seconds: number) {
    setTimers((prev) => {
      const t = prev[i] ?? { total: seconds, endsAt: null, left: seconds, done: false };
      if (t.done) return { ...prev, [i]: { total: seconds, endsAt: Date.now() + seconds * 1000, left: seconds, done: false } };
      if (t.endsAt) return { ...prev, [i]: { ...t, endsAt: null } }; // pause
      return { ...prev, [i]: { ...t, endsAt: Date.now() + t.left * 1000 } }; // start / resume
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.md }}>
        <Pressable accessibilityLabel="Close cook mode" hitSlop={12} onPress={() => router.back()} style={{ padding: space.sm }}>
          <Ionicons name="close" size={28} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, height: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' }}>
          <View style={{ width: `${((page + 1) / pages) * 100}%`, height: '100%', backgroundColor: colors.accent }} />
        </View>
        <T variant="label" color={colors.inkSoft} numeric>{Math.min(page + 1, steps.length)}/{steps.length}</T>
      </View>

      <FlatList
        ref={list}
        data={[...steps.map((s, i) => ({ ...s, i })), { text: '', timer_seconds: null, i: -1 }]}
        keyExtractor={(item) => String(item.i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => {
          if (item.i === -1) {
            return (
              <View style={{ width, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
                <T style={{ fontSize: 56, lineHeight: 64 }}>🎉</T>
                <T variant="display">Done. Enjoy!</T>
                <T color={colors.inkSoft}>{recipe.title} · {recipe.macros.protein_g}g protein · {recipe.macros.kcal} kcal per serving</T>
                {logged === 'done' ? (
                  <Banner tone="success" text="Logged to today." />
                ) : (
                  <Button
                    title="Log this meal"
                    variant="accent"
                    loading={logged === 'busy'}
                    onPress={async () => {
                      if (!session) return;
                      setLogged('busy');
                      try {
                        await logMeal(session.user.id, recipe);
                        setLogged('done');
                      } catch (e) {
                        setLogged('idle');
                        setError(messageOf(e));
                      }
                    }}
                  />
                )}
                <Button title="Finish" variant="secondary" onPress={() => router.back()} />
              </View>
            );
          }
          const t = item.timer_seconds ? timers[item.i] : undefined;
          const hasSafety = /\d{3}°F/.test(item.text);
          return (
            <View style={{ width, padding: space.xl, gap: space.xl }}>
              <T variant="overline" color={colors.accent}>Step {item.i + 1}</T>
              <T style={{ fontSize: 30, lineHeight: 40, fontWeight: '600', letterSpacing: -0.3 }}>{item.text}</T>
              {hasSafety ? (
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                  <Ionicons name="thermometer" size={18} color={colors.accentInk} />
                  <T variant="label" color={colors.accentInk}>Use a meat thermometer to check</T>
                </View>
              ) : null}
              {item.timer_seconds ? (
                <Pressable
                  onPress={() => toggleTimer(item.i, item.timer_seconds!)}
                  accessibilityRole="button"
                  accessibilityLabel="Start or pause timer"
                  style={{
                    backgroundColor: t?.done ? colors.successSoft : t?.endsAt ? colors.ink : colors.surface,
                    borderRadius: radius.xl,
                    padding: space.xl,
                    alignItems: 'center',
                    gap: space.xs,
                  }}
                >
                  <T variant="hero" numeric color={t?.done ? colors.success : t?.endsAt ? colors.white : colors.ink}>
                    {clock(t ? t.left : item.timer_seconds)}
                  </T>
                  <T variant="label" color={t?.endsAt ? '#C9C6C0' : colors.inkSoft}>
                    {t?.done ? 'Time’s up! Tap to restart' : t?.endsAt ? 'Tap to pause' : t ? 'Tap to resume' : 'Tap to start timer'}
                  </T>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />

      <View style={{ flexDirection: 'row', gap: space.md, padding: space.xl, paddingTop: space.sm }}>
        <Button title="Back" variant="secondary" onPress={() => go(page - 1)} disabled={page === 0} style={{ flex: 1 }} />
        {page < pages - 1 ? <Button title="Next step" onPress={() => go(page + 1)} style={{ flex: 2 }} /> : null}
      </View>
    </SafeAreaView>
  );
}
