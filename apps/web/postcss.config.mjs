/*
  Tailwind v4 se carga por PostCSS y no por su plugin de Vite: el plugin de Vite usa una
  API interna (`createIdResolver`) que el Vite/rolldown de Astro 7 ya no expone.
*/
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
