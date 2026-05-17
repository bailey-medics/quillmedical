import type { StorybookConfig } from "@storybook/react-vite";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import postcssPresetMantine from "postcss-preset-mantine";
import postcssSimpleVars from "postcss-simple-vars";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "storybook-addon-pseudo-states"],
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
            variables: {
              "mantine-breakpoint-xs": "36em",
              "mantine-breakpoint-sm": "48em",
              "mantine-breakpoint-md": "62em",
              "mantine-breakpoint-lg": "75em",
              "mantine-breakpoint-xl": "88em",
            },
          }),
        ],
      },
    };
    return config;
  },
};

export default config;
