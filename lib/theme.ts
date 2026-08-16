/**
 * Design tokens — single source of truth for color/spacing/radius/shadow
 * across every screen and component.
 *
 * Before this file existed, each screen picked its own neutral scale
 * (gray-* in some, slate-* in others — e.g. index.tsx used #1e293b for body
 * text while settings.tsx/history.tsx/AuthGate.tsx used #111827 for the same
 * role), so the app looked like several apps stitched together. This
 * consolidates on one scale, modeled on the "confident blue + generous
 * whitespace + rounded cards" language shared by iTranslate, Google
 * Translate, and Microsoft Translator — the dominant, not the outlier,
 * pattern among the best-known apps in this category.
 *
 * Usage: `import { theme } from '@/lib/theme';` then `theme.colors.textPrimary`,
 * `theme.radius.lg`, etc. — never a raw hex literal in a new screen.
 */

export const colors = {
  // Brand — unchanged from what the app already used everywhere; it was
  // already the right choice (near-identical to Google Translate's blue).
  primary:        '#2563EB',
  primaryDark:    '#1D4ED8',
  primaryLight:   '#93C5FD',
  primaryTint:    '#EFF6FF', // pale blue background for selected/active states
  primaryTintBorder: '#BFDBFE',

  // A secondary accent for voice/premium-feature affordances (voice cloning,
  // Plus/Live plan badges) — distinct enough from primary to read as "special"
  // without introducing a third unrelated hue.
  accent:         '#7C3AED',
  accentTint:     '#F5F3FF',

  // Neutral scale (slate) — the ONE scale every screen now uses instead of
  // the previous gray/slate mix.
  neutral50:  '#F8FAFC',
  neutral100: '#F1F5F9',
  neutral200: '#E2E8F0',
  neutral300: '#CBD5E1',
  neutral400: '#94A3B8',
  neutral500: '#64748B',
  neutral600: '#475569',
  neutral700: '#334155',
  neutral800: '#1E293B',
  neutral900: '#0F172A',

  // Semantic roles, built from the scales above — screens should reach for
  // these first, the raw neutral/brand scale second.
  background:     '#F1F5F9', // neutral100 — app background behind cards
  surface:        '#FFFFFF', // card background
  surfaceMuted:   '#F8FAFC', // subtle recessed surface (inputs, pills)
  border:         '#E2E8F0', // neutral200
  borderStrong:   '#CBD5E1', // neutral300

  textPrimary:    '#1E293B', // neutral800 — headings, body
  textSecondary:  '#64748B', // neutral500 — subtitles, captions
  textTertiary:   '#94A3B8', // neutral400 — placeholders, least-emphasis labels
  textOnPrimary:  '#FFFFFF',

  success:      '#059669',
  successTint:  '#ECFDF5',
  warning:      '#D97706',
  warningTint:  '#FFFBEB',
  error:        '#EF4444',
  errorStrong:  '#DC2626',
  errorTint:    '#FEF2F2',

  overlay: 'rgba(15, 23, 42, 0.45)', // modal/sheet backdrop — tinted, not flat black
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  displayLarge: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayMedium: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' as const },
  subtitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
} as const;

/** Standard card elevation — every card in the app should use exactly this,
 *  not a one-off shadowOpacity/shadowRadius per screen. */
export const cardShadow = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
} as const;

/** Stronger elevation for floating elements (the hero mic button, FABs). */
export const floatingShadow = (tint: string = colors.primary) => ({
  shadowColor: tint,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.3,
  shadowRadius: 12,
  elevation: 8,
});

export const theme = { colors, spacing, radius, typography, cardShadow, floatingShadow };
export default theme;
