/**
 * Whether the side navigation is folded away behind the hamburger.
 *
 * Below `md`, not `sm`: a tablet held upright (an iPad or a Galaxy Tab at
 * 750 to 850px) is wider than a phone but too narrow to give 260px to a
 * side bar and still leave room for the page. Everything else responsive
 * — stacked buttons, padding, form layout — still switches at `sm`.
 *
 * When this is true the ribbon is in its narrow form too: the hamburger
 * shows and the Quill name does not. The two never appear together.
 */

import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export function useNavCollapsed(): boolean {
  const theme = useMantineTheme();
  return useMediaQuery(`(max-width: ${theme.breakpoints.md})`) ?? false;
}
