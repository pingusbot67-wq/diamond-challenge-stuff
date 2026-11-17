import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { callFunction, messageOf } from '@/lib/api';
import { flow, useFlow } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { localDayStart } from '@/lib/today';
import type { Recipe, ScanItem } from '@/lib/types';
import { Banner, Button, Chip, EmptyState, ErrorState, LoadingState, Screen, T, colors, radius, space } from '@/ui';

const QUICK_ADD = ['egg', 'chicken breast', 'greek yogurt nonfat', 'cottage cheese 2%', 'canned tuna', 'ground turkey', 'white rice', 'spinach', 'tofu firm', 'black beans'];

let foodNamesCache: string[] | null = null;
async function loadFoodNames(): Promise<string[]> {
  if (foodNamesCache) return foodNamesCache;
  const { data } = await supabase.from('foods').select('name,aliases').limit(5000);
  const names = new Set<string>();
  for (const f of data ?? []) {
    names.add(f.name);
    for (const a of f.aliases ?? []) names.add(a);
  }
  foodNamesCache = [...names].sort();
  return foodNamesCache;
}

export default function Confirm() {
  const { photoUri, photoBase64, items } = useFlow();
  const [phase, setPhase] = useState<'scanning' | 'ready' | 'error' | 'not_food'>(photoBase64 ? 'scanning' : 'ready');
  const [scanError, setScanError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const started = useRef(false);

  useEffect(() => {
    loadFoodNames().then(setNames).catch(() => {});
  }, []);

  async function scan() {
    if (!photoBase64) return;
    setPhase('scanning');
    setScanError(null);
    try {
      const res = await callFunction<{ items: ScanItem[]; not_food?: boolean }>('scan-fridge', { image_base64: photoBase64, media_type: 'image/jpeg' });
      if (res.not_food) return setPhase('not_food');
      flow.set({ items: res.items });
      setPhase('ready');
    } catch (e) {
      setScanError(messageOf(e));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (photoBase64 && !started.current) {
      started.current = true;
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const have = new Set(items.map((i) => i.name.toLowerCase()));
    if (!q) return QUICK_ADD.filter((n) => !have.has(n)).slice(0, 6);
    const starts = names.filter((n) => n.toLowerCase().startsWith(q));
    const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].filter((n) => !have.has(n.toLowerCase())).slice(0, 6);
  }, [query, names, items]);

  function add(name: string) {
    const n = name.trim().slice(0, 60);
    if (!n) return;
    if (!items.some((i) => i.name.toLowerCase() === n.toLowerCase())) flow.set({ items: [{ name: n, confidence: 'high' }, ...items] });
    setQuery('');
  }
  function remove(idx: number) {
    flow.set({ items: items.filter((_, i) => i !== idx) });
  }
  function saveEdit() {
    if (editing === null) return;
    const n = editText.trim();
    flow.set({ items: n ? items.map((it, i) => (i === editing ? { ...it, name: n, confidence: 'high' } : it)) : items.filter((_, i) => i !== editing) });
    setEditing(null);
  }

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await callFunction<{ recipes: Recipe[]; target: { kcal: number; protein_g: number } }>('generate-recipes', {
        ingredients: items.map((i) => i.name),
        day_start: localDayStart().toISOString(),
      });
      flow.set({ recipes: res.recipes, target: res.target });
      router.push('/scan/results');
    } catch (e) {
      setGenError(messageOf(e));
    } finally {
      setGenerating(false);
    }
  }

  if (phase === 'scanning') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ height: 220, margin: space.xl, borderRadius: radius.lg }} resizeMode="cover" /> : null}
        <LoadingState title="Looking in your fridge…" subtitle="Usually takes a few seconds." />
      </View>
    );
  }
  if (generating) return <LoadingState title="Building your recipes…" subtitle="Picking meals that fit your macros, then checking nutrition, allergies and food safety." />;

  return (
    <Screen
      edges={[]}
      footer={
        <View style={{ gap: space.sm }}>
          {genError ? <Banner tone="danger" text={genError} /> : null}
          <Button title={items.length ? `Make 3 recipes from ${items.length} item${items.length === 1 ? '' : 's'}` : 'Add at least one ingredient'} onPress={generate} disabled={!items.length} />
        </View>
      }
    >
      {phase === 'error' ? (
        <View>
          <ErrorState message={scanError ?? 'The scan didn’t work.'} onRetry={scan} />
          <T align="center" color={colors.inkSoft}>Or add ingredients yourself below.</T>
        </View>
      ) : null}
      {phase === 'not_food' ? (
        <Banner tone="warning" text="That doesn’t look like a fridge or food. Try another photo, or add ingredients below." />
      ) : null}

      <View style={{ gap: space.sm }}>
        <T variant="title">{photoBase64 && phase === 'ready' ? 'Here’s what we see' : 'What do you have?'}</T>
        <T color={colors.inkSoft}>
          {photoBase64 && phase === 'ready' ? 'Tap an item to fix it, or × to remove it. Crowded fridges hide things, so add anything we missed.' : 'Add the ingredients you want to cook with.'}
        </T>
      </View>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.lg }}>
          <Ionicons name="add" size={22} color={colors.inkSoft} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Add an ingredient…"
            placeholderTextColor={colors.inkFaint}
            onSubmitEditing={() => add(query)}
            returnKeyType="done"
            blurOnSubmit={false}
            autoCorrect={false}
            style={{ flex: 1, fontSize: 17, paddingVertical: space.md + 2, paddingHorizontal: space.sm, color: colors.ink }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {suggestions.map((s) => (
            <Chip key={s} label={s} trailing="+" onPress={() => add(s)} />
          ))}
        </View>
      </View>

      {items.length === 0 && phase === 'ready' ? (
        <EmptyState emoji="🥚" title="No ingredients yet" body="Type above or tap a suggestion to add one." />
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((it, idx) => (
            <Animated.View key={`${it.name}-${idx}`} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingLeft: space.lg }}>
                {editing === idx ? (
                  <TextInput
                    autoFocus
                    value={editText}
                    onChangeText={setEditText}
                    onSubmitEditing={saveEdit}
                    onBlur={saveEdit}
                    returnKeyType="done"
                    style={{ flex: 1, fontSize: 17, paddingVertical: space.md + 2, color: colors.ink }}
                  />
                ) : (
                  <Pressable style={{ flex: 1, paddingVertical: space.md }} onPress={() => (setEditing(idx), setEditText(it.name))}>
                    <T variant="bodyStrong">{it.name}</T>
                    {it.amount || it.confidence === 'low' ? (
                      <T variant="caption" color={it.confidence === 'low' ? colors.warning : colors.inkFaint}>
                        {[it.amount, it.confidence === 'low' ? 'not sure — tap to fix' : null].filter(Boolean).join(' · ')}
                      </T>
                    ) : null}
                  </Pressable>
                )}
                <Pressable accessibilityLabel={`Remove ${it.name}`} hitSlop={8} onPress={() => remove(idx)} style={{ padding: space.lg }}>
                  <Ionicons name="close" size={20} color={colors.inkSoft} />
                </Pressable>
              </View>
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}
