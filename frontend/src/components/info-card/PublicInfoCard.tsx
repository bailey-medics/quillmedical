import PublicText from "@/components/typography/PublicText";
import { Box, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PublicInfoCard.module.css";

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
    <Box data-testid="public-info-card" p="xl" className={classes.card}>
      <Text fz="1.4rem" className={classes.label} mb="xs" tt="uppercase">
        {label}
      </Text>
      <Title
        order={2}
        c="white"
        className={classes.heading}
        fw={700}
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
