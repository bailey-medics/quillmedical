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
  /** Called when the link is followed, e.g. to close the modal it sits in */
  onClick?: () => void;
}

/**
 * Renders an internal link in the `--link-color` token, which is
 * `primary-4` in light mode and `primary-1` in dark.
 *
 * @param props - Component props
 * @returns Styled anchor element wrapping a React Router Link
 */
export default function TextLink({ to, children, onClick }: TextLinkProps) {
  return (
    <Anchor
      component={Link}
      to={to}
      size="md"
      underline="always"
      className={classes.link}
      onClick={onClick}
    >
      {children}
    </Anchor>
  );
}
