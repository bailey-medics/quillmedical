/**
 * TextLink Component
 *
 * Internal navigation link styled with the primary colour and permanent
 * underline. Wraps React Router's `Link` in a Mantine `Anchor` for
 * consistent typography sizing.
 */

import { Anchor } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import classes from "./TextLink.module.css";

interface TextLinkProps {
  /** Internal route path to navigate to */
  to: string;
  /** Link content */
  children: ReactNode;
}

/**
 * Renders an internal link with `primary-4` colour and hover darkening.
 *
 * @param props - Component props
 * @returns Styled anchor element wrapping a React Router Link
 */
export default function TextLink({ to, children }: TextLinkProps) {
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
