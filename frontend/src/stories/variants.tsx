/**
 * Storybook Variant Display Helpers
 *
 * Reusable layout components for "All sizes" / "All variants" stories.
 * Renders rows of content with a label underneath each row.
 *
 * @example
 * ```tsx
 * <VariantStack>
 *   <VariantRow label="sm">
 *     <MyComponent size="sm" />
 *   </VariantRow>
 *   <VariantRow label="lg (default)">
 *     <MyComponent size="lg" />
 *   </VariantRow>
 * </VariantStack>
 * ```
 */

import type { CSSProperties, ReactNode } from "react";
import { Stack, Group } from "@mantine/core";

type VariantRowProps = {
  /** Label displayed below the row */
  label: string;
  /** Content to display in the row */
  children: ReactNode;
  /** Use Group (horizontal) or plain div (single item). Default: true */
  horizontal?: boolean;
};

/**
 * A single labelled row of variant content.
 */
export function VariantRow({
  label,
  children,
  horizontal = true,
}: VariantRowProps) {
  return (
    <div>
      <div
        style={{
          marginBottom: "0.5rem",
          fontSize: "0.875rem",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      {horizontal ? <Group gap="md">{children}</Group> : children}
    </div>
  );
}

type PseudoState =
  | "hover"
  | "active"
  | "focus"
  | "focus-visible"
  | "focus-within"
  | "visited"
  | "link"
  | "target";

type StateRowProps = {
  /** Label displayed below the row */
  label: string;
  /** Pseudo-state(s) to force on descendant elements */
  state?: PseudoState | PseudoState[];
  /** Content to display */
  children: ReactNode;
  /** Horizontal alignment. Default: "center" */
  align?: "center" | "start";
  /** Additional styles for the wrapper div */
  style?: CSSProperties;
};

/**
 * A labelled row for displaying a forced pseudo-state.
 *
 * Applies `pseudo-{state}-all` class so `storybook-addon-pseudo-states`
 * rewritten CSS activates the state on descendant elements.
 * Also sets `pointer-events: none` to prevent real browser interactions
 * from overriding the forced state.
 */
export function StateRow({
  label,
  state,
  children,
  align = "center",
  style,
}: StateRowProps) {
  const states = state ? (Array.isArray(state) ? state : [state]) : [];
  const className =
    states.length > 0
      ? states.map((s) => `pseudo-${s}-all`).join(" ")
      : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "start" ? "flex-start" : "center",
      }}
    >
      <div className={className} style={{ pointerEvents: "none", ...style }}>
        {children}
      </div>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>{label}</div>
    </div>
  );
}

type VariantStackProps = {
  /** VariantRow elements */
  children: ReactNode;
};

/**
 * Vertical stack of VariantRow elements with consistent spacing.
 */
export function VariantStack({ children }: VariantStackProps) {
  return <Stack gap="xl">{children}</Stack>;
}
