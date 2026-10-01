/**
 * RequirePassport
 *
 * Gates the passport pages. Like `<RequireFeature feature="passport">`,
 * with one difference: somebody who holds a passport of their own gets
 * in even where the feature does not reach them. A holder removed from
 * the one org_unit that had the passport must still be able to read and
 * export their own record, which the API allows and nothing else.
 *
 * 404s for anybody else, hiding the pages from somebody who may not use
 * them, as every guard here does.
 */

import { Center } from "@mantine/core";
import type { ReactNode } from "react";
import LoadingSpinner from "@/components/loading-spinner";
import { NotFoundLayout } from "@/components/layouts";
import { useCanReachPassport } from "@lib/features";
import { useAuth } from "./AuthContext";

interface RequirePassportProps {
  /** The passport pages to show when they are within reach */
  children: ReactNode;
  /** Shown in place of the 404 when they are not */
  fallback?: ReactNode;
}

export function RequirePassport({ children, fallback }: RequirePassportProps) {
  const { state } = useAuth();
  const canReach = useCanReachPassport();

  if (state.status === "loading") {
    return (
      <Center h="100vh">
        <LoadingSpinner />
      </Center>
    );
  }

  if (state.status === "unauthenticated" || !canReach) {
    return <>{fallback ?? <NotFoundLayout />}</>;
  }

  return <>{children}</>;
}
