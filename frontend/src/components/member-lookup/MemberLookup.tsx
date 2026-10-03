/**
 * Find somebody by their username or email address, to add them to an
 * org_unit.
 *
 * An admin sees only the people at the org_units they reach. Somebody
 * with an account elsewhere could therefore not be picked from a list,
 * and could not be created either, their address being taken. This asks
 * about one whole username or address and says what it found: somebody who can be
 * added, somebody already here, an account that may not be added, or
 * nobody, in which case it offers to create them.
 *
 * It asks only when told to, never as it is typed, and matches the whole
 * username or address and never part of one or a name, so it finds
 * one named person and cannot be used to browse.
 */

import { useState, type KeyboardEvent } from "react";
import { Group, Stack } from "@mantine/core";
import IconTextButton from "@/components/button/IconTextButton";
import { EMAIL_PATTERN, TextField } from "@/components/form";
import { BodyText, ErrorMessage } from "@/components/typography";
import type { MemberLookup as Result } from "@/domains/orgUnit";

/** Props for {@link MemberLookup}. */
export interface MemberLookupProps {
  /** The org_unit somebody is being added to, to name it in the answers */
  placeName: string;
  /**
   * Ask about one username or address. Rejects when the question could
   * not be asked.
   */
  onLookUp: (term: string) => Promise<Result>;
  /** Somebody who may be added was found */
  onFound: (user: NonNullable<Result["user"]>) => void;
  /**
   * Nobody has that username or address: create them. Given what was
   * typed; `newUserSearch` turns it into the new user form's address.
   * Omit to leave the offer out.
   */
  onCreate?: (term: string) => void;
}

/**
 * One field, a "Find" button and what the lookup said.
 *
 * @param props - Component props
 * @returns The lookup
 */
export default function MemberLookup({
  placeName,
  onLookUp,
  onFound,
  onCreate,
}: MemberLookupProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // What was found, and what it was asked about: the answer is about
  // that username or address, whatever has been typed since.
  const [answer, setAnswer] = useState<
    { result: Result; term: string } | undefined
  >();

  async function lookUp() {
    const asked = typed.trim();
    if (busy) return;
    // Anything with an @ is an address and must be a whole one. Anything
    // else is a username, which holds no spaces: a name is not looked up.
    const problem = asked.includes("@")
      ? EMAIL_PATTERN.value.test(asked)
        ? undefined
        : "Enter a whole email address"
      : asked.length < 3 || /\s/.test(asked)
        ? "Enter a username or an email address"
        : undefined;
    if (problem) {
      setAnswer(undefined);
      setError(problem);
      return;
    }

    setBusy(true);
    setError(undefined);
    setAnswer(undefined);
    try {
      const result = await onLookUp(asked);
      setAnswer({ result, term: asked });
      if (result.status === "found" && result.user) onFound(result.user);
    } catch {
      setError("Could not look that up. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Inside a form, Enter would submit the form around this one.
  function findOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void lookUp();
  }

  const status = answer?.result.status;
  const found = answer?.result.user;

  return (
    <Stack gap="md">
      <TextField
        label="Username or email address"
        description="Their whole username or address. Somebody who already has a Quill account is found; anybody else can be created."
        placeholder="a.patel or name@example.org"
        // Somebody else's, not the admin's own
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        onKeyDown={findOnEnter}
        error={error}
      />

      <Group justify="flex-end">
        <IconTextButton
          icon="search"
          label="Find"
          onClick={() => void lookUp()}
          loading={busy}
        />
      </Group>

      <Stack gap="md" aria-live="polite">
        {status === "found" && found && (
          <BodyText>
            <strong>{found.username}</strong>
            {found.full_name ? ` (${found.full_name})` : ""} already has a Quill
            account. They are chosen below, ready to add to {placeName}.
          </BodyText>
        )}

        {status === "already_member" && found && (
          <BodyText>
            <strong>{found.username}</strong> is already at {placeName}.
          </BodyText>
        )}

        {status === "not_addable" && (
          <ErrorMessage>
            {answer?.term} has a Quill account that you may not add here. Ask
            somebody who manages users to add them.
          </ErrorMessage>
        )}

        {status === "not_found" && (
          <>
            <BodyText>
              Nobody on Quill uses <strong>{answer?.term}</strong>.
              {onCreate ? " You can create them an account." : ""}
            </BodyText>
            {onCreate && (
              <Group justify="flex-end">
                <IconTextButton
                  icon="userPlus"
                  label="Create new user"
                  onClick={() => onCreate(answer?.term ?? "")}
                />
              </Group>
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
}
