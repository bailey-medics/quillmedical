/**
 * The frameworks to offer a holder, in the order to offer them.
 *
 * The backend decides the order: the caller's organisations' lead
 * frameworks first, then the rest alphabetically. This starts with the
 * catalogue's alphabetical list, so the question can be answered as soon
 * as the frameworks have loaded, and switches to the backend's order when
 * it arrives. If that call fails the alphabetical list stays: the order
 * is a convenience, never a precondition.
 */

import { useEffect, useState } from "react";
import { fetchPassportFrameworks } from "./api";
import { useFrameworkCatalogue } from "./catalogue";
import type { FrameworkOption } from "./frameworks";

/**
 * @param enabled - Whether the page is showing the question. Nothing is
 *   fetched until it is, so a page that never asks makes no request.
 */
export function useFrameworkChoices(enabled: boolean): FrameworkOption[] {
  const { catalogue } = useFrameworkCatalogue();
  const [ordered, setOrdered] = useState<FrameworkOption[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Started inside a promise so a call that throws rather than rejects
    // still lands in the catch below.
    Promise.resolve()
      .then(() => fetchPassportFrameworks())
      .then((choices) => {
        if (!cancelled && Array.isArray(choices) && choices.length > 0) {
          setOrdered(choices);
        }
      })
      .catch(() => {
        /* keep the alphabetical list */
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return ordered ?? catalogue?.frameworks ?? [];
}
