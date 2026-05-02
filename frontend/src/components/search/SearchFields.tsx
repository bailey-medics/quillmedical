/**
 * Search Field Component
 *
 * Collapsible search input that toggles between icon button and full
 * text input. Provides animated expand/collapse with auto-focus.
 */

import { useEffect, useRef, useState } from "react";

import { ActionIcon, TextInput } from "@mantine/core";
import { IconX } from "@/components/icons/appIcons";
import SearchButton from "@/components/button/SearchButton";

/**
 * Search Field
 *
 * Collapsible search input component:
 * - Collapsed: Shows magnifying glass icon button
 * - Expanded: Shows full text input with close button
 * - Auto-focuses input when expanded
 * - Closes on blur (can be disabled if needed)
 *
 * @returns Collapsible search field component
 */
export default function SearchField() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return open ? (
    <TextInput
      ref={inputRef}
      aria-label="Search"
      placeholder="Search…"
      rightSection={
        <ActionIcon aria-label="Close search" onClick={() => setOpen(false)}>
          <IconX size={16} />
        </ActionIcon>
      }
      styles={{
        input: { transition: "width 0.2s ease", width: 220 },
      }}
      // collapse on blur (optional). Remove if you prefer manual close only.
      onBlur={() => setOpen(false)}
    />
  ) : (
    <SearchButton onClick={() => setOpen(true)} />
  );
}
