/**
 * CellLines
 *
 * Several values in one table cell, one to a line: a delegate's sites.
 *
 * **Values that belong together go in one line**, such as "Northfield
 * General Hospital, clinical lead Dr Thomas Kowalski". Never split them
 * across two columns of lines and rely on the lines lining up. They only
 * do while nothing wraps: a long value in one column pushes the lines
 * below it down, and the other column's values then sit beside the wrong
 * ones. On a phone the table becomes cards, and the two columns become
 * two separate lists.
 *
 * Bare text, like `FormattedDate`, so `CellContent` gives it the body
 * text style; `cellText.ts` names it for that reason.
 *
 * ```tsx
 * { header: "Site", render: (d) => <CellLines lines={d.sites.map((s) => s.name)} /> }
 * ```
 */

import { Fragment } from "react";

export interface CellLinesProps {
  /** The values, one to a line, in the order given */
  lines: string[];
  /** Shown when there are none. Defaults to "-", as an empty cell is. */
  empty?: string;
}

export default function CellLines({ lines, empty = "-" }: CellLinesProps) {
  if (lines.length === 0) return <>{empty}</>;

  return (
    <>
      {lines.map((line, index) => (
        // Two lines may say the same, so the index is the key.
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
