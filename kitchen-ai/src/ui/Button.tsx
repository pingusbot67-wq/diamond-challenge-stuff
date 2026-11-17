import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { T } from './Text';
import { colors, radius, space } from './theme';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  size?: 'lg' | 'md' | 'sm';
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const bg: Record<Variant, string> = {
  primary: colors.ink,
  accent: colors.accent,
  secondary: colors.surface,
  ghost: 'transparent',
  danger: colors.dangerSoft,
};
const fg: Record<Variant, string> = {
  primary: colors.white,
  accent: colors.white,
  secondary: colors.ink,
  ghost: colors.ink,
  danger: colors.danger,
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, size = 'lg', style, accessibilityLabel }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const height = size === 'lg' ? 56 : size === 'md' ? 46 : 36;
  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
        disabled={isDisabled}
        onPressIn={() => (scale.value = withTiming(0.97, { duration: 90 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 140 }))}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress?.();
        }}
        style={[
          styles.base,
          { height, backgroundColor: bg[variant], opacity: disabled ? 0.4 : 1, paddingHorizontal: size === 'lg' ? space.xl : space.lg },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg[variant]} />
        ) : (
          <View style={styles.row}>
            {icon}
            <T variant={size === 'sm' ? 'caption' : 'label'} color={fg[variant]} style={size === 'lg' ? { fontSize: 17 } : undefined} numberOfLines={1}>
              {title}
            </T>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
