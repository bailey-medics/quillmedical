/**
 * The specialties to offer a holder, in the order to offer them.
 *
 * The backend decides the order: the caller's organisations' lead
 * specialties first, then the rest alphabetically. This starts with the
 * alphabetical list from the generated bundle, so the question can be
 * answered at once, and switches to the backend's order when it arrives.
 * If the call fails the alphabetical list stays, so the question can
 * always be answered: the order is a convenience, never a precondition.
 */

import { useEffect, useState } from "react";
import { fetchPassportSpecialties } from "./api";
import { PASSPORT_SPECIALTIES, type SpecialtyOption } from "./specialties";

/**
 * @param enabled - Whether the page is showing the question. Nothing is
 *   fetched until it is, so a page that never asks makes no request.
 */
export function useSpecialtyChoices(enabled: boolean): SpecialtyOption[] {
  const [options, setOptions] =
    useState<SpecialtyOption[]>(PASSPORT_SPECIALTIES);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Started inside a promise so a call that throws rather than rejects
    // still lands in the catch below.
    Promise.resolve()
      .then(() => fetchPassportSpecialties())
      .then((choices) => {
        if (!cancelled && Array.isArray(choices) && choices.length > 0) {
          setOptions(choices);
        }
      })
      .catch(() => {
        /* keep the alphabetical list */
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return options;
}
