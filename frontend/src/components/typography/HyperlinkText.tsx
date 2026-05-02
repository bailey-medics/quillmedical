import { Anchor } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import classes from "./HyperlinkText.module.css";

interface HyperlinkTextProps {
  /** The link destination (internal path) */
  to: string;
  /** Link content */
  children: ReactNode;
}

export default function HyperlinkText({ to, children }: HyperlinkTextProps) {
  return (
    <Anchor
      component={Link}
      to={to}
      size="lg"
      underline="always"
      className={classes.link}
    >
      {children}
    </Anchor>
  );
}
