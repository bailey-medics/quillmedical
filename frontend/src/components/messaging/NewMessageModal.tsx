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
import SolidSwitch from "@/components/switch/SolidSwitch";
import BodyText from "@/components/typography/BodyText";
import BodyTextBold from "@/components/typography/BodyTextBold";
import ErrorText from "@/components/typography/ErrorText";
import HeaderText from "@/components/typography/HeaderText";
import {
  Modal,
  MultiSelect,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
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
      setPatientId(lockedPatientId);
    }
  }, [opened, lockedPatientId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!opened) {
      setPatientId(null);
      setParticipantIds([]);
      setSubject("");
      setInitialMessage("");
      setIncludePatient(false);
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

  const fieldStyles = {
    label: {
      fontSize: "var(--mantine-font-size-lg)",
      color: "var(--mantine-color-dimmed)",
      fontWeight: 400,
    },
    input: { fontSize: "var(--mantine-font-size-lg)" },
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<HeaderText>New message</HeaderText>}
      size="lg"
      centered
    >
      <Stack gap="md">
        {isPatientUser ? null : lockedPatientId ? (
          <BodyTextBold>
            Patient: {lockedPatientName ?? lockedPatientId}
          </BodyTextBold>
        ) : (
          <Select
            label="Patient"
            placeholder="Select a patient"
            data={patients}
            value={patientId}
            onChange={setPatientId}
            searchable
            required
            disabled={loadingPatients}
            nothingFoundMessage={
              loadingPatients ? "Loading patients…" : "No patients found"
            }
            styles={fieldStyles}
          />
        )}

        {!isPatientUser && (
          <div>
            <div style={{ marginBottom: 4 }}>
              <BodyText>Patient as participant</BodyText>
            </div>
            <SolidSwitch
              checked={includePatient}
              onChange={(e) => setIncludePatient(e.currentTarget.checked)}
              size="lg"
              label={includePatient ? "Yes" : "No"}
            />
            <div style={{ marginTop: 4 }}>
              <BodyText>
                Allow the patient to reply to this conversation
              </BodyText>
            </div>
          </div>
        )}

        <MultiSelect
          label="Participants"
          placeholder="Add staff to this conversation"
          data={users}
          value={participantIds}
          onChange={setParticipantIds}
          searchable
          disabled={loadingUsers}
          nothingFoundMessage={
            loadingUsers ? "Loading users…" : "No users found"
          }
          styles={fieldStyles}
        />

        <TextInput
          label="Subject"
          placeholder="e.g. Prescription renewal"
          value={subject}
          onChange={(e) => setSubject(e.currentTarget.value)}
          required
          styles={fieldStyles}
        />

        <Textarea
          label="Message"
          placeholder="Type your message…"
          minRows={3}
          autosize
          maxRows={8}
          value={initialMessage}
          onChange={(e) => setInitialMessage(e.currentTarget.value)}
          required
          styles={fieldStyles}
        />

        {!canSubmit &&
          patientId === null &&
          !isPatientUser &&
          initialMessage.trim() && (
            <ErrorText>Please select a patient</ErrorText>
          )}

        {!canSubmit &&
          !hasRecipient &&
          patientId !== null &&
          initialMessage.trim() && (
            <ErrorText>
              Add at least one participant or include the patient
            </ErrorText>
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
