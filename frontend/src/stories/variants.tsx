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

import type { ReactNode } from "react";
import { Stack, Group } from "@mantine/core";
import { BUTTON_STATES, buttonStateCss } from "./button-states";

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

type ButtonStateGridProps = {
  /** List of variant names to show as rows */
  variants: readonly string[];
  /** Render a button for a given variant and state.
   *  `stateProps` contains `{ disabled: true }` for the disabled state. */
  renderButton: (
    variant: string,
    stateProps: Record<string, unknown>,
  ) => ReactNode;
};

/**
 * Grid showing every variant × interaction state for button-like components.
 *
 * Renders one row per variant, with columns for: default, hover, active,
 * focus-visible, and disabled. Includes CSS to simulate each state.
 *
 * @example
 * ```tsx
 * <ButtonStateGrid
 *   variants={["subtle", "filled", "outline"]}
 *   renderButton={(variant, stateProps) => (
 *     <IconButton
 *       icon={<IconPencil />}
 *       variant={variant}
 *       aria-label={variant}
 *       {...stateProps}
 *     />
 *   )}
 * />
 * ```
 */
export function ButtonStateGrid({
  variants,
  renderButton,
}: ButtonStateGridProps) {
  return (
    <>
      <style>{buttonStateCss}</style>
      <Stack gap="lg">
        {variants.map((variant) => (
          <div key={variant}>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                marginBottom: "0.5rem",
              }}
            >
              {variant}
            </div>
            <Group gap="xl">
              {BUTTON_STATES.map(({ label, props, className }) => (
                <div
                  key={label}
                  className={className}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {renderButton(variant, props)}
                  <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
                    {label}
                  </div>
                </div>
              ))}
            </Group>
          </div>
        ))}
      </Stack>
    </>
  );
}
