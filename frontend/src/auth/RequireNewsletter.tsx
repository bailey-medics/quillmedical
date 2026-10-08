/**
 * RequireNewsletter
 *
 * The guard on the Newsletter section of the admin area. It shows a 404
 * to anybody who may not use the section, hiding that it is there.
 *
 * Who may is decided in one place, `mayUseNewsletter`, which the menu
 * reads too. Today that is an operator, so this is `RequireOperator`
 * under another name; it has its own so that giving newsletters an admin
 * role of their own changes that one function and no route.
 */

import { Center } from "@mantine/core";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { NotFoundLayout } from "@/components/layouts";
import LoadingSpinner from "@/components/loading-spinner";
import { mayUseNewsletter } from "@/lib/newsletter/access";
import { useAuth } from "./AuthContext";

interface RequireNewsletterProps {
  /** What to show somebody who may use the Newsletter section */
  children: ReactNode;
}

export default function RequireNewsletter({
  children,
}: RequireNewsletterProps) {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <Center mih="60dvh">
        <LoadingSpinner />
      </Center>
    );
  }

  // Defensive: RequireAuth should have caught this already.
  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (mayUseNewsletter(state.user)) {
    return children;
  }

  return <NotFoundLayout />;
}
