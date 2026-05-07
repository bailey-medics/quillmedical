/**
 * Require Feature Route Guard
 *
 * Higher-order component that protects routes requiring a specific
 * organisation feature. Returns 404 when the feature is not enabled
 * (hides existence from unauthorised users).
 *
 * Works in conjunction with RequireAuth — assumes user is already authenticated.
 */

import { Center, Loader } from "@mantine/core";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useHasFeature } from "@lib/features";
import { NotFoundLayout } from "@/components/layouts";

interface RequireFeatureProps {
  /** Feature key to check (e.g. "teaching") */
  feature: string;
  /** Child components to render if feature is enabled */
  children: ReactNode;
  /** Optional fallback to render when feature is denied (defaults to 404) */
  fallback?: ReactNode;
}

/**
 * Gate content behind an organisation feature flag.
 *
 * If the user's organisation does not have the feature enabled,
 * a 404 page is shown (same as if the route didn't exist) unless
 * a custom fallback is provided.
 */
export function RequireFeature({
  feature,
  children,
  fallback,
}: RequireFeatureProps) {
  const { state } = useAuth();
  const hasFeature = useHasFeature(feature);

  if (state.status === "loading") {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (state.status === "unauthenticated" || !hasFeature) {
    return <>{fallback ?? <NotFoundLayout />}</>;
  }

  return <>{children}</>;
}
