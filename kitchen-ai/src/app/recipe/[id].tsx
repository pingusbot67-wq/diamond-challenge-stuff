import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { getRecipe, isSaved, logMeal, setSaved } from '@/lib/recipes';
import { grams, GLP1_NOTE } from '@/lib/format';
import type { Recipe } from '@/lib/types';
import { MacroCard } from '@/features/MacroCard';
import { shareCard } from '@/features/share';
import { Banner, Button, Card, ErrorState, LoadingState, Screen, T, colors, space } from '@/ui';
import { messageOf } from '@/lib/api';

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [saved, setSavedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'log' | null>(null);
  const cardRef = useRef<ComponentRef<typeof View>>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getRecipe(id);
      setRecipe(r);
      if (session) setSavedState(await isSaved(session.user.id, id));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [id, session]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !recipe) return <ErrorState message={error} onRetry={load} />;
  if (!recipe) return <LoadingState title="Loading recipe…" />;
  const units = profile?.units ?? 'us';

  async function toggleSave() {
    if (!session || !recipe) return;
    setBusy('save');
    try {
      await setSaved(session.user.id, recipe.id, !saved);
      setSavedState(!saved);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function ate() {
    if (!session || !recipe) return;
    setBusy('log');
    try {
      await logMeal(session.user.id, recipe);
      setNotice(`Logged! ${recipe.macros.protein_g}g protein added to today.`);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edges={[]}>
      <MacroCard ref={cardRef} recipe={recipe} showFit={false} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button title="Start cooking" onPress={() => router.push(`/cook/${recipe.id}`)} style={{ flex: 2 }} />
        <Button
          title={saved ? 'Saved' : 'Save'}
          variant="secondary"
          onPress={toggleSave}
          loading={busy === 'save'}
          icon={<Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={colors.ink} />}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button title="I ate this" size="md" variant="secondary" onPress={ate} loading={busy === 'log'} style={{ flex: 1 }} />
        <Button title="Share card" size="md" variant="secondary" onPress={() => shareCard(cardRef.current).catch((e) => setError(messageOf(e)))} style={{ flex: 1 }} />
      </View>
      {notice ? <Banner tone="success" text={notice} /> : null}
      {error ? <Banner tone="danger" text={error} /> : null}

      {recipe.summary ? <T color={colors.inkSoft}>{recipe.summary}</T> : null}

      <View style={{ gap: space.md }}>
        <T variant="heading">Ingredients{recipe.servings > 1 ? ` · makes ${recipe.servings}` : ''}</T>
        {recipe.ingredients.map((ing, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs }}>
            <T style={{ flex: 1 }}>
              {ing.name}
              {!ing.matched && ing.kcal > 15 ? <T variant="caption" color={colors.warning}>  estimated</T> : null}
            </T>
            <T color={colors.inkSoft} numeric>{grams(ing.grams, units)}</T>
          </View>
        ))}
      </View>

      {recipe.safety.length ? (
        <Card tone="accent" style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="thermometer" size={18} color={colors.accentInk} />
            <T variant="label" color={colors.accentInk}>Food safety</T>
          </View>
          {recipe.safety.map((s) => (
            <T key={s.class} variant="caption" color={colors.ink}>• {s.text}</T>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: space.md }}>
        <T variant="heading">Steps</T>
        {recipe.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
            <T variant="bodyStrong" color={colors.accent} style={{ width: 24 }}>{i + 1}</T>
            <T style={{ flex: 1 }}>{s.text}</T>
          </View>
        ))}
      </View>

      {recipe.glp1_friendly || profile?.goal === 'glp1' ? <Banner tone="info" text={GLP1_NOTE} /> : null}
    </Screen>
  );
}
