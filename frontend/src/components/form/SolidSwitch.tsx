/**
 * Solid Switch Component
 *
 * A Mantine Switch wrapper with a solid thumb (no inner ring/hole).
 * Renders an optional top label, a switch with automatic "No"/"Yes"
 * inline text, and an optional description below.
 */

import { Switch, Text, type SwitchProps } from "@mantine/core";
import { useState } from "react";
import classes from "./SolidSwitch.module.css";

interface SolidSwitchProps extends Omit<SwitchProps, "label" | "description"> {
  /** Label displayed above the switch (matches form field style) */
  label?: string;
  /** Helper text displayed below the switch */
  description?: string;
}

export default function SolidSwitch({
  label,
  description,
  checked: controlledChecked,
  onChange,
  classNames,
  size = "lg",
  ...rest
}: SolidSwitchProps) {
  const isControlled = controlledChecked !== undefined;
  const [internalChecked, setInternalChecked] = useState(false);
  const checked = isControlled ? controlledChecked : internalChecked;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isControlled) {
      setInternalChecked(e.currentTarget.checked);
    }
    onChange?.(e);
  }

  return (
    <div>
      {label && <Text className={classes.topLabel}>{label}</Text>}
      <Switch
        {...rest}
        checked={checked}
        onChange={handleChange}
        size={size}
        label={checked ? "Yes" : "No"}
        classNames={{ root: classes.root, thumb: classes.thumb, ...classNames }}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-lg)",
            fontWeight: 500,
            color: "var(--mantine-color-text)",
          },
        }}
      />
      {description && (
        <Text className={classes.description}>{description}</Text>
      )}
    </div>
  );
}
