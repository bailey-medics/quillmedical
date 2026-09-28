/**
 * Passport Reflection Page
 *
 * One reflection in full, reached by choosing it in the reflections
 * table, with an edit button that turns the card into the reflection
 * editor filled in from it.
 *
 * Laid out as every passport record page is: the section and the
 * record's name as the title, the edit button on the right, then the
 * record card or, while editing, the editor in its place.
 *
 * Read from the list of reflections, which only the holder may read.
 * Saving asks for the anonymisation declaration again, because it is a
 * statement about the words being saved.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import PassportRecordCard from "@/components/passport/PassportRecordCard";
import ReflectionEditor from "@/components/passport/ReflectionEditor";
import { IconFileText } from "@/components/icons/appIcons";
import {
  amendReflection,
  fetchMyPassport,
  fetchReflections,
} from "@lib/passport";
import type { Reflection, ReflectionInput } from "@lib/passport";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: string) => {
      const found = (await fetchReflections(id)).find(
        (item) => item.name === name,
      );
      if (found) setReflection(found);
      else setMissing(true);
    },
    [name],
  );

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return load(id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That reflection could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSave(data: ReflectionInput) {
    if (!passportId || !name || !reflection) return;

    setSaving(true);
    try {
      await amendReflection(passportId, name, {
        ...data,
        // Not on the editor, so sent back as they were rather than cleared.
        competencies: reflection.competencies.map((c) => c.id),
      });
      await load(passportId);
      setEditing(false);
      setError(null);
    } catch {
      setError("Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = `Reflections: ${reflection?.title ?? "reflection"}`;

  // Only a failed load replaces the page. A failed save keeps the
  // reflection on screen, with the message above it.
  if (error && !reflection) {
    return (
      <Stack gap="lg">
        <PageHeader title={title} />
        <ErrorState message={error} />
      </Stack>
    );
  }

  if (missing) {
    return (
      <Stack gap="lg">
        <PageHeader title={title} />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="That reflection is not here"
          description="It may have been removed, or the link may be wrong."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={title} />

      {error && <ErrorState message={error} />}

      {reflection && editing && (
        <ReflectionEditor
          initial={reflection}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          isSubmitting={saving}
        />
      )}

      {reflection && !editing && (
        <>
          <Group justify="flex-end">
            {/* Disabled where the server says a write would be refused,
                rather than offering a control that fails on save. */}
            <IconTextButton
              icon="pencil"
              label="Edit reflection"
              onClick={() => setEditing(true)}
              disabled={!canWrite}
            />
          </Group>

          <PassportRecordCard
            date={reflection.written_on}
            facts={[
              { label: "Reflection", value: reflection.body, prose: true },
              {
                label: "Counts towards",
                value:
                  reflection.competencies.length > 0
                    ? reflection.competencies.map((c) => c.name).join(", ")
                    : null,
              },
            ]}
          />
        </>
      )}
    </Stack>
  );
}
