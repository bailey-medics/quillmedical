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
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  [
    // Ignore built artefacts
    { ignores: ["dist", "build", "node_modules", "coverage"] },

    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        js.configs.recommended,
        ...tseslint.configs.recommended,
        reactHooks.configs.flat["recommended-latest"],
        reactRefresh.configs.vite,
        // The static half of accessibility: labels, alt text, roles and
        // keyboard handlers, caught before a story renders.
        jsxA11y.flatConfigs.recommended,
        // Keep Prettier LAST so it can turn off conflicting stylistic rules
        eslintConfigPrettier,
      ],
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
      },
      plugins: { regexp, react, "no-secrets": noSecrets },
      // Lint `<Image>` (ours and Mantine's) as an img, so alt-text sees it
      settings: { "jsx-a11y": { components: { Image: "img" } } },
      rules: {
        "regexp/no-super-linear-backtracking": "warn",
        "regexp/no-useless-quantifier": "warn",

        // New: React XSS guard
        "react/no-danger": "warn",

        // Core JS “don’t shoot your foot” (no extra deps)
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",

        "no-console": ["error", { allow: ["warn", "error"] }],
        "no-secrets/no-secrets": ["warn", { tolerance: 4.5 }],
        // Prevent raw MantineProvider usage outside approved entry points
        "no-restricted-imports": [
          "warn",
          {
            paths: [
              {
                name: "@mantine/core",
                importNames: ["MantineProvider"],
                message:
                  "Don't use MantineProvider directly. Tests: use renderWithMantine/renderWithRouter. Stories: use the preview decorator.",
              },
              {
                name: "@mantine/core",
                importNames: ["ActionIcon"],
                message:
                  "Use IconButton from @/components/button: it requires an aria-label, which an icon-only button needs to be announced as more than 'button'.",
              },
            ],
            patterns: [
              {
                group: ["@/stories/*"],
                message:
                  "Storybook helpers (StoryNote, VariantRow, etc.) are for stories only — never import in app code.",
              },
            ],
          },
        ],
      },
    },
    // Allow MantineProvider in the approved entry points
    {
      files: [
        "src/main.tsx",
        "src/test/test-utils.tsx",
        "src/RootLayout.test.tsx",
        ".storybook/preview.tsx",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
    // The icon-button wrappers themselves, each of which takes or sets
    // its own aria-label; everything else goes through them
    {
      files: [
        "src/components/button/IconButton.tsx",
        "src/components/button/BurgerButton.tsx",
        "src/components/button/SearchButton.tsx",
        "src/components/ellipsis-menu/EllipsisMenu.tsx",
        "src/components/form/FilterSelect.tsx",
        "src/components/passport/InboxButton.tsx",
        "src/components/search/SearchFields.tsx",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
    // Service worker registration uses console.log intentionally
    {
      files: ["src/main.tsx"],
      rules: {
        "no-console": "off",
      },
    },
    // Storybook stories use console.log for action callbacks
    {
      files: ["**/*.stories.tsx"],
      rules: {
        "no-console": "off",
        "no-restricted-imports": "off",
      },
    },
    // Storybook preview uses console.log for mock debugging
    {
      files: [".storybook/preview.tsx"],
      rules: {
        "no-console": "off",
      },
    },
    // Build scripts use console.log for progress output
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
  // Storybook’s flat config can stay as a sibling layer
  storybook.configs["flat/recommended"],
);
