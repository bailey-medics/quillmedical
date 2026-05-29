/**
 * PageMessageContext
 *
 * Centralised page-level message system. Provides a context and hook
 * for displaying status messages (success, error, partial_success)
 * above page content in MainLayout.
 *
 * Also ingests flash state from React Router navigation, making it
 * backward-compatible with pages that navigate with `state.flash`.
 *
 * Messages are never auto-dismissed (clinical safety) and are cleared
 * on navigation to a new pathname.
 *
 * @example
 * ```tsx
 * // In an action handler
 * const { showMessage } = usePageMessage();
 * showMessage({ variant: "success", title: "Organisation deleted" });
 *
 * // Flash senders continue to work unchanged
 * navigate("/admin/organisations", {
 *   state: { flash: { variant: "success", title: "Created" } },
 * });
 * ```
 */

/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PageMessageVariant = "success" | "partial_success" | "error";

export interface PageMessage {
  id: string;
  variant: PageMessageVariant;
  title: string;
  description?: ReactNode;
}

interface PageMessageContextValue {
  messages: PageMessage[];
  showMessage: (msg: Omit<PageMessage, "id">) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const PageMessageContext = createContext<PageMessageContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePageMessage(): PageMessageContextValue {
  const ctx = useContext(PageMessageContext);
  if (!ctx) {
    throw new Error("usePageMessage must be used within PageMessageProvider");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

interface PageMessageProviderProps {
  children: ReactNode;
}

export function PageMessageProvider({ children }: PageMessageProviderProps) {
  const [messages, setMessages] = useState<PageMessage[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const prevPathnameRef = useRef(location.pathname);

  // Clear all messages on pathname change
  useEffect(() => {
    if (location.pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = location.pathname;
      /* eslint-disable react-hooks/set-state-in-effect -- legitimate navigation side effect: clearing messages on route change */
      setMessages([]);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [location.pathname]);

  // Ingest flash state from React Router navigation
  useEffect(() => {
    const state = location.state as {
      flash?: {
        variant?: PageMessageVariant;
        title: string;
        description?: ReactNode;
      };
    } | null;
    const flash = state?.flash;

    if (flash) {
      const msg: PageMessage = {
        id: crypto.randomUUID(),
        variant: flash.variant ?? "success",
        title: flash.title,
        description: flash.description,
      };
      /* eslint-disable react-hooks/set-state-in-effect -- legitimate navigation side effect: ingesting flash state from router */
      setMessages((prev) => [...prev, msg]);
      /* eslint-enable react-hooks/set-state-in-effect */

      // Clear flash from history state to prevent ghost on back-nav
      navigate(location.pathname + location.search, {
        replace: true,
        state: {},
      });
    }
  }, [location.state, navigate, location.pathname, location.search]);

  const showMessage = useCallback((msg: Omit<PageMessage, "id">) => {
    const newMsg: PageMessage = { ...msg, id: crypto.randomUUID() };
    setMessages((prev) => [...prev, newMsg]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <PageMessageContext.Provider
      value={{ messages, showMessage, dismiss, clearAll }}
    >
      {children}
    </PageMessageContext.Provider>
  );
}
