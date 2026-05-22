import { Box, Title, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import classes from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: string;
}

export default function PageHeader({ title }: PageHeaderProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`);

  return (
    <Box>
      <Title
        order={1}
        className={isDesktop ? classes.lgTitle : classes.smTitle}
      >
        {title}
      </Title>
    </Box>
  );
}
