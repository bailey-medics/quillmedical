import { ActionIcon, Avatar, Box, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";

export type Letter = {
  id: string;
  subject: string;
  date?: string;
  from?: string;
  body?: string;
};

type Props = {
  letter?: Letter | null;
  isLoading?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
};

export default function LetterView({
  letter,
  isLoading = false,
  onBack,
  actions,
}: Props) {
  if (isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Skeleton circle width={40} height={40} />
          <div style={{ flex: 1 }}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={12} width="30%" style={{ marginTop: 6 }} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  if (!letter) return null;

  return (
    <div
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ActionIcon variant="light" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={16} />
          </ActionIcon>
          <Avatar radius="xl">
            {letter.from ? letter.from.charAt(0) : "L"}
          </Avatar>
          <div>
            <Title order={4} style={{ margin: 0 }}>
              {letter.subject}
            </Title>
            <Text size="xs" color="dimmed">
              {letter.from}{" "}
              {letter.date ? `• ${new Date(letter.date).toLocaleString()}` : ""}
            </Text>
          </div>
        </div>
        <div>{actions}</div>
      </div>

      <Box style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {letter.body ?? "(No content)"}
        </div>
      </Box>
    </div>
  );
}
