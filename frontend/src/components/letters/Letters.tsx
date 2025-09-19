import { Avatar, Skeleton, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export type Letter = {
  id: string;
  subject: string;
  date?: string; // ISO or display
  from?: string;
  snippet?: string;
};

type Props = {
  letters?: Letter[];
  isLoading?: boolean;
  onOpen?: (id: string) => void;
  children?: ReactNode;
};

export default function Letters({
  letters = [],
  isLoading = false,
  onOpen,
  children,
}: Props) {
  if (isLoading) {
    return (
      <div>
        <Title order={4}>Letters</Title>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              <Skeleton circle width={40} height={40} />
              <div style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton height={14} width="60%" />
                <Skeleton height={12} width="40%" style={{ marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Title order={4}>Letters</Title>
        {children}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {letters.length === 0 && (
          <Text color="dimmed">No letters available</Text>
        )}

        {letters.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              cursor: onOpen ? "pointer" : "default",
            }}
            onClick={() => onOpen?.(l.id)}
          >
            <Avatar radius="xl" size={40}>
              {l.from ? l.from.charAt(0) : "L"}
            </Avatar>
            <div style={{ flex: 1, marginLeft: 12 }}>
              <Text fw={600}>{l.subject}</Text>
              {l.snippet && (
                <Text size="sm" color="dimmed">
                  {l.snippet}
                </Text>
              )}
            </div>
            {l.date && (
              <Text size="xs" color="dimmed">
                {new Date(l.date).toLocaleDateString()}
              </Text>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
