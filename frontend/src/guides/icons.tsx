/**
 * The icons a guide may show in its text, by the name it writes them.
 *
 * A guide writes `:icon-user-plus:` where a step means the button with
 * that icon on it, and the guide page shows the icon there.
 * `:button-user-plus:` shows it inside the filled square an icon-only
 * button is drawn as. Every icon registered in `appIcons` may be named,
 * as its catalogue name in kebab case: `UserPlus` is `user-plus`,
 * `EPassport` is `e-passport`.
 *
 * Imported only by the guide page, so the icons travel in the guides'
 * lazy chunk, as the guides' words do.
 */

import type { ReactElement } from "react";
import { iconCatalogue } from "@/components/icons/appIcons";

/** A catalogue name in kebab case: `AlertCircleFilled` to `alert-circle-filled`. */
export function guideIconName(catalogueName: string): string {
  return catalogueName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** Every registered icon, by the name a guide writes it. */
export const GUIDE_ICONS: Readonly<Record<string, ReactElement>> =
  Object.fromEntries(
    Object.entries(iconCatalogue).map(([name, TablerIcon]) => [
      guideIconName(name),
      <TablerIcon key={name} />,
    ]),
  );

/** The icon names a guide's markdown uses, in the order it uses them. */
export function iconNamesIn(source: string): string[] {
  return [...source.matchAll(/:(?:icon|button)-([a-z0-9-]+):/g)].map(
    (match) => match[1] ?? "",
  );
}
