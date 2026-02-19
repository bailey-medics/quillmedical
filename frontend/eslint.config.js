// eslint.config.js (flat config)
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import storybook from "eslint-plugin-storybook";
import globals from "globals";
import tseslint from "typescript-eslint";
import regexp from "eslint-plugin-regexp";
import react from "eslint-plugin-react";
import noSecrets from "eslint-plugin-no-secrets";

export default tseslint.config(
  [
    // Ignore built artefacts
    { ignores: ["dist", "build", "node_modules", "coverage"] },

    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        js.configs.recommended,
        ...tseslint.configs.recommended,
        reactHooks.configs["recommended-latest"],
        reactRefresh.configs.vite,
        // Keep Prettier LAST so it can turn off conflicting stylistic rules
        eslintConfigPrettier,
      ],
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
      },
      plugins: { regexp, react, "no-secrets": noSecrets },
      rules: {
        "regexp/no-super-linear-backtracking": "warn",
        "regexp/no-useless-quantifier": "warn",

        // New: React XSS guard
        "react/no-danger": "warn",

        // Core JS “don’t shoot your foot” (no extra deps)
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",

        "no-secrets/no-secrets": ["warn", { tolerance: 4.5 }],
      },
    },
    // Custom rule: Page layout consistency
    {
      files: ["**/pages/**/*.tsx"],
      rules: {
        // Warn if page file doesn't import Container from @mantine/core
        // This helps catch pages missing the standard <Container size="lg"> wrapper
        "no-restricted-syntax": [
          "warn",
          {
            selector:
              "Program:not(:has(ImportDeclaration[source.value='@mantine/core'] ImportSpecifier[imported.name='Container']))",
            message:
              "Page components should import Container from @mantine/core for consistent 1140px max-width. Use: <Container size='lg' py='xl'><Stack gap='lg'>...</Stack></Container>",
          },
        ],
      },
    },
  ],
  // Storybook’s flat config can stay as a sibling layer
  storybook.configs["flat/recommended"],
);
