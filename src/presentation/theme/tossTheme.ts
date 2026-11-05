/**
 * Toss-Style Minimal Design Tokens for StoneWish
 * 토스(Toss) 감성의 미니멀 디자인 시스템 토큰
 */
export const TossTheme = {
  colors: {
    // Backgrounds
    background: '#0F1015',
    backgroundLight: '#F2F4F6',
    
    // Card & Surfaces
    card: '#181A22',
    cardElevated: '#1F222C',
    cardLight: '#FFFFFF',
    border: 'rgba(255, 255, 255, 0.06)',
    borderLight: '#E5E8EB',
    
    // Accents
    primary: '#3182F6', // Toss Signature Blue
    primaryHover: '#1B64DA',
    primarySoft: 'rgba(49, 130, 246, 0.12)',
    warmAmber: '#F59E0B', // StoneWish Warm Glow
    warmSoft: 'rgba(245, 158, 11, 0.12)',
    success: '#05D686',
    danger: '#F04452',

    // Social Provider Colors
    kakao: '#FEE500',
    kakaoText: '#191919',
    apple: '#FFFFFF',
    appleText: '#000000',
    google: '#20222B',
    googleText: '#F5EFE6',

    // Typography
    textPrimary: '#F9FAFB',
    textSecondary: '#8B95A1',
    textTertiary: '#4E5968',
    textMuted: '#333D4B',
  },

  radius: {
    sm: 8,
    md: 12,
    button: 16,
    card: 22,
    modal: 28,
    full: 9999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
  },

  typography: {
    hero: {
      fontSize: 26,
      fontWeight: '700' as const,
      lineHeight: 34,
      letterSpacing: -0.5,
    },
    title: {
      fontSize: 20,
      fontWeight: '700' as const,
      lineHeight: 26,
      letterSpacing: -0.3,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500' as const,
      lineHeight: 16,
    },
    micro: {
      fontSize: 11,
      fontWeight: '500' as const,
      lineHeight: 14,
    },
  },
} as const;
