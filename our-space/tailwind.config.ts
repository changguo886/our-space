import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF7F1",
        paper: "#FFFDFA",
        line: "#EFE8DE",
        ink: { DEFAULT: "#2F3A45", soft: "#5B6570", faint: "#9AA1A8" },
        sage: { 50: "#F1F6EF", 100: "#E3EDE0", 300: "#B7CFB2", 500: "#7A9A7E", 700: "#4F6F55" },
        blush: { 50: "#FBF1EF", 100: "#F6E2DE", 500: "#D98A80" },
        mist: { 50: "#EEF3F8", 100: "#E0E9F2", 500: "#7C9CBF" },
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "PingFang SC", "Hiragino Sans GB",
          "Noto Sans SC", "Microsoft YaHei", "Segoe UI", "sans-serif",
        ],
        hand: ["Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", "Songti SC", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(60,50,40,0.04), 0 4px 16px rgba(60,50,40,0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
