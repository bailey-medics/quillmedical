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
 */
export type BaseCardProps = Omit<
  CardProps,
  "children" | "shadow" | "padding" | "radius" | "withBorder"
> &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof CardProps> & {
    children: ReactNode;
  };

const BaseCard = forwardRef(function BaseCard(
  { children, ...rest }: BaseCardProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Card
      ref={ref}
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{ borderColor: "var(--mantine-color-gray-2)" }}
      {...rest}
    >
      {children}
    </Card>
  );
});

export default BaseCard;
