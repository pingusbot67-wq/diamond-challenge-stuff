import * as Haptics from 'expo-haptics';
import { Pressable } from 'react-native';
import { T } from './Text';
import { colors, radius, space } from './theme';

type Props = { label: string; selected?: boolean; onPress?: () => void; trailing?: string };

export function Chip({ label, selected, onPress, trailing }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        paddingVertical: space.sm + 2,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.ink : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.line,
        opacity: pressed ? 0.8 : 1,
        flexDirection: 'row',
        gap: space.xs,
        alignItems: 'center',
      })}
    >
      <T variant="label" color={selected ? colors.white : colors.ink}>
        {label}
      </T>
      {trailing ? (
        <T variant="label" color={selected ? colors.white : colors.inkFaint}>
          {trailing}
        </T>
      ) : null}
    </Pressable>
  );
}
