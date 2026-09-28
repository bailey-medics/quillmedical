/**
 * Passport Reflections Page
 *
 * The holder's own reflections, and the editor for writing a new one.
 *
 * **Holder-only.** Nobody else may read these — not an assessor, not an
 * organisation admin. The API enforces it; this page states it, because
 * somebody deciding how frankly to write deserves to be told rather than
 * left to infer it.
 */

import { useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import ReflectionEditor from "@/components/passport/ReflectionEditor";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import { IconFileText } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import AddButton from "@/components/button/AddButton";
import {
  addReflection,
  fetchMyPassport,
  fetchReflections,
} from "@lib/passport";
import type { Reflection, ReflectionInput } from "@lib/passport";

export function Component() {
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
          description="Reflections are yours alone — no assessor or administrator can read them."
        />
      )}

      {reflections.length > 0 &&
        reflections.map((reflection) => (
          <BaseCard key={reflection.name}>
            <Stack gap="xs">
              <Heading>{reflection.title}</Heading>
              <BodyTextBold>
                <FormattedDate date={reflection.written_on} format="medium" />
              </BodyTextBold>
              <BodyText>{reflection.body}</BodyText>
            </Stack>
          </BaseCard>
        ))}
    </Stack>
  );
}
