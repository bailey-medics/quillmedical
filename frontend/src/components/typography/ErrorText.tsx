import { Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { IconAlertCircle } from "@/components/icons/appIcons";

export interface ErrorTextProps {
  children: ReactNode;
}

export default function ErrorText({ children }: ErrorTextProps) {
  return (
    <Group gap={6} align="center" wrap="nowrap">
      <IconAlertCircle size={20} color="var(--mantine-color-orange-8)" />
      <Text size="lg" c="orange.8" fw={700}>
        {children}
      </Text>
    </Group>
  );
}
