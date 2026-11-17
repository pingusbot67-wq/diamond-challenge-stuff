import { forwardRef, type ComponentRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { T } from './Text';
import { colors, radius, space } from './theme';

type Props = TextInputProps & { label?: string; hint?: string; error?: string | null; suffix?: string };

export const Field = forwardRef<ComponentRef<typeof TextInput>, Props>(function Field({ label, hint, error, suffix, style, ...rest }, ref) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T variant="label" color={colors.inkSoft}>{label}</T> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.line,
          paddingHorizontal: space.lg,
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.inkFaint}
          {...rest}
          style={[{ flex: 1, fontSize: 17, color: colors.ink, paddingVertical: space.md + 2 }, style]}
        />
        {suffix ? <T variant="label" color={colors.inkFaint}>{suffix}</T> : null}
      </View>
      {error ? (
        <T variant="caption" color={colors.danger}>{error}</T>
      ) : hint ? (
        <T variant="caption" color={colors.inkFaint}>{hint}</T>
      ) : null}
    </View>
  );
});
