/**
 * FilterSelect Component
 *
 * A filter icon button that opens a popover with a grouped
 * multi-select dropdown. Shows a count indicator when filters
 * are active.
 */

import { Group, Popover, Stack } from "@mantine/core";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import type { ComboboxParsedItemGroup } from "@mantine/core";
import { Anchor } from "@mantine/core";
import IconButton from "@components/button/IconButton";
import { IconFilter2 } from "@components/icons/appIcons";
import { BodyText } from "@components/typography";
import MultiSelectField from "./MultiSelectField";
import classes from "./FilterSelect.module.css";

interface FilterSelectProps {
  /** Grouped or flat option data — same format as MultiSelect */
  data: (string | ComboboxParsedItemGroup)[];
  /** Currently selected filter values */
  value: string[];
  /** Called when selection changes */
  onChange: (value: string[]) => void;
  /** Label shown inside the popover dropdown */
  label?: string;
  /** Placeholder text when no search term entered */
  placeholder?: string;
  /** Accessibility label for the trigger button */
  "aria-label"?: string;
}

export default function FilterSelect({
  data,
  value,
  onChange,
  label = "Filter",
  placeholder = "Search filters\u2026",
  "aria-label": ariaLabel = "Filter",
}: FilterSelectProps) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const dropdownRef = useClickOutside<HTMLDivElement>(close, [
    "mousedown",
    "touchstart",
  ]);

  return (
    <Popover
      opened={opened}
      onClose={close}
      position="bottom-end"
      shadow="md"
      trapFocus={false}
    >
      <Popover.Target>
        <div className={classes.trigger}>
          <IconButton
            icon={<IconFilter2 />}
            variant="subtle"
            onClick={toggle}
            aria-label={ariaLabel}
          />
          {value.length > 0 && (
            <span className={classes.count}>
              <BodyText>{value.length >= 10 ? "9+" : value.length}</BodyText>
            </span>
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown} ref={dropdownRef}>
        <Stack gap="xs">
          <MultiSelectField
            data={data}
            value={value}
            onChange={onChange}
            label={label}
            placeholder={value.length === 0 ? placeholder : undefined}
            comboboxProps={{ withinPortal: false }}
          />
          {value.length > 0 && (
            <Group justify="flex-end">
              <Anchor
                component="button"
                type="button"
                size="sm"
                underline="always"
                className={classes.reset}
                onClick={() => onChange([])}
              >
                Reset
              </Anchor>
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
