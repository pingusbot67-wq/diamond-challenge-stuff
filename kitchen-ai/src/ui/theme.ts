// Kitchen AI design system: the ONE place colors, spacing and type sizes live.
// Every screen imports from here so the app looks consistent.

export const colors = {
  bg: '#FFFFFF',
  surface: '#F6F5F2', // warm light gray for cards / inputs
  surfaceAlt: '#EEECE7',
  ink: '#121212', // main text + primary buttons
  inkSoft: '#5E5B57',
  inkFaint: '#9B9893',
  line: '#E6E4DF',
  accent: '#F04E23', // the one strong accent (protein, highlights)
  accentSoft: '#FDECE6',
  accentInk: '#B8320F', // accent dark enough for small text
  white: '#FFFFFF',
  success: '#12804A',
  successSoft: '#E5F4EC',
  warning: '#9A5B00',
  warningSoft: '#FFF3DC',
  danger: '#C62A1E',
  dangerSoft: '#FDE8E6',
  // macro colors (used sparingly, always next to a label)
  protein: '#F04E23',
  carbs: '#E2A400',
  fat: '#5B7FE8',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const type = {
  hero: { fontSize: 64, lineHeight: 68, fontWeight: '800', letterSpacing: -2 },
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
} as const;
