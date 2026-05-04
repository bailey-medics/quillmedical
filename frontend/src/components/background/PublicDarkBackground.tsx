import { Box } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PublicDarkBackground.module.css";

interface PublicDarkBackgroundProps {
  children?: ReactNode;
}

export default function PublicDarkBackground({
  children,
}: PublicDarkBackgroundProps) {
  return (
    <Box data-testid="dark-background" pb="3rem" className={classes.root}>
      <Box className={classes.content}>{children}</Box>
    </Box>
  );
}
