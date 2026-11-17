import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, space } from './theme';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  footer?: React.ReactNode; // pinned to the bottom (e.g. main button)
  contentStyle?: ViewStyle;
  background?: string;
};

export function Screen({ children, scroll = true, edges = ['top'], footer, contentStyle, background = colors.bg }: Props) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[{ padding: space.xl, gap: space.xl, paddingBottom: space.xxxl }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, padding: space.xl, gap: space.xl }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {footer ? (
          <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, backgroundColor: background, borderTopWidth: 1, borderTopColor: colors.line }}>
            {footer}
          </SafeAreaView>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
