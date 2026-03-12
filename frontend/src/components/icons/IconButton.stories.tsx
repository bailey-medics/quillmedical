/**
 * IconButton Component Stories
 *
 * Storybook stories for the IconButton component.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Group, Stack } from "@mantine/core";
import IconButton from "./IconButton";
import { IconPencil } from "@tabler/icons-react";

const meta = {
  title: "Icons/IconButton",
  component: IconButton,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const variants = [
  "subtle",
  "light",
  "filled",
  "outline",
  "default",
  "transparent",
  "white",
] as const;

/**
 * All Mantine style variants.
 */
export const Default: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Edit",
  },
};
/**
 * All three sizes shown side-by-side for comparison.
 * Resize browser below 768px to see mobile sizes.
 */
export const AllSizes: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Example",
  },
  render: () => (
    <Stack gap="lg">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size}>
          <IconButton icon={<IconPencil />} size={size} aria-label={size} />
          <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {size === "md" ? `${size} (default)` : size}
          </div>
        </div>
      ))}
    </Stack>
  ),
};

const states = [
  { label: "default", props: {}, className: "no-hover" },
  { label: "hover", props: {}, className: "force-hover" },
  { label: "active", props: {}, className: "force-active" },
  { label: "focus-visible", props: {}, className: "force-focus" },
  { label: "disabled", props: { disabled: true }, className: "no-hover" },
] as const;

/**
 * Each variant as a row, showing all states.
 */
export const VariantsAndStates: Story = {
  args: {
    icon: <IconPencil />,
    "aria-label": "Example",
  },
  render: () => (
    <>
      <style>{`
        .force-hover button {
          background-color: var(--ai-hover, var(--mantine-primary-color-filled-hover)) !important;
          color: var(--ai-hover-color, var(--ai-color)) !important;
        }
        .force-active button {
          background-color: var(--ai-hover, var(--mantine-primary-color-filled-hover)) !important;
          color: var(--ai-hover-color, var(--ai-color)) !important;
          transform: translateY(1px);
        }
        .force-focus button {
          outline: 2px solid var(--mantine-primary-color-filled) !important;
          outline-offset: 2px;
          pointer-events: none;
        }
        .no-hover button {
          pointer-events: none;
        }
      `}</style>
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
              {states.map(({ label, props, className }) => (
                <div
                  key={label}
                  className={className}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <IconButton
                    icon={<IconPencil />}
                    variant={variant}
                    aria-label={`${variant} ${label}`}
                    {...props}
                  />
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
  ),
};
