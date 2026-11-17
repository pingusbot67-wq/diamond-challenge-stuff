// The big result card — designed to look great in a screenshot / TikTok.
import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { T, colors, radius, space, shadow } from '@/ui';
import type { Recipe } from '@/lib/types';
import { minutesLabel } from '@/lib/format';

type Props = { recipe: Recipe; rank?: number; showFit?: boolean; compact?: boolean };

export const MacroCard = forwardRef<ComponentRef<typeof View>, Props>(function MacroCard({ recipe, rank, showFit = true, compact }, ref) {
  const m = recipe.macros;
  const approx = recipe.macros_estimated ? '≈' : '';
  return (
    <View ref={ref} collapsable={false} style={[styles.card, shadow.card]}>
      <View style={styles.badges}>
        {rank === 0 && showFit ? <Badge label="Best fit" tone="accent" /> : null}
        {showFit && typeof recipe.fit === 'number' ? <Badge label={`Fit ${recipe.fit}`} /> : null}
        {recipe.glp1_friendly ? <Badge label="GLP-1 friendly" /> : null}
        {recipe.macros_estimated ? <Badge label="Estimated" tone="warning" /> : null}
      </View>

      <T variant={compact ? 'heading' : 'title'} numberOfLines={2}>
        {recipe.title}
      </T>

      <View style={styles.heroRow}>
        <View>
          <T variant="hero" color={colors.accent} numeric style={compact ? { fontSize: 48, lineHeight: 52 } : undefined}>
            {approx}
            {m.protein_g}
            <T variant="title" color={colors.accent}>g</T>
          </T>
          <T variant="overline" color={colors.inkSoft}>Protein</T>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat value={`${approx}${m.kcal}`} label="Calories" />
        <View style={styles.divider} />
        <Stat value={minutesLabel(recipe.minutes)} label="Time" />
      </View>

      <View style={{ gap: 2 }}>
        <T variant="label" color={colors.inkSoft} numeric>
          {approx}{m.carbs_g}g carbs · {approx}{m.fat_g}g fat{recipe.servings > 1 ? ` · per serving (makes ${recipe.servings})` : ''}
        </T>
        {showFit && recipe.fit_reason ? <T variant="caption" color={colors.inkFaint}>{recipe.fit_reason}</T> : null}
      </View>

      <View style={styles.footer}>
        <T variant="overline" color={colors.inkFaint}>Kitchen AI</T>
        <T variant="caption" color={colors.inkFaint}>made from what’s in my fridge</T>
      </View>
    </View>
  );
});

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="heading" numeric numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, lineHeight: 30 }}>
        {value}
      </T>
      <T variant="caption" color={colors.inkFaint}>{label}</T>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone?: 'accent' | 'warning' }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warningSoft : colors.surface;
  const fg = tone === 'accent' ? colors.white : tone === 'warning' ? colors.warning : colors.inkSoft;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
      <T variant="caption" color={fg} style={{ fontWeight: '700' }}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: radius.xl, padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: colors.line },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: space.md },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
});
