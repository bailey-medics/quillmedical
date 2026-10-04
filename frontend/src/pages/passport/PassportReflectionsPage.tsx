/**
 * Passport Reflections Page
 *
 * The holder's own reflections, and the editor for writing a new one.
 */

import { useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import ReflectionTable from "@/components/passport/ReflectionTable";
import ReflectionEditor from "@/components/passport/ReflectionEditor";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import AddButton from "@/components/button/AddButton";
import {
  addReflection,
  fetchMyPassport,
  fetchReflections,
} from "@lib/passport";
import type { Reflection, ReflectionInput } from "@lib/passport";

export function Component() {
  const navigate = useNavigate();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [writing, setWriting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the list has arrived. Until then the page cannot tell an
  // empty record from one still loading, and saying "nothing yet"
  // before the answer flashed the empty message over a full record.
  const [loaded, setLoaded] = useState(false);
  // Read from the passport this page already fetches. False only where
  // the server said so, so a response built before the field existed
  // still offers the button.
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        const id = detail.passport.passport_id;
        if (cancelled) return;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return fetchReflections(id);
      })
      .then((result) => {
        if (!cancelled && result) {
          setReflections(result);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your reflections could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(data: ReflectionInput) {
    if (passportId === null) return;

    setSubmitting(true);
    try {
      await addReflection(passportId, data);
      setReflections(await fetchReflections(passportId));
      setWriting(false);
      setError(null);
    } catch {
      setError("Your reflection could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Reflections" />

      {error && <ErrorState message={error} />}

      {writing ? (
        <ReflectionEditor
          onSubmit={handleSubmit}
          onCancel={() => setWriting(false)}
          isSubmitting={submitting}
        />
      ) : (
        <Group justify="flex-end">
          <AddButton
            label="Write a reflection"
            onClick={() => setWriting(true)}
            disabled={!canWrite}
          />
        </Group>
      )}

      {/* Below the add button, as on every passport page, and above
          the list: on an empty page this says what reflections are for. */}
      {loaded && reflections.length === 0 && (
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="Nothing written yet"
          description="What you took from a case, a complaint or a significant event appears here."
        />
      )}

      {/* Each reflection opens on a page of its own, to read in full
          and rewrite. The table shows titles and dates only. */}
      {reflections.length > 0 && (
        <ReflectionTable
          reflections={reflections}
          onSelect={(reflection) =>
            navigate(
              `/passport/reflections/${encodeURIComponent(reflection.name)}`,
            )
          }
        />
      )}
    </Stack>
  );
}
