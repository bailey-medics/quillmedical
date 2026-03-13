/**
 * Button state constants for Storybook stories.
 *
 * Shared constants for simulating interaction states (hover, active, focus, disabled)
 * on button-like components in Storybook stories.
 *
 * Separated from component files so Fast Refresh continues to work.
 */

/**
 * Interaction states used in button state grids.
 * Each entry defines a label, extra props to apply, and a CSS class
 * that simulates the interaction state visually.
 */
export const BUTTON_STATES = [
  { label: "default", props: {}, className: "sb-state-default" },
  { label: "hover", props: {}, className: "sb-state-hover" },
  { label: "active", props: {}, className: "sb-state-active" },
  { label: "focus-visible", props: {}, className: "sb-state-focus" },
  {
    label: "disabled",
    props: { disabled: true },
    className: "sb-state-default",
  },
] as const;

/** CSS class name for each interaction state */
export type ButtonStateClassName = (typeof BUTTON_STATES)[number]["className"];

/**
 * CSS that forces pseudo-states on nested button elements.
 * Inject this once via `<style>` when using `ButtonStateGrid`.
 */
export const buttonStateCss = `
  .sb-state-default button { pointer-events: none; }
  .sb-state-hover button {
    filter: brightness(0.95);
    pointer-events: none;
  }
  .sb-state-active button {
    filter: brightness(0.9);
    transform: translateY(1px);
    pointer-events: none;
  }
  .sb-state-focus button {
    outline: 2px solid var(--mantine-primary-color-filled);
    outline-offset: 2px;
    pointer-events: none;
  }
`;
