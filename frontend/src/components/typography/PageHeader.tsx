import { Box, Title } from "@mantine/core";
import classes from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: string;
}

export default function PageHeader({ title }: PageHeaderProps) {
  return (
    <Box>
      <Title order={1} className={classes.lgTitle}>
        {title}
      </Title>
    </Box>
  );
}
