// eslint.config.js

import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  // Global ignore patterns
  { ignores: ["dist/", "node_modules/"] },

  // Base configuration for all JavaScript files
  pluginJs.configs.recommended,

  // Configuration for React files (in the src/ folder)
  {
    files: ["src/**/*.{js,jsx}"],
    ...pluginReactConfig,
    languageOptions: {
      ...pluginReactConfig.languageOptions,
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      ...pluginReactConfig.rules,
      "react/prop-types": "off", // Optional: Turns off prop-types warnings
      "react/react-in-jsx-scope": "off", // Not needed with modern React/Vite
      "react-refresh/only-export-components": "warn",
    },
  },

  // Configuration for Node.js files (electron.js and preload.js)
  {
    files: ["electron.js", "preload.js"],
    languageOptions: {
      globals: {
        ...globals.node, // <-- This is the key change for your Node files
      },
    },
  },
];
