/** Identité visuelle du SRS §17.1 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#101B2D', 700: '#1a2a44', 600: '#24385a' },
        brand: { green: '#20B56B', blue: '#2475D2', orange: '#F59E0B', red: '#E5484D' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
