// eslint.config.ts (flat config), loaded through jiti
import js from "@eslint/js";
import type { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import storybook from "eslint-plugin-storybook";
import tseslint from "typescript-eslint";
import regexp from "eslint-plugin-regexp";
import react from "eslint-plugin-react";
import noSecrets from "eslint-plugin-no-secrets";
import jsxA11y from "eslint-plugin-jsx-a11y";

/** One import from a package that app code may not make. */
interface RestrictedPath {
  name: string;
  importNames: string[];
  message: string;
}

/** Imports matching a pattern that app code may not make. */
interface RestrictedPattern {
  group: string[];
  message: string;
}

// The imports app code may not make, each named once so an exemption can
// restate the rule with the entries that still apply there, rather than
// turning the whole rule off.
const MANTINE_PROVIDER: RestrictedPath = {
  name: "@mantine/core",
  importNames: ["MantineProvider"],
  message:
    "Don't use MantineProvider directly. Tests: use renderWithMantine/renderWithRouter. Stories: use the preview decorator.",
};
const ACTION_ICON: RestrictedPath = {
  name: "@mantine/core",
  importNames: ["ActionIcon"],
  message:
    "Use IconButton from @/components/button: it requires an aria-label, which an icon-only button needs to be announced as more than 'button'.",
};
const LOADER: RestrictedPath = {
  name: "@mantine/core",
  importNames: ["Loader"],
  message:
    "Use QuillSpinner or PageSpinner from @/components/loading-spinner: a bare Loader has no text, so a screen reader user hears nothing while they wait.",
};
const STORIES_HELPERS: RestrictedPattern = {
  // Every way the import can be written: the alias, a relative path into a
  // stories folder, and a story file itself, by any path
  group: ["@/stories/*", "**/stories/*", "*.stories", "*.stories.*"],
  message:
    "Storybook helpers (StoryNote, VariantRow, etc.) and story files are for stories only - never import in app code.",
};

/**
 * The `no-restricted-imports` rule with the given entries. Every file gets
 * all four; an exemption passes the ones it keeps.
 */
function restrictImports({
  paths = [MANTINE_PROVIDER, ACTION_ICON, LOADER],
  patterns = [STORIES_HELPERS],
}: {
  paths?: RestrictedPath[];
  patterns?: RestrictedPattern[];
} = {}): Linter.RuleEntry {
  return ["error", { paths, patterns }];
}

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
        "regexp/no-super-linear-backtracking": "error",
        "regexp/no-useless-quantifier": "error",

        // React XSS guard
        "react/no-danger": "error",

        // navigate() from React Router returns a promise that settles when
        // the navigation does; nothing waits for that, and any error goes
        // to the route's errorElement, so a call needs no await or void.
        "@typescript-eslint/no-floating-promises": [
          "error",
          {
            allowForKnownSafeCalls: [
              {
                from: "package",
                name: "NavigateFunction",
                package: "react-router",
              },
            ],
          },
        ],

        // An async event handler is the ordinary way to write one in
        // React, which discards the promise it returns, so the attribute
        // check is off. The rest of the rule stays: an async function
        // passed where a plain callback is expected, such as to forEach,
        // is still reported.
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],

        // `{...} as User` makes TypeScript trust an object whatever it
        // holds, so a missing field passes the type check. An annotation
        // (`const user: User = {...}`) or `satisfies` checks the fields.
        "@typescript-eslint/consistent-type-assertions": [
          "error",
          { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
        ],

        // A type argument that only repeats its default says nothing
        "@typescript-eslint/no-unnecessary-type-arguments": "error",

        // Loading Mantine at run time, `import("@mantine/core")`, would get
        // past the restricted imports above, which read only import and
        // export lines. Nothing needs to, so it is refused outright.
        "no-restricted-syntax": [
          "error",
          {
            selector: "ImportExpression[source.value='@mantine/core']",
            message:
              'Import @mantine/core the ordinary way, `import { ... } from "@mantine/core"`, so its restricted imports apply.',
          },
        ],

        // Built-in ESLint rules, which check TypeScript as well (no extra deps)
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",

        "no-console": ["error", { allow: ["warn", "error"] }],
        "no-secrets/no-secrets": ["error", { tolerance: 4.5 }],
        "no-restricted-imports": restrictImports(),
      },
    },
    // The places that mount MantineProvider: the app's two entry points,
    // the test wrappers, and the Storybook preview. Each may mount it and
    // nothing else that is restricted.
    {
      files: [
        "public_pages/src/main.tsx",
        "src/test/test-utils.tsx",
        "src/RootLayout.test.tsx",
      ],
      rules: {
        "no-restricted-imports": restrictImports({
          paths: [ACTION_ICON, LOADER],
        }),
      },
    },
    // The app's entry point mounts MantineProvider, and its service worker
    // registration uses console.log intentionally
    {
      files: ["src/main.tsx"],
      rules: {
        "no-restricted-imports": restrictImports({
          paths: [ACTION_ICON, LOADER],
        }),
        "no-console": "off",
      },
    },
    // The Storybook preview mounts MantineProvider for every story, and
    // uses console.log for mock debugging
    {
      files: [".storybook/preview.tsx"],
      rules: {
        "no-restricted-imports": restrictImports({
          paths: [ACTION_ICON, LOADER],
        }),
        "no-console": "off",
      },
    },
    // Storybook stories use console.log for action callbacks, and are what
    // the stories helpers are for. Before the blocks below, which excuse
    // one story from one more thing
    {
      files: ["**/*.stories.tsx"],
      rules: {
        "no-console": "off",
        "no-restricted-imports": restrictImports({ patterns: [] }),
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
        "no-restricted-imports": restrictImports({
          paths: [MANTINE_PROVIDER, LOADER],
        }),
      },
    },
    // The two buttons that show a small spinner while they work, and the
    // story that shows one. The button itself says what is happening, so
    // the spinner is hidden from assistive technology; every other wait is
    // a QuillSpinner
    {
      files: [
        "src/components/button/ButtonPairRed.tsx",
        "src/components/form/Form/SubmitButton.tsx",
        "src/components/button/ButtonPair.stories.tsx",
      ],
      rules: {
        "no-restricted-imports": restrictImports({
          paths: [MANTINE_PROVIDER, ACTION_ICON],
        }),
      },
    },
    // A story that supplies its own router, with initial state, bypasses
    // the preview decorator and so must mount MantineProvider itself (see
    // .claude/rules/components.md)
    {
      files: [
        "src/components/error-boundary/RouteErrorFallback.stories.tsx",
        "src/components/page-message/PageMessage.stories.tsx",
      ],
      rules: {
        "no-restricted-imports": restrictImports({
          paths: [ACTION_ICON, LOADER],
          patterns: [],
        }),
      },
    },
    // In a test or a story, `async () => value` is the shortest way to
    // stub something that returns a promise, and an `async` test body
    // with nothing to wait for does no harm. The rule is for app code,
    // where an async function with no await is usually a missing one.
    {
      files: [
        "**/*.test.{ts,tsx}",
        "**/*.stories.{ts,tsx}",
        "src/test/**/*.{ts,tsx}",
        "e2e/**/*.ts",
      ],
      rules: {
        "@typescript-eslint/require-await": "off",
      },
    },
    // Build scripts use console.log for progress output
    {
      files: ["scripts/**/*.ts", "public_pages/scripts/**/*.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
  // Storybook’s flat config can stay as a sibling layer. Its published
  // types build its rules on typescript-eslint's RuleModule, which ESLint's
  // own config type does not accept, though ESLint runs them; the cast says
  // what the value is to ESLint
  storybook.configs["flat/recommended"] as Linter.Config[],
);
