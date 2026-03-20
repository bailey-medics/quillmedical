import { Box, Text, Title } from "@mantine/core";
import classes from "./PageHeader.module.css";

export interface PublicTitleProps {
  /** Page title text */
  title: string;
  /** Optional description/subtitle text */
  description?: string;
  /** Size variant — defaults to lg */
  size?: "sm" | "md" | "lg";
  /** Text alignment — defaults to center */
  ta?: "left" | "center" | "right";
}

export default function PublicTitle({
  title,
  description,
  size = "lg",
  ta = "center",
}: PublicTitleProps) {
  const orderMap = {
    sm: 3,
    md: 2,
    lg: 1,
  } as const;

  const order = orderMap[size];

  return (
    <Box>
      <Title
        order={order}
        c="#C8963E"
        ta={ta}
        mb={description ? "xs" : undefined}
        ff="'Cormorant Garamond', serif"
        className={
          size === "lg"
            ? classes.lgTitle
            : size === "md"
              ? classes.mdTitle
              : undefined
        }
      >
        {title}
      </Title>
      {description && (
        <Text c="dimmed" size="lg" ta={ta}>
          {description}
        </Text>
      )}
    </Box>
  );
}
