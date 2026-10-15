// postcss-preset-mantine ships `declare module "postcss-preset-mantine";`
// and nothing more, which types every import from it as `any`. This says
// what the default export is: a PostCSS plugin creator.
declare module "postcss-preset-mantine" {
  import type { PluginCreator } from "postcss";

  const preset: PluginCreator<{ autoRem?: boolean }>;
  export default preset;
}
