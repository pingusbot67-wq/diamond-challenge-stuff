import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { callFunction, messageOf } from '@/lib/api';
import { flow, useFlow } from '@/lib/store';
import { localDayStart } from '@/lib/today';
import type { Recipe } from '@/lib/types';
import { MacroCard } from '@/features/MacroCard';
import { shareCard } from '@/features/share';
import { Banner, Button, EmptyState, LoadingState, Screen, T, colors, space } from '@/ui';

export default function Results() {
  const { recipes, items, target } = useFlow();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({});

  async function differentOnes() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await callFunction<{ recipes: Recipe[] }>('generate-recipes', {
        ingredients: items.map((i) => i.name),
        day_start: localDayStart().toISOString(),
        refresh: true,
      });
      flow.set({ recipes: res.recipes });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRefreshing(false);
    }
  }

  if (refreshing) return <LoadingState title="Finding different ideas…" />;
  if (!recipes.length) return <EmptyState emoji="🍳" title="No recipes yet" body="Go back and add a few ingredients." action={{ title: 'Back', onPress: () => router.back() }} />;

  return (
    <Screen edges={[]}>
      {target ? (
        <T color={colors.inkSoft}>
          Ranked for this meal: about <T variant="bodyStrong">{target.kcal} kcal</T> and <T variant="bodyStrong">{target.protein_g}g+ protein</T>.
        </T>
      ) : null}
      {recipes.map((r, i) => (
        <Animated.View key={r.id} entering={FadeInDown.delay(i * 90).duration(350)} style={{ gap: space.md }}>
          <View ref={(v) => { cardRefs.current[r.id] = v; }} collapsable={false}>
            <MacroCard recipe={r} rank={i} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button title="Cook this" size="md" onPress={() => router.push(`/cook/${r.id}`)} style={{ flex: 1 }} />
            <Button title="Details" size="md" variant="secondary" onPress={() => router.push(`/recipe/${r.id}`)} style={{ flex: 1 }} />
            <Button title="Share" size="md" variant="secondary" onPress={() => shareCard(cardRefs.current[r.id]).catch((e) => setError(messageOf(e)))} />
          </View>
        </Animated.View>
      ))}
      {error ? <Banner tone="danger" text={error} /> : null}
      <Button title="Show me different ones" variant="ghost" onPress={differentOnes} />
      <T variant="caption" color={colors.inkFaint} align="center">
        Macros are calculated from USDA nutrition data, not guessed by AI. “Estimated” means an ingredient wasn’t in our table.
      </T>
    </Screen>
  );
}
