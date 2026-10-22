/**
 * CellLines
 *
 * Several values in one table cell, one to a line. Two columns given
 * lists of the same length line up, so a value and the one beside it in
 * the next column read across: a delegate's sites, and each site's
 * clinical lead.
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
        // Two lines may say the same, two sites with no clinical lead.
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
