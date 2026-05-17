/**
 * FilterSelect Component
 *
 * A filter icon button that opens a popover with a grouped
 * multi-select dropdown. Shows a count indicator when filters
 * are active.
 */

import { Indicator, Popover } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ComboboxParsedItemGroup } from "@mantine/core";
import IconButton from "@components/button/IconButton";
import { IconFilter2 } from "@components/icons/appIcons";
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

  return (
    <Popover
      opened={opened}
      onClose={close}
      position="bottom-end"
      width={320}
      shadow="md"
      closeOnClickOutside
      trapFocus={false}
    >
      <Popover.Target>
        <Indicator
          label={value.length}
          disabled={value.length === 0}
          size={18}
          color="primary"
        >
          <IconButton
            icon={<IconFilter2 />}
            variant="subtle"
            onClick={toggle}
            aria-label={ariaLabel}
          />
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <MultiSelectField
          data={data}
          value={value}
          onChange={onChange}
          label={label}
          placeholder={placeholder}
          searchable
          clearable
        />
      </Popover.Dropdown>
    </Popover>
  );
}
