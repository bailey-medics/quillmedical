// useBreakpoint.ts
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export type BreakKey = "xs" | "sm" | "md" | "lg" | "xl";

export function useBreakpoint(): BreakKey {
  const theme = useMantineTheme();

  // Use min-width so we can pick the largest matching key
  const upXs = useMediaQuery(`(min-width: ${theme.breakpoints.xs})`, undefined, {
    getInitialValueInEffect: true,
  });
  const upSm = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`, undefined, {
    getInitialValueInEffect: true,
  });
  const upMd = useMediaQuery(`(min-width: ${theme.breakpoints.md})`, undefined, {
    getInitialValueInEffect: true,
  });
  const upLg = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`, undefined, {
    getInitialValueInEffect: true,
  });
  const upXl = useMediaQuery(`(min-width: ${theme.breakpoints.xl})`, undefined, {
    getInitialValueInEffect: true,
  });

  if (upXl) return "xl";
  if (upLg) return "lg";
  if (upMd) return "md";
  if (upSm) return "sm";
  return upXs ? "xs" : "xs"; // fallback for very small widths
}
