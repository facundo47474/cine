import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        netflix: {
          red: "#E50914",
          black: "#141414",
          dark: "#181818",
          gray: "#2F2F2F",
        },
      },
    },
  },
  plugins: [],
};

export default config;
