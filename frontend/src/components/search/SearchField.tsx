import { useEffect, useRef, useState } from "react";

import { ActionIcon, TextInput } from "@mantine/core";
import { IconSearch, IconX } from "@tabler/icons-react";

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
    <ActionIcon aria-label="Open search" onClick={() => setOpen(true)} variant="transparent">
      <IconSearch size={30} stroke={2.5} color="#290661" />
    </ActionIcon>
  );
}
