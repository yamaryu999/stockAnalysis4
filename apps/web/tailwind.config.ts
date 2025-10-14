import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b0d12",
          100: "#141824",
          200: "#1d2334"
        },
        accent: {
          DEFAULT: "#4f46e5"
        }
      }
    }
  },
  plugins: []
};

export default config;
