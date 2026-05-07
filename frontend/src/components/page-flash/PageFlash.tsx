/**
 * PageFlash Component
 *
 * Renders a one-shot status message passed via React Router navigation state.
 * Drop at the top of any destination page that might receive a flash message.
 *
 * - Renders nothing if no flash in location state
 * - Clears flash from history state after first render (prevents ghost on back-nav)
 * - Dismissible by user; never auto-dismissed
 *
 * @example
 * ```tsx
 * // Destination page
 * function PatientLettersPage() {
 *   return (
 *     <Container size="lg" py="xl">
 *       <PageFlash />
 *       <LetterList />
 *     </Container>
 *   );
 * }
 *
 * // Sending page navigates with flash state
 * navigate("/patients/123/letters", {
 *   state: { flash: { title: "Letter sent", description: "ID #1234" } },
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { FormStatus } from "@/components/form/Form";

export interface FlashState {
  flash?: {
    variant?: "success" | "partial_success" | "error";
    title: string;
    description?: ReactNode;
  };
}

export default function PageFlash() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as FlashState | null;
  const flash = state?.flash;
  const clearedRef = useRef(false);

  // Capture flash in local state on mount so it survives the history
  // state being cleared. Component remounts on navigation, so no sync needed.
  const [localFlash, setLocalFlash] = useState(flash ?? null);

  // Clear flash from history state after first render to prevent
  // ghost messages on back-navigation
  useEffect(() => {
    if (flash && !clearedRef.current) {
      clearedRef.current = true;
      navigate(location.pathname + location.search, {
        replace: true,
        state: {},
      });
    }
  }, [flash, navigate, location.pathname, location.search]);

  const handleDismiss = useCallback(() => {
    setLocalFlash(null);
  }, []);

  if (!localFlash) {
    return null;
  }

  return (
    <FormStatus
      variant={localFlash.variant ?? "success"}
      title={localFlash.title}
      description={localFlash.description}
      onDismiss={handleDismiss}
    />
  );
}
