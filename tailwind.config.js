const path = require("path");

/**
 * Palette TOP FAMILLE - "cinematic game show".
 * Bleu profond (le studio), bleu electrique (les LED), or (le logo et les
 * points), rouge / bleu pour les deux equipes.
 *
 * Config en .js volontairement : en .ts, Next ne parvient pas a la charger
 * dans le contexte PostCSS et Tailwind repart sur sa config par defaut
 * (content vide) — la base est bien emise, mais AUCUN utilitaire n'est
 * genere. Le symptome est traitre : la page s'affiche, simplement toute la
 * mise en page a disparu.
 *
 * Les globs `content` sont ancres sur __dirname, pas sur le repertoire
 * courant : sinon un `next dev` lance depuis ailleurs ne trouve aucun fichier
 * a scanner et genere zero utilitaire, silencieusement.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    path.join(__dirname, "app/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "components/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        stage: {
          950: "#03060f", // le noir du plateau, jamais du vrai noir
          900: "#060b1c",
          800: "#0a1330",
          700: "#101c48",
          600: "#17275f",
        },
        electric: {
          DEFAULT: "#2f7bff",
          soft: "#6aa5ff",
          deep: "#1445b8",
        },
        gold: {
          DEFAULT: "#f5c344",
          soft: "#ffe08a",
          deep: "#b8860a",
        },
        teamR: { DEFAULT: "#ff3b5c", soft: "#ff8095", deep: "#a3072a" },
        teamB: { DEFAULT: "#38a8ff", soft: "#8fd0ff", deep: "#0b5ba8" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glowGold: "0 0 60px -10px rgba(245,195,68,0.55)",
        glowR: "0 0 60px -10px rgba(255,59,92,0.6)",
        glowB: "0 0 60px -10px rgba(56,168,255,0.6)",
        led: "inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 40px -18px rgba(0,0,0,0.9)",
      },
    },
  },
  plugins: [],
};
