/**
 * Whether a click on a table row or data card should open that row.
 *
 * A click on a control inside the row, such as a button, a link, a
 * checkbox or its label, belongs to that control, and opening the row as
 * well would do two things at once. A click from a portal, such as an
 * open menu drawn elsewhere in the page, still bubbles through React to
 * the row, but it did not happen inside the row at all.
 */

import type { MouseEvent } from "react";

const INTERACTIVE = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[role='switch']",
  "[role='tab']",
  "[contenteditable='true']",
].join(",");

export function shouldOpenRow(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target;

  if (!(target instanceof Element) || !row.contains(target)) return false;

  const control = target.closest(INTERACTIVE);

  return control === null || control === row || !row.contains(control);
}
