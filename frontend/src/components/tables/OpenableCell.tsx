/**
 * OpenableCell
 *
 * A cell's content, drawn as the keyboard way into its row when given
 * `onOpen`. Only text is wrapped: a control in the first cell, such as
 * a badge with a menu, is left as it is, because a button cannot hold
 * another control.
 */

import type { ReactNode } from "react";
import CellContent from "./CellContent";
import RowOpenButton from "./RowOpenButton";
import { isTextContent } from "./cellText";

export interface OpenableCellProps {
  /** What the column's render function returned */
  content: ReactNode;
  /** Opens the row; when given, text content becomes a button */
  onOpen?: () => void;
}

export default function OpenableCell({ content, onOpen }: OpenableCellProps) {
  if (!onOpen || !isTextContent(content)) {
    return <CellContent>{content}</CellContent>;
  }

  return (
    <RowOpenButton onOpen={onOpen}>
      <CellContent>{content}</CellContent>
    </RowOpenButton>
  );
}
