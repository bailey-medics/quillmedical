// eslint.config.js (flat config)
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import storybook from 'eslint-plugin-storybook';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  [
    // Ignore built artefacts
    { ignores: ['dist', 'build', 'node_modules', 'coverage'] },

    {
      files: ['**/*.{ts,tsx}'],
      extends: [
        js.configs.recommended,
        ...tseslint.configs.recommended,
        reactHooks.configs['recommended-latest'],
        reactRefresh.configs.vite,
        // Keep Prettier LAST so it can turn off conflicting stylistic rules
        eslintConfigPrettier,
      ],
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
      },
    },
  ],
  // Storybook’s flat config can stay as a sibling layer
  storybook.configs['flat/recommended'],
);
