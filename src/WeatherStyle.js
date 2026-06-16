import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
// Palette: deep navy space core + electric neon accents + glassmorphism surfaces
// Typography: heavy weight titles, loose tracking labels, tight data numbers
// Signature: animated gradient pill badges + blurred glass cards

export const TOKENS = {
  // Backgrounds
  bgDeep: '#050B18',
  bgMid: '#0A1628',
  bgCard: 'rgba(13, 25, 48, 0.75)',
  bgCardHover: 'rgba(20, 38, 70, 0.85)',
  bgGlass: 'rgba(255, 255, 255, 0.04)',
  bgGlassStrong: 'rgba(255, 255, 255, 0.08)',

  // Accents
  cyan: '#00D4FF',
  cyanDim: 'rgba(0, 212, 255, 0.15)',
  cyanGlow: 'rgba(0, 212, 255, 0.4)',
  violet: '#8B5CF6',
  violetDim: 'rgba(139, 92, 246, 0.15)',
  green: '#00F5A0',
  greenDim: 'rgba(0, 245, 160, 0.12)',
  amber: '#FFB347',
  amberDim: 'rgba(255, 179, 71, 0.15)',
  rose: '#FF4D8D',
  roseDim: 'rgba(255, 77, 141, 0.12)',

  // Text
  textPrimary: '#F0F6FF',
  textSecondary: '#8BA4C8',
  textMuted: '#4A6380',
  textAccent: '#00D4FF',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  borderMid: 'rgba(255, 255, 255, 0.12)',
  borderAccent: 'rgba(0, 212, 255, 0.3)',

  // Radii
  radiusSm: 16,
  radiusMd: 22,
  radiusLg: 28,
  radiusXl: 36,
  radiusPill: 100,
};

