/**
 * BaseCard Component
 *
 * Standard card wrapper enforcing consistent styling across the app.
 * All cards in the application should use BaseCard instead of Mantine's
 * Card directly. This ensures uniform shadow, padding, and radius.
 *
 * Fixed props (not overridable):
 *   shadow="sm"  padding="lg"  radius="md"
 *
 * All other Mantine Card props are forwarded.
 */

import { Card, type CardProps } from "@mantine/core";
import { forwardRef, type ReactNode, type Ref } from "react";

/**
 * Props for BaseCard.
 *
 * Extends Mantine CardProps and HTML div attributes, but omits the
 * fixed styling props so they cannot be overridden by consumers.
 * `children` is re-declared as required.
 *
 * Pass `bg` (a Mantine colour value) to create a coloured card —
 * the border is automatically removed and text set to white.
 */
export type BaseCardProps = Omit<
  CardProps,
  "children" | "shadow" | "padding" | "radius" | "withBorder"
> &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof CardProps> & {
    children: ReactNode;
  };

/**
 * Mantine's default shadows use very low opacity (4-5%) which is
 * invisible against coloured backgrounds. This provides a visible
 * shadow for coloured cards.
 */
const COLOURED_CARD_SHADOW =
  "0 1px 3px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.22)";

const BaseCard = forwardRef(function BaseCard(
  { children, bg, style, ...rest }: BaseCardProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasBg = !!bg;

  return (
    <Card
      ref={ref}
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder={!hasBg}
      bg={bg}
      c={hasBg ? "white" : undefined}
      style={{
        overflow: "visible",
        ...(!hasBg && {
          backgroundColor: "var(--card-bg, var(--mantine-color-body))",
          borderColor: "var(--card-border-color, var(--mantine-color-gray-2))",
        }),
        ...(hasBg && { boxShadow: COLOURED_CARD_SHADOW }),
        ...((typeof style === "object" && style) || {}),
      }}
      {...rest}
    >
      {children}
    </Card>
  );
});

export default BaseCard;
