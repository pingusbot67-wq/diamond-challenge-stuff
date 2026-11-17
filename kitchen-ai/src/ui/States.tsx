import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button } from './Button';
import { T } from './Text';
import { colors, space } from './theme';

export function LoadingState({ title = 'Loading…', subtitle }: { title?: string; subtitle?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <T variant="heading" align="center">{title}</T>
      {subtitle ? <T color={colors.inkSoft} align="center">{subtitle}</T> : null}
    </Animated.View>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: { title: string; onPress: () => void } }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl }}>
      <T style={{ fontSize: 48, lineHeight: 56 }}>{emoji}</T>
      <T variant="heading" align="center">{title}</T>
      {body ? <T color={colors.inkSoft} align="center">{body}</T> : null}
      {action ? <Button title={action.title} onPress={action.onPress} size="md" style={{ marginTop: space.sm }} /> : null}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <T style={{ fontSize: 40, lineHeight: 48 }}>😕</T>
      <T variant="heading" align="center">Something went wrong</T>
      <T color={colors.inkSoft} align="center">{message}</T>
      {onRetry ? <Button title="Try again" onPress={onRetry} size="md" variant="secondary" /> : null}
    </View>
  );
}

export function Banner({ tone = 'warning', text }: { tone?: 'warning' | 'danger' | 'success' | 'info'; text: string }) {
  const map = {
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    success: [colors.successSoft, colors.success],
    info: [colors.surface, colors.inkSoft],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 14, padding: space.md }}>
      <T variant="caption" color={fg}>{text}</T>
    </View>
  );
}
