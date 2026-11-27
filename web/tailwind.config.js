/** Identité visuelle du SRS §17.1 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#101B2D', 700: '#1a2a44', 600: '#24385a' },
        // palette de l'interface « Scout » (azur, bleu des liens, orange des étiquettes, fonds)
        wy: { azur: '#00AAFF', orange: '#F28C28', vert: '#6AB04C',
          // clairs par défaut (pages publiques), sombres sous la classe « sombre » (voir index.css)
          bleu: 'var(--wy-bleu)', fond: 'var(--wy-fond)', bord: 'var(--wy-bord)', texte: 'var(--wy-texte)', doux: 'var(--wy-doux)' },
        brand: { green: '#20B56B', blue: '#2475D2', orange: '#F59E0B', red: '#E5484D' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
