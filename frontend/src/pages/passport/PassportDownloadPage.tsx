/**
 * Passport Download Page
 *
 * The holder taking their record away.
 *
 * A page of its own rather than a card at the foot of the passport, so
 * that leaving with the record is something a holder goes to do rather
 * than something they scroll past. It matters most at the moment
 * somebody changes employer or falls out with the organisation holding
 * their evidence, and at that moment it should be easy to find.
 *
 * The choices themselves live in `PassportExportButtons`, which carries
 * the reasoning about what each download is for and why reflections
 * leave only when asked for.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import PassportExportButtons from "@/components/passport/PassportExportButtons";
import ErrorState from "@/components/error-state/ErrorState";
import { fetchMyPassport } from "@lib/passport";

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassportId(detail.passport.passport_id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your passport could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack gap="lg">
      <PageHeader title="Download" />

      {error && <ErrorState message={error} />}

      {/* Only once there is a passport to export. Offering a download
          before one exists would hand somebody an empty file and call
          it their record. */}
      {passportId && <PassportExportButtons passportId={passportId} />}
    </Stack>
  );
}
