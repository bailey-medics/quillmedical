/**
 * Solid Switch Component
 *
 * A Mantine Switch wrapper with a solid thumb (no inner ring/hole).
 * Renders an optional top label, a switch with automatic "No"/"Yes"
 * inline text, and an optional description below.
 */

import { Switch, Text, type SwitchProps } from "@mantine/core";
import classes from "./SolidSwitch.module.css";

interface SolidSwitchProps extends Omit<SwitchProps, "label" | "description"> {
  /** Label displayed above the switch (matches form field style) */
  label: string;
  /** Helper text displayed below the switch */
  description?: string;
}

export default function SolidSwitch({
  label,
  description,
  checked,
  classNames,
  size = "lg",
  ...rest
}: SolidSwitchProps) {
  return (
    <div>
      <Text className={classes.topLabel}>{label}</Text>
      <Switch
        {...rest}
        checked={checked}
        size={size}
        label={checked ? "Yes" : "No"}
        classNames={{ thumb: classes.thumb, ...classNames }}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-lg)",
            color: "var(--mantine-color-dimmed)",
          },
        }}
      />
      {description && (
        <Text className={classes.description}>{description}</Text>
      )}
    </div>
  );
}
