/**
 * Passport Page
 *
 * The holder's own passport: every competency they hold evidence for.
 *
 * Thin composition, as the plan asks — the components carry the
 * judgements about what may and may not be shown, and this page fetches
 * and arranges them.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import CompetencySummary from "@/components/passport/CompetencySummary";
import ErrorState from "@/components/error-state/ErrorState";
import { fetchMyPassport } from "@lib/passport";
import type { PassportDetail } from "@lib/passport";

export function Component() {
  const navigate = useNavigate();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassport(detail);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your passport could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Stack gap="lg">
        <PageHeader title="My passport" />
        <ErrorState message={error} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="My passport" />
      <CompetencySummary
        competencies={passport?.competencies ?? []}
        isLoading={loading}
        onSelect={(competencyId) =>
          navigate(`/passport/competency/${competencyId}`)
        }
      />
    </Stack>
  );
}
