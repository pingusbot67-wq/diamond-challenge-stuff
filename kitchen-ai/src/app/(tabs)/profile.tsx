import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { callFunction, messageOf } from '@/lib/api';
import { ALLERGY_OPTIONS, DIET_OPTIONS, GLP1_NOTE } from '@/lib/format';
import { Banner, Button, Card, Screen, T, colors, space } from '@/ui';

const GOAL_LABEL = { cut: 'Lose fat', maintain: 'Maintain', bulk: 'Build muscle', glp1: 'GLP-1 mode' } as const;
const label = (list: readonly (readonly [string, string])[], ids: string[]) => ids.map((id) => list.find(([k]) => k === id)?.[1] ?? id).join(', ') || 'None';

export default function ProfileTab() {
  const { session, profile, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    Alert.alert('Delete your account?', 'This permanently deletes your account, profile, saved recipes and meal history. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setError(null);
          try {
            await callFunction('delete-account', {});
            await signOut();
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (!profile) return null;
  return (
    <Screen>
      <T variant="title">Profile</T>
      <T color={colors.inkSoft}>{session?.user.email ?? 'Signed in with Apple'}</T>

      <Card style={{ gap: space.lg }}>
        <Row k="Goal" v={profile.goal ? GOAL_LABEL[profile.goal] : '—'} />
        <Row k="Daily protein" v={`${profile.protein_target_g ?? '—'} g`} />
        <Row k="Daily calories" v={`${profile.calorie_target ?? '—'} kcal`} />
        <Row k="Diet" v={label(DIET_OPTIONS, profile.diet)} />
        <Row k="Allergies" v={label(ALLERGY_OPTIONS, profile.allergies)} />
        <Row k="Time per meal" v={`${profile.max_minutes ?? 30} min`} />
        <Button title="Edit profile & targets" variant="primary" size="md" onPress={() => router.push('/edit-profile')} />
      </Card>

      {profile.goal === 'glp1' ? <Banner tone="info" text={GLP1_NOTE} /> : null}

      <View style={{ gap: space.md }}>
        <Button title="Sign out" variant="secondary" onPress={signOut} />
        <Button title="Delete account" variant="danger" onPress={confirmDelete} loading={deleting} />
        {error ? <Banner tone="danger" text={error} /> : null}
      </View>
      <T variant="caption" color={colors.inkFaint} align="center">
        Kitchen AI gives food ideas and nutrition estimates. It is not medical advice.
      </T>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.lg }}>
      <T color={colors.inkSoft}>{k}</T>
      <T variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{v}</T>
    </View>
  );
}
