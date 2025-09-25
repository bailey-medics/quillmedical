import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export default function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  useEffect(() => {
    if (state.status === "authenticated") {
      // Perform a full navigation to BASE_URL so we land on the exact
      // path including trailing slash (e.g. '/app/'). This avoids the
      // router basename producing URLs without the trailing slash.
      const rawBase = (import.meta.env.BASE_URL as string) || "/";
      const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
      window.location.assign(base);
    }
  }, [state.status]);

  if (state.status === "loading") return null;
  if (state.status === "authenticated") return null; // effect will redirect
  return children;
}
