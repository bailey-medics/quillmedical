/**
 * QuillCard Component
 *
 * Standard card wrapper enforcing consistent border styling across the app.
 * All cards in the application should use QuillCard instead of Mantine's
 * Card directly. This ensures uniform shadow, radius, and border treatment.
 *
 * Default props (matching the app standard):
 *   shadow="sm"  padding="lg"  radius="md"  withBorder
 *
 * Padding can be overridden per-use (e.g. "md" for compact lists).
 * All other Mantine Card props are forwarded.
 */

import { Card, type CardProps } from "@mantine/core";
import { forwardRef, type ReactNode, type Ref } from "react";

export interface QuillCardProps extends Omit<CardProps, "children"> {
  children: ReactNode;
}

const QuillCard = forwardRef(function QuillCard(
  {
    children,
    shadow = "sm",
    padding = "lg",
    radius = "md",
    ...rest
  }: QuillCardProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Card
      ref={ref}
      shadow={shadow}
      padding={padding}
      radius={radius}
      withBorder
      {...rest}
    >
      {children}
    </Card>
  );
});

QuillCard.displayName = "QuillCard";

export default QuillCard;
