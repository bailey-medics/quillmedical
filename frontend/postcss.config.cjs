// The breakpoints live in src/breakpoints.json, which the Mantine theme
// reads too, so `$mantine-breakpoint-sm` in a CSS module and
// `theme.breakpoints.sm` in a component are the same width. They were
// separate lists once, and `sm` was 48em here and 40em in the theme.
const breakpoints = require("./src/breakpoints.json");

module.exports = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: Object.fromEntries(
        Object.entries(breakpoints).map(([name, width]) => [
          `mantine-breakpoint-${name}`,
          width,
        ]),
      ),
    },
  },
};
