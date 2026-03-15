/**
 * New Conversation Modal
 *
 * Modal dialog for creating a new messaging conversation.
 * Allows selecting a patient, adding participants, setting a subject,
 * and writing the initial message.
 */

import { api } from "@lib/api";
import ButtonPair from "@/components/button/ButtonPair";
import {
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
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
  name: string;
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
}

export default function NewMessageModal({
  opened,
  onClose,
  onSubmit,
  isSubmitting = false,
  patientId: lockedPatientId,
  patientName: lockedPatientName,
}: NewMessageModalProps) {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [initialMessage, setInitialMessage] = useState("");

  // Fetch patients and users when modal opens
  useEffect(() => {
    if (!opened) return;

    if (!lockedPatientId) {
      setLoadingPatients(true);
      api
        .get<{ patients: ApiPatient[] }>("/patients")
        .then((res) => {
          setPatients(
            res.patients.map((p) => ({
              value: p.id,
              label: p.name,
            })),
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
    }
  }, [opened]);

  const canSubmit =
    patientId !== null &&
    subject.trim().length > 0 &&
    initialMessage.trim().length > 0 &&
    !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !patientId) return;
    onSubmit({
      patient_id: patientId,
      subject: subject.trim(),
      participant_ids: participantIds.map(Number),
      initial_message: initialMessage.trim(),
    });
  }, [canSubmit, patientId, subject, participantIds, initialMessage, onSubmit]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="lg" fw={700}>
          New message
        </Text>
      }
      size="lg"
      centered
    >
      <Stack gap="md">
        {lockedPatientId ? (
          <Text size="sm" fw={500}>
            Patient: {lockedPatientName ?? lockedPatientId}
          </Text>
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
          />
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
        />

        <TextInput
          label="Subject"
          placeholder="e.g. Prescription renewal"
          value={subject}
          onChange={(e) => setSubject(e.currentTarget.value)}
          required
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
        />

        {!canSubmit && patientId === null && initialMessage.trim() && (
          <Text size="sm" c="red">
            Please select a patient
          </Text>
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
