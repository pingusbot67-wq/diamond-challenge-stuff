// "Today" progress: protein + calories eaten vs target.
import { View } from 'react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { T, colors, radius, space } from '@/ui';

function Bar({ label, value, target, unit, color }: { label: string; value: number; target: number; unit: string; color: string }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 600 });
  }, [pct, progress]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const left = Math.max(0, target - value);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T variant="label">{label}</T>
        <T variant="caption" color={colors.inkSoft} numeric>
          <T variant="bodyStrong" numeric>{Math.round(left)}{unit}</T> left of {target}{unit}
        </T>
      </View>
      <View style={{ height: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: radius.pill }, style]} />
      </View>
    </View>
  );
}

export function TodayBar({ eaten, protein, calories }: { eaten: { kcal: number; protein_g: number }; protein: number; calories: number }) {
  return (
    <View style={{ gap: space.lg }}>
      <Bar label="Protein" value={eaten.protein_g} target={protein} unit="g" color={colors.accent} />
      <Bar label="Calories" value={eaten.kcal} target={calories} unit="" color={colors.ink} />
    </View>
  );
}
