/**
 * FilterSelect Component
 *
 * A filter icon button that opens a popover with a grouped
 * multi-select dropdown. Shows a count indicator when filters
 * are active.
 */

import { ActionIcon, Popover } from "@mantine/core";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import type { ComboboxParsedItemGroup } from "@mantine/core";
import { IconFilter2 } from "@components/icons/appIcons";
import { BodyText } from "@components/typography";
import FilterModal from "./filter/FilterModal";
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
  placeholder = "Select items\u2026",
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
      shadow="none"
      trapFocus={false}
    >
      <Popover.Target>
        <div className={classes.trigger}>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={toggle}
            aria-label={ariaLabel}
          >
            <IconFilter2 size={32} stroke={2.5} />
          </ActionIcon>
          {value.length > 0 && (
            <span className={classes.count}>
              <BodyText>{value.length >= 10 ? "9+" : value.length}</BodyText>
            </span>
          )}
        </div>
      </Popover.Target>
      <Popover.Dropdown ref={dropdownRef} className={classes.dropdown}>
        <FilterModal
          data={data}
          value={value}
          onChange={onChange}
          label={label}
          placeholder={placeholder}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
