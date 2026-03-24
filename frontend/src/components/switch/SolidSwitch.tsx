/**
 * Solid Switch Component
 *
 * A Mantine Switch wrapper with a solid thumb (no inner ring/hole).
 * Passes through all standard Switch props.
 */

import { Switch, type SwitchProps } from "@mantine/core";
import classes from "./SolidSwitch.module.css";

export default function SolidSwitch(props: SwitchProps) {
  return (
    <Switch
      {...props}
      classNames={{ thumb: classes.thumb, ...props.classNames }}
      styles={{
        label: {
          fontSize: "var(--mantine-font-size-lg)",
          color: "var(--mantine-color-dimmed)",
        },
      }}
    />
  );
}
