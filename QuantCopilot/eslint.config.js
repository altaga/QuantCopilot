
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// exportamos el modulo para usarlo en el pipeline
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  }
]);
