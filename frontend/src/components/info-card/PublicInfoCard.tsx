import { Box, Text, Title } from "@mantine/core";
import PublicText from "@/components/typography/PublicText";
import type { ReactNode } from "react";

export interface PublicInfoCardProps {
  /** Top label text (amber, medium) */
  label: string;
  /** Large heading text (white, Cormorant Garamond) */
  heading: string;
  /** Description content (PublicText) */
  description: ReactNode;
}

export default function PublicInfoCard({
  label,
  heading,
  description,
}: PublicInfoCardProps) {
  return (
    <Box
      data-testid="public-info-card"
      p="xl"
      style={{
        background: "#112240",
        border: "0.0625rem solid rgba(200,150,62,0.2)",
        borderRadius: "0.5rem",
      }}
    >
      <Text fz="1.4rem" c="#C8963E" mb="xs" tt="uppercase">
        {label}
      </Text>
      <Title
        order={2}
        c="white"
        ff="'Cormorant Garamond', serif"
        fw={400}
        fz="4rem"
        lh={1.1}
        mb="xs"
      >
        {heading}
      </Title>
      <PublicText ta="left" size="lg">
        {description}
      </PublicText>
    </Box>
  );
}
