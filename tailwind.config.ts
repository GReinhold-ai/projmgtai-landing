import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/pages/**/*.{ts,tsx}", // safe even if you don't use Pages Router
  ],
  theme: {
    extend: {
      colors: {
        rewmo: {
          deep: "#003B49",
          coral: "#FF9151",
          aqua:  "#15C5C1",
          ink:   "#0B1F23",
          fog:   "#E6F2F3",
          card:  "#0E4450",
          white: "#FFFFFF",
        },
      },
      boxShadow: {
        soft: "0 8px 24px rgba(0,0,0,0.18)",
        subtle: "0 4px 16px rgba(0,0,0,0.10)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
