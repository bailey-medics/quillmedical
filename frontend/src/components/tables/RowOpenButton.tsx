/**
 * RowOpenButton Component
 *
 * The keyboard way into a clickable table row or data card. A row opens
 * on a mouse click anywhere along it, but a row is not something a
 * keyboard can reach, so the first cell's content is drawn as a button
 * that opens the same row. It looks like the text it wraps, so no table
 * changes layout, and shows a focus ring when it is reached with Tab.
 *
 * Its name is the cell's own text, such as a patient's name, which is
 * what a screen reader user listens for in a list of rows.
 *
 * @example
 * ```tsx
 * <RowOpenButton onOpen={() => navigate(`/users/${user.id}`)}>
 *   {user.name}
 * </RowOpenButton>
 * ```
 */

import type { ReactNode } from "react";
import { UnstyledButton } from "@mantine/core";
import classes from "./RowOpenButton.module.css";

export interface RowOpenButtonProps {
  /** The first cell's content, which also names the button */
  children: ReactNode;
  /** Opens the row, as a click on the row would */
  onOpen: () => void;
}

export default function RowOpenButton({
  children,
  onOpen,
}: RowOpenButtonProps) {
  return (
    <UnstyledButton className={classes.open} onClick={onOpen}>
      {children}
    </UnstyledButton>
  );
}
