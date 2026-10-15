// postcss-preset-mantine ships `declare module "postcss-preset-mantine";`
// and nothing more, which types every import from it as `any`. This says
// what the default export is: a PostCSS plugin creator.
//
// It takes effect only when it is read before the package's own bare
// declaration, so a tsconfig that includes it lists it first: see the
// `include` in public_pages/tsconfig.json.
declare module "postcss-preset-mantine" {
  import type { PluginCreator } from "postcss";

  const preset: PluginCreator<{ autoRem?: boolean }>;
  export default preset;
}