export const st = StyleSheet.create({
  // ── SCREENS ─────────────────────────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: TOKENS.bgDeep,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── SCROLL ──────────────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 18,
  },

  // ── LOADING ─────────────────────────────────────────────────────────────────
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TOKENS.cyanDim,
    borderWidth: 1.5,
    borderColor: TOKENS.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  loadingTitle: {
    color: TOKENS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingSubtitle: {
    color: TOKENS.textMuted,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── ERROR ───────────────────────────────────────────────────────────────────
  errorIcon: { fontSize: 52, marginBottom: 20 },
  errorTitle: {
    color: TOKENS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorText: {
    color: TOKENS.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  primaryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: TOKENS.radiusPill,
    marginBottom: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: TOKENS.bgDeep,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: TOKENS.radiusPill,
    backgroundColor: TOKENS.bgGlass,
    borderWidth: 1.5,
    borderColor: TOKENS.borderMid,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: TOKENS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  // ── HEADER ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  headerLeft: { flex: 1 },
  appLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  locationText: {
    color: TOKENS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  locationIcon: {
    color: TOKENS.cyan,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: TOKENS.borderMid,
    backgroundColor: TOKENS.bgGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 22,
    fontWeight: '900',
  },

  // ── NOTICE / BADGE ──────────────────────────────────────────────────────────
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: TOKENS.radiusPill,
    backgroundColor: TOKENS.bgGlass,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    marginBottom: 14,
    gap: 6,
  },
  noticeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  noticeText: {
    color: TOKENS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── HERO CARD ───────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: TOKENS.radiusXl,
    padding: 20,
    backgroundColor: TOKENS.bgCard,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroArtWrap: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tempText: {
    color: TOKENS.textPrimary,
    fontSize: 96,
    lineHeight: 98,
    fontWeight: '900',
    letterSpacing: -4,
  },
  tempDeg: {
    color: TOKENS.textSecondary,
    fontSize: 32,
    fontWeight: '600',
    marginTop: 12,
  },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: TOKENS.radiusPill,
    marginTop: 6,
    marginBottom: 6,
    gap: 6,
  },
  conditionText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  conditionEmoji: {
    fontSize: 16,
  },
  updatedText: {
    color: TOKENS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 14,
  },

  // ── RAIN TIMER CARD ─────────────────────────────────────────────────────────
  rainTimerCard: {
    width: '100%',
    borderRadius: TOKENS.radiusLg,
    overflow: 'hidden',
    borderWidth: 1,
    marginTop: 4,
  },
  rainTimerInner: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rainTimerBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  rainTimerDivider: {
    width: 1,
    height: 56,
    backgroundColor: TOKENS.borderSubtle,
    alignSelf: 'center',
    marginHorizontal: 12,
  },
  rainTimerEmoji: {
    fontSize: 26,
  },
  rainTimerLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  rainTimerTime: {
    color: TOKENS.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  rainTimerSub: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  rainChancePill: {
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: TOKENS.radiusPill,
    borderWidth: 1,
  },
  rainChanceText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── FEEL STRIP ──────────────────────────────────────────────────────────────
  feelStrip: {
    flexDirection: 'row',
    backgroundColor: TOKENS.bgGlass,
    borderRadius: TOKENS.radiusMd,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    padding: 16,
    marginBottom: 14,
    gap: 0,
  },
  feelItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  feelDivider: {
    width: 1,
    height: 36,
    backgroundColor: TOKENS.borderSubtle,
    alignSelf: 'center',
  },
  feelEmoji: {
    fontSize: 20,
  },
  feelLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  feelValue: {
    color: TOKENS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },

  // ── METRICS GRID ────────────────────────────────────────────────────────────
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: (width - 36 - 10) / 2,
    borderRadius: TOKENS.radiusLg,
    padding: 18,
    backgroundColor: TOKENS.bgCard,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
  },
  metricEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  metricEmoji: {
    fontSize: 24,
  },
  metricLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  metricSub: {
    color: TOKENS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },

  // ── TODAY CARD ──────────────────────────────────────────────────────────────
  todayCard: {
    borderRadius: TOKENS.radiusLg,
    padding: 20,
    backgroundColor: TOKENS.bgCard,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    marginBottom: 16,
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  todayTempRange: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  todayTempHigh: {
    color: TOKENS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  todayTempSep: {
    color: TOKENS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  todayTempLow: {
    color: TOKENS.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  sunRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sunBox: {
    flex: 1,
    borderRadius: TOKENS.radiusMd,
    padding: 16,
    backgroundColor: TOKENS.bgGlass,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    gap: 6,
  },
  sunEmoji: { fontSize: 22 },
  sunLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sunValue: {
    color: TOKENS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },

  // ── SECTION HEADER ──────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
    gap: 10,
  },
  sectionTitle: {
    color: TOKENS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusPill,
    backgroundColor: TOKENS.bgGlass,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
  },
  sectionPillText: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── HOURLY STRIP ────────────────────────────────────────────────────────────
  hourlyListContent: {
    paddingRight: 18,
    paddingBottom: 6,
    gap: 10,
    flexDirection: 'row',
  },
  hourCard: {
    width: 76,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: TOKENS.radiusMd,
    borderWidth: 1,
    alignItems: 'center',
    gap: 5,
  },
  hourCardActive: {
    borderWidth: 1.5,
  },
  hourLabel: {
    color: TOKENS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  hourEmoji: {
    fontSize: 24,
    marginVertical: 2,
  },
  hourTemp: {
    color: TOKENS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  hourRainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hourRainPct: {
    color: TOKENS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  hourMm: {
    color: TOKENS.cyan,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },

  // ── INFO CARD (AQI / UV) ─────────────────────────────────────────────────────
  infoCard: {
    borderRadius: TOKENS.radiusLg,
    padding: 20,
    backgroundColor: TOKENS.bgCard,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoLeft: { flex: 1, gap: 4 },
  infoTitle: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  infoLabel: {
    fontSize: 20,
    fontWeight: '800',
  },
  infoMessage: {
    color: TOKENS.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  infoBarWrap: {
    height: 4,
    borderRadius: 2,
    backgroundColor: TOKENS.bgGlass,
    marginTop: 4,
    overflow: 'hidden',
  },
  infoBar: {
    height: 4,
    borderRadius: 2,
  },
  infoValueBlock: {
    alignItems: 'center',
    gap: 4,
  },
  infoValue: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  infoValueLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── PM STRIP ────────────────────────────────────────────────────────────────
  pmStrip: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  pmCard: {
    flex: 1,
    borderRadius: TOKENS.radiusMd,
    padding: 16,
    backgroundColor: TOKENS.bgCard,
    borderWidth: 1,
    borderColor: TOKENS.borderSubtle,
    gap: 6,
  },
  pmLabel: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pmValue: {
    color: TOKENS.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pmUnit: {
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  footer: {
    textAlign: 'center',
    color: TOKENS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
    opacity: 0.6,
  },

  // ── LIGHTNING FLASH ──────────────────────────────────────────────────────────
  lightningFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
});
