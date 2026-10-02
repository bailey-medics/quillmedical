// This file has been automatically migrated to valid ESM format by Storybook.
import type { StorybookConfig } from "@storybook/react-vite";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import postcssPresetMantine from "postcss-preset-mantine";
import postcssSimpleVars from "postcss-simple-vars";
import remarkGfm from "remark-gfm";
import tsconfigPaths from "vite-tsconfig-paths";
// `with { type: "json" }` because Storybook loads this file through Node's
// own module loader, which refuses a JSON import without it.
import breakpoints from "../src/breakpoints.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The `$mantine-breakpoint-*` variables for CSS modules, built from the
 * same file the Mantine theme reads. See postcss.config.cjs.
 */
const breakpointVariables = Object.fromEntries(
  Object.entries(breakpoints).map(([name, width]) => [
    `mantine-breakpoint-${name}`,
    width,
  ]),
);

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],
  staticDirs: ["../public"],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tsconfigPaths()];

    // react-player v3 uses youtube-video-element (custom element) which
    // hangs the Storybook static build. Alias to a stub during build only.
    if (process.env.NODE_ENV === "production") {
      config.resolve = {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias ?? {}),
          "react-player": resolve(__dirname, "react-player-stub.tsx"),
        },
      };
    }

    config.css = {
      ...config.css,
      postcss: {
        plugins: [
          postcssPresetMantine(),
          postcssSimpleVars({
            variables: breakpointVariables,
          }),
        ],
      },
    };
    return config;
  },
};

export default config;
