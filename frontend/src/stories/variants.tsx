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
      {horizontal ? <Group gap="md">{children}</Group> : children}
      <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>{label}</div>
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
  /** Pseudo-state to force on descendant elements */
  state?: PseudoState;
  /** Content to display */
  children: ReactNode;
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
export function StateRow({ label, state, children, style }: StateRowProps) {
  return (
    <VariantRow label={label} horizontal={false}>
      <div
        className={state ? `pseudo-${state}-all` : undefined}
        style={{ pointerEvents: "none", ...style }}
      >
        {children}
      </div>
    </VariantRow>
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
