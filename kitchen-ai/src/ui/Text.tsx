import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, type as typeScale, type TypeVariant } from './theme';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  /** Use for numbers so digits line up and don't jump while animating. */
  numeric?: boolean;
};

export function T({ variant = 'body', color = colors.ink, align, numeric, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[
        typeScale[variant] as TextStyle,
        { color, textAlign: align },
        numeric && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
