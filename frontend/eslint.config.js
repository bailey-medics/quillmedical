// eslint.config.js (flat config)
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
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

export default defineConfig(
  [
    // Ignore built artefacts
    { ignores: ["dist", "build", "node_modules", "coverage"] },

    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        js.configs.recommended,
        ...tseslint.configs.recommendedTypeChecked,
        reactHooks.configs.flat.recommended,
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
        // Type-aware rules read each file's own tsconfig, found by the
        // project service, so a missed `await` on an API call is caught
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      plugins: { regexp, react, "no-secrets": noSecrets },
      // Lint `<Image>` (ours and Mantine's) as an img, so alt-text sees it
      settings: { "jsx-a11y": { components: { Image: "img" } } },
      rules: {
        "regexp/no-super-linear-backtracking": "warn",
        "regexp/no-useless-quantifier": "warn",

        // New: React XSS guard
        "react/no-danger": "warn",

        // An async event handler is the ordinary way to write one in
        // React, which discards the promise it returns, so the attribute
        // check is off. The rest of the rule stays: an async function
        // passed where a plain callback is expected, such as to forEach,
        // is still reported.
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],

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
              {
                name: "@mantine/core",
                importNames: ["Loader"],
                message:
                  "Use QuillSpinner or PageSpinner from @/components/loading-spinner: a bare Loader has no text, so a screen reader user hears nothing while they wait.",
              },
            ],
            patterns: [
              {
                group: ["@/stories/*"],
                message:
                  "Storybook helpers (StoryNote, VariantRow, etc.) are for stories only - never import in app code.",
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
        "public_pages/src/main.tsx",
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
        "src/components/button/ExtraButton.tsx",
        "src/components/ellipsis-menu/EllipsisMenu.tsx",
        "src/components/form/FilterSelect.tsx",
        "src/components/inbox/InboxButton.tsx",
        "src/components/search/SearchFields.tsx",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
    // The two buttons that show a small ring while they work. The button
    // itself says what is happening, so the ring is hidden from
    // assistive technology; every other wait is a QuillSpinner
    {
      files: [
        "src/components/button/ButtonPairRed.tsx",
        "src/components/form/Form/SubmitButton.tsx",
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

    // Phase 1 scaffolding: removed as each phase of the type-aware ESLint
    // plan lands (docs/docs/plans/2026-10-14-type-aware-eslint-plan.md).
    // Each line is a type-aware rule whose findings are not yet fixed,
    // turned off so lint passes meanwhile. What is still here is what is
    // still to do. Delete a line when its phase lands, and this block when
    // the last one does.
    {
      files: ["**/*.{ts,tsx}"],
      rules: {
        // Phase 2
        "@typescript-eslint/no-misused-promises": "off",
        // Phase 3
        "@typescript-eslint/require-await": "off",
        // Phases 4 and 5
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        // Phase 5
        "@typescript-eslint/no-base-to-string": "off",
        "@typescript-eslint/no-redundant-type-constituents": "off",
        "@typescript-eslint/prefer-promise-reject-errors": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/unbound-method": "off",
      },
    },
    // Phase 2 scaffolding, one folder per branch: no-floating-promises is
    // on everywhere but these, so a promise left without await anywhere
    // else is caught from now on
    {
      files: ["src/pages/**/*.{ts,tsx}"],
      rules: { "@typescript-eslint/no-floating-promises": "off" },
    },
    {
      files: ["src/features/**/*.{ts,tsx}"],
      rules: { "@typescript-eslint/no-floating-promises": "off" },
    },
    {
      files: ["src/components/**/*.{ts,tsx}", "src/sw.ts"],
      rules: { "@typescript-eslint/no-floating-promises": "off" },
    },
  ],
  // Storybook’s flat config can stay as a sibling layer
  storybook.configs["flat/recommended"],
);
