/**
 * Solid Switch Component
 *
 * A Mantine Switch wrapper with a solid thumb (no inner ring/hole).
 * Renders an optional top label, a switch with automatic "No"/"Yes"
 * inline text, and an optional description below.
 */

import {
  Switch,
  Text,
  useComputedColorScheme,
  type SwitchProps,
} from "@mantine/core";
import { useState } from "react";
import type { ReactNode } from "react";
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
  const isDark = useComputedColorScheme("light") === "dark";

  const stableLabel: ReactNode = (
    <span style={{ display: "inline-grid" }}>
      <span
        style={{ gridArea: "1/1", visibility: checked ? "visible" : "hidden" }}
      >
        Yes
      </span>
      <span
        style={{ gridArea: "1/1", visibility: checked ? "hidden" : "visible" }}
      >
        No
      </span>
    </span>
  );

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
        label={stableLabel}
        classNames={{
          root: classes.root,
          thumb: classes.thumb,
          track: classes.track,
          ...classNames,
        }}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-lg)",
            fontWeight: 500,
            color: "var(--mantine-color-text)",
          },
          track: isDark
            ? {
                backgroundColor: checked ? "#000d1f" : "#143f6b",
                borderColor: checked ? "#000d1f" : "#143f6b",
              }
            : undefined,
        }}
      />
      {description && (
        <Text className={classes.description}>{description}</Text>
      )}
    </div>
  );
}
