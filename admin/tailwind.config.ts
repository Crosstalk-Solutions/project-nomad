/** @type {import('tailwindcss').Config} */

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        desert: "#EADAB9",
        "desert-green-light": "#BABAAA",
      },
    },
  },
};
