/** Identité visuelle du SRS §17.1 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#101B2D', 700: '#1a2a44', 600: '#24385a' },
        // palette de l'interface « Scout » (azur, bleu des liens, orange des étiquettes, fond gris très clair)
        wy: { azur: '#29ABE2', bleu: '#1F8FD0', orange: '#F28C28', fond: '#F4F5F6', bord: '#D9DCDF', vert: '#6AB04C', texte: '#333333', doux: '#7A8288' },
        brand: { green: '#20B56B', blue: '#2475D2', orange: '#F59E0B', red: '#E5484D' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
