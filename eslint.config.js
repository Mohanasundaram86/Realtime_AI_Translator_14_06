// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // backend/ is a separate Node.js/Lambda project (its own package.json),
    // not part of the Expo app above — expoConfig's rules are still fine here,
    // but it declares browser/react-native globals, not Node/Lambda ones. That
    // previously caused false no-undef positives on every backend file
    // (Buffer as a warning; now also awslambda, as a hard error, added by the
    // Phase 1 streaming handler) — declaring the real runtime globals here
    // fixes both instead of living with the noise indefinitely.
    files: ["backend/**/*.mjs"],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Injected by the Lambda Node.js runtime for streaming responses
        // (awslambda.streamifyResponse / awslambda.HttpResponseStream) — not
        // a real import, so eslint has no other way to know it exists.
        awslambda: 'readonly',
      },
    },
  },
]);
