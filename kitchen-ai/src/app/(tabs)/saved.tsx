import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { messageOf } from '@/lib/api';
import { listSaved } from '@/lib/recipes';
import { minutesLabel } from '@/lib/format';
import type { Recipe } from '@/lib/types';
import { EmptyState, ErrorState, LoadingState, T, colors, radius, space } from '@/ui';

export default function Saved() {
  const { session } = useAuth();
  const [items, setItems] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      setItems(await listSaved(session.user.id));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [session]);

  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <T variant="title" style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>My recipes</T>
      {error && !items ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <LoadingState title="Loading your recipes…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space.xl, paddingTop: 0, gap: space.md, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={
            <EmptyState emoji="📌" title="No saved recipes yet" body="Tap Save on any recipe and it will live here." action={{ title: 'Scan my fridge', onPress: () => router.navigate('/') }} />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/recipe/${item.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg }}>
                <View style={{ alignItems: 'center', minWidth: 64 }}>
                  <T variant="heading" color={colors.accent} numeric style={{ fontSize: 26, lineHeight: 30 }}>{item.macros.protein_g}g</T>
                  <T variant="caption" color={colors.inkFaint}>protein</T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong" numberOfLines={2}>{item.title}</T>
                  <T variant="caption" color={colors.inkSoft}>{item.macros.kcal} kcal · {minutesLabel(item.minutes)}{item.glp1_friendly ? ' · GLP-1 friendly' : ''}</T>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
