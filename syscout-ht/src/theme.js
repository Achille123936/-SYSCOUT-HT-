import { Platform } from 'react-native';

// Charte graphique SYSCOUT-HT : bleu et rouge du drapeau haïtien
export const C = {
  navy: '#0b1f4d',
  blue: '#1f4fd1',
  blue50: '#eef3ff',
  blue100: '#dbe5ff',
  red: '#d21034',
  red50: '#fdecef',
  green: '#12805c',
  green50: '#e7f6ef',
  amber: '#b86e00',
  amber50: '#fff4e0',
  ink: '#111827',
  ink2: '#374151',
  muted: '#6b7280',
  line: '#e5e7eb',
  line2: '#d1d5db',
  bg: '#f4f6fa',
  card: '#ffffff',
  // thème sombre (codage vidéo)
  dBg: '#0b1020',
  dCard: '#0f152b',
  dLine: '#1f2742',
  dField: '#151c33',
  dText: '#e6e9f2',
  dMuted: '#8b95b7',
  dBlue: '#4f7cff',
  dGreen: '#22c38e',
  dRed: '#ff5a6e',
  dAmber: '#f5a524',
  dViolet: '#a78bfa',
};

// Inter sur le web ; police système (San Francisco / Roboto) sur mobile
const ff = Platform.OS === 'web' ? 'Inter, sans-serif' : undefined;

export const F = {
  regular: { fontFamily: ff, fontWeight: '400' },
  medium: { fontFamily: ff, fontWeight: '500' },
  semi: { fontFamily: ff, fontWeight: '600' },
  bold: { fontFamily: ff, fontWeight: '700' },
};
