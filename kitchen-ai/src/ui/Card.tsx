import { View, type ViewProps } from 'react-native';
import { colors, radius, shadow, space } from './theme';

type Props = ViewProps & { tone?: 'surface' | 'white' | 'accent'; padded?: boolean; elevated?: boolean };

export function Card({ tone = 'surface', padded = true, elevated, style, ...rest }: Props) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: tone === 'white' ? colors.bg : tone === 'accent' ? colors.accentSoft : colors.surface,
          borderRadius: radius.lg,
          padding: padded ? space.lg : 0,
        },
        tone === 'white' && { borderWidth: 1, borderColor: colors.line },
        elevated && shadow.card,
        style,
      ]}
    />
  );
}
