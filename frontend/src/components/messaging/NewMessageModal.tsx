/**
 * New Conversation Modal
 *
 * Modal dialog for creating a new messaging conversation.
 * Allows selecting a patient, adding participants, setting a subject,
 * and writing the initial message.
 */

import { api } from "@lib/api";
import { useAuth } from "@/auth/AuthContext";
import ButtonPair from "@/components/button/ButtonPair";
import MultiSelectField from "@/components/form/MultiSelectField";
import SelectField from "@/components/form/SelectField";
import TextAreaField from "@/components/form/TextAreaField";
import TextField from "@/components/form/TextField";
import SolidSwitch from "@/components/form/SolidSwitch";
import BodyTextBold from "@/components/typography/BodyTextBold";
import ErrorMessage from "@/components/typography/ErrorMessage";
import Heading from "@/components/typography/Heading";
import { Modal, ScrollArea, Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";

interface PatientOption {
  value: string;
  label: string;
}

interface UserOption {
  value: string;
  label: string;
}

interface ApiPatient {
  id: string;
  name?: Array<{ given?: string[]; family?: string }>;
}

interface ApiUser {
  id: number;
  username: string;
}

export interface NewConversationData {
  patient_id: string;
  subject: string;
  participant_ids: number[];
  initial_message: string;
  include_patient_as_participant: boolean;
}

interface NewMessageModalProps {
  /** Whether the modal is open */
  opened: boolean;
  /** Called when the modal is closed */
  onClose: () => void;
  /** Called when the user submits the form */
  onSubmit: (data: NewConversationData) => void;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
  /** Pre-selected patient ID (locks the patient selector) */
  patientId?: string;
  /** Patient name to display when patientId is locked */
  patientName?: string;
  /** Override patient-view mode (hides patient field and toggle). Defaults to auth context. */
  isPatientView?: boolean;
}

export default function NewMessageModal({
  opened,
  onClose,
  onSubmit,
  isSubmitting = false,
  patientId: lockedPatientId,
  patientName: lockedPatientName,
  isPatientView,
}: NewMessageModalProps) {
  const { state } = useAuth();
  const isPatientUser =
    isPatientView ??
    (state.status === "authenticated" &&
      state.user.system_permissions === "patient");

  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [includePatient, setIncludePatient] = useState(false);

  // Fetch patients and users when modal opens
  useEffect(() => {
    if (!opened) return;

    if (!lockedPatientId) {
      /* eslint-disable react-hooks/set-state-in-effect -- data fetching loading states */
      setLoadingPatients(true);
      api
        .get<{ patients: ApiPatient[] }>("/patients")
        .then((res) => {
          setPatients(
            res.patients.map((p) => {
              const primary = p.name?.[0];
              const given = primary?.given?.[0] ?? "";
              const family = primary?.family ?? "";
              return {
                value: p.id,
                label: `${given} ${family}`.trim() || p.id,
              };
            }),
          );
        })
        .catch(() => {
          // silently handle
        })
        .finally(() => setLoadingPatients(false));
    }

    setLoadingUsers(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    api
      .get<{ users: ApiUser[] }>("/users")
      .then((res) => {
        setUsers(
          res.users.map((u) => ({
            value: String(u.id),
            label: u.username,
          })),
        );
      })
      .catch(() => {
        // silently handle
      })
      .finally(() => setLoadingUsers(false));
  }, [opened, lockedPatientId]);

  // Set locked patient ID when provided
  useEffect(() => {
    if (opened && lockedPatientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop to local state
      setPatientId(lockedPatientId);
    }
  }, [opened, lockedPatientId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!opened) {
      /* eslint-disable react-hooks/set-state-in-effect -- resetting form state on modal close */
      setPatientId(null);
      setParticipantIds([]);
      setSubject("");
      setInitialMessage("");
      setIncludePatient(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [opened]);

  const hasRecipient =
    isPatientUser || includePatient || participantIds.length > 0;

  const canSubmit =
    patientId !== null &&
    subject.trim().length > 0 &&
    initialMessage.trim().length > 0 &&
    hasRecipient &&
    !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !patientId) return;
    onSubmit({
      patient_id: patientId,
      subject: subject.trim(),
      participant_ids: participantIds.map(Number),
      initial_message: initialMessage.trim(),
      include_patient_as_participant: isPatientUser ? true : includePatient,
    });
  }, [
    canSubmit,
    patientId,
    subject,
    participantIds,
    initialMessage,
    onSubmit,
    isPatientUser,
    includePatient,
  ]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Heading>New message</Heading>}
      size="lg"
      centered
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {isPatientUser ? null : lockedPatientId ? (
          <BodyTextBold>
            Patient: {lockedPatientName ?? lockedPatientId}
          </BodyTextBold>
        ) : (
          <SelectField
            label="Patient"
            placeholder="Select a patient"
            data={patients}
            value={patientId}
            onChange={setPatientId}
            searchable
            required
            disabled={loadingPatients}
            nothingFoundMessage={
              loadingPatients ? "Loading patients\u2026" : "No patients found"
            }
          />
        )}

        {!isPatientUser && (
          <div>
            <SolidSwitch
              label="Patient as participant"
              description="Allow the patient to reply to this conversation"
              checked={includePatient}
              onChange={(e) => setIncludePatient(e.currentTarget.checked)}
            />
          </div>
        )}

        <MultiSelectField
          label="Participants"
          placeholder="Add staff to this conversation"
          data={users}
          value={participantIds}
          onChange={setParticipantIds}
          searchable
          disabled={loadingUsers}
          nothingFoundMessage={
            loadingUsers ? "Loading users\u2026" : "No users found"
          }
        />

        <TextField
          label="Subject"
          placeholder="e.g. Prescription renewal"
          value={subject}
          onChange={(e) => setSubject(e.currentTarget.value)}
          required
        />

        <TextAreaField
          label="Message"
          placeholder="Type your message…"
          minRows={3}
          autosize
          maxRows={8}
          value={initialMessage}
          onChange={(e) => setInitialMessage(e.currentTarget.value)}
          required
        />

        {!canSubmit &&
          patientId === null &&
          !isPatientUser &&
          initialMessage.trim() && (
            <ErrorMessage>Please select a patient</ErrorMessage>
          )}

        {!canSubmit &&
          !hasRecipient &&
          patientId !== null &&
          initialMessage.trim() && (
            <ErrorMessage>
              Add at least one participant or include the patient
            </ErrorMessage>
          )}

        <ButtonPair
          acceptLabel={isSubmitting ? "Creating\u2026" : "Start conversation"}
          onAccept={handleSubmit}
          onCancel={onClose}
          acceptDisabled={!canSubmit || isSubmitting}
        />
      </Stack>
    </Modal>
  );
}
