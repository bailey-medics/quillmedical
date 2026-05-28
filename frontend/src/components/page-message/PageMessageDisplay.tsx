/**
 * PageMessageDisplay Component
 *
 * Renders the stack of page-level messages from PageMessageContext.
 * Placed in MainLayout above page content. Renders nothing when empty.
 *
 * Messages are displayed in FIFO order (newest at bottom).
 * Each message is individually dismissible.
 */

import { Stack } from "@mantine/core";
import { FormStatus } from "@/components/form/Form";
import { usePageMessage } from "./PageMessageContext";

export default function PageMessageDisplay() {
  const { messages, dismiss } = usePageMessage();

  if (messages.length === 0) {
    return null;
  }

  return (
    <Stack gap="sm">
      {messages.map((msg) => (
        <FormStatus
          key={msg.id}
          variant={msg.variant}
          title={msg.title}
          description={msg.description}
          onDismiss={() => dismiss(msg.id)}
        />
      ))}
    </Stack>
  );
}
