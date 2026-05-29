/** @type {import('tailwindcss').Config} */
module.exports = {
  // Le decimos a Tailwind qué archivos debe revisar para aplicar estilos
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}