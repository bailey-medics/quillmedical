/**
 * New Conversation Modal
 *
 * Modal dialog for creating a new messaging conversation.
 * Allows selecting a patient, adding participants, setting a subject,
 * and writing the initial message.
 *
 * Uses the Form wrapper for submission lifecycle management.
 */

import { api } from "@lib/api";
import { useAuth } from "@/auth/AuthContext";
import { Form, SubmitButton, useFormContext } from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import MultiSelectField from "@/components/form/MultiSelectField";
import SelectField from "@/components/form/SelectField";
import TextAreaField from "@/components/form/TextAreaField";
import TextField from "@/components/form/TextField";
import SolidSwitch from "@/components/form/SolidSwitch";
import BodyTextBold from "@/components/typography/BodyTextBold";
import Heading from "@/components/typography/Heading";
import { Modal, Stack } from "@mantine/core";
import { useEffect, useState } from "react";

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

interface NewConversationFormValues {
  patientId: string | null;
  participantIds: string[];
  subject: string;
  initialMessage: string;
  includePatient: boolean;
}

interface NewMessageModalProps {
  /** Whether the modal is open */
  opened: boolean;
  /** Called when the modal is closed */
  onClose: () => void;
  /** Called when the user submits the form — should return a FormSubmitResult */
  onSubmit: (data: NewConversationData) => Promise<FormSubmitResult>;
  /** Pre-selected patient ID (locks the patient selector) */
  patientId?: string;
  /** Patient name to display when patientId is locked */
  patientName?: string;
  /** Override patient-view mode (hides patient field and toggle). Defaults to auth context. */
  isPatientView?: boolean;
}

/** Inner form fields — uses Form context to wire to RHF */
function NewMessageFields({
  patients,
  users,
  loadingPatients,
  loadingUsers,
  lockedPatientId,
  lockedPatientName,
  isPatientUser,
  onClose,
}: {
  patients: PatientOption[];
  users: UserOption[];
  loadingPatients: boolean;
  loadingUsers: boolean;
  lockedPatientId?: string;
  lockedPatientName?: string;
  isPatientUser: boolean;
  onClose: () => void;
}) {
  const { methods } = useFormContext();
  const { watch, setValue } = methods;

  const patientId = watch("patientId") as string | null;
  const participantIds = watch("participantIds") as string[];
  const subject = watch("subject") as string;
  const initialMessage = watch("initialMessage") as string;
  const includePatient = watch("includePatient") as boolean;

  return (
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
          onChange={(v) =>
            setValue("patientId", v, { shouldDirty: true })
          }
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
            onChange={(e) =>
              setValue("includePatient", e.currentTarget.checked, {
                shouldDirty: true,
              })
            }
          />
        </div>
      )}

      <MultiSelectField
        label="Participants"
        placeholder="Add staff to this conversation"
        data={users}
        value={participantIds}
        onChange={(v) =>
          setValue("participantIds", v, { shouldDirty: true })
        }
        searchable
        disabled={loadingUsers}
        nothingFoundMessage={
          loadingUsers ? "Loading users\u2026" : "No users found"
        }
      />

      <TextField
        label="Subject"
        placeholder="e.g. Prescription renewal"
        required
        value={subject}
        onChange={(e) =>
          setValue("subject", e.currentTarget.value, { shouldDirty: true })
        }
      />

      <TextAreaField
        label="Message"
        placeholder={"Type your message\u2026"}
        minRows={3}
        autosize
        maxRows={8}
        required
        value={initialMessage}
        onChange={(e) =>
          setValue("initialMessage", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
      />

      <SubmitButton onCancel={onClose} cancelLabel="Cancel" />
    </Stack>
  );
}

export default function NewMessageModal({
  opened,
  onClose,
  onSubmit,
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

  const handleSubmit = async (
    data: NewConversationFormValues,
  ): Promise<FormSubmitResult> => {
    const patientId = lockedPatientId ?? data.patientId;
    if (!patientId) {
      return {
        state: "error",
        message: { title: "Please select a patient" },
      };
    }

    return onSubmit({
      patient_id: patientId,
      subject: data.subject.trim(),
      participant_ids: data.participantIds.map(Number),
      initial_message: data.initialMessage.trim(),
      include_patient_as_participant: isPatientUser
        ? true
        : data.includePatient,
    });
  };

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Heading>New message</Heading>}
      size="lg"
      centered
    >
      <Form<NewConversationFormValues>
        defaultValues={{
          patientId: lockedPatientId ?? null,
          participantIds: [],
          subject: "",
          initialMessage: "",
          includePatient: false,
        }}
        onSubmit={handleSubmit}
        submitLabel="Start conversation"
        submittingLabel={"Creating\u2026"}
      >
        <NewMessageFields
          patients={patients}
          users={users}
          loadingPatients={loadingPatients}
          loadingUsers={loadingUsers}
          lockedPatientId={lockedPatientId}
          lockedPatientName={lockedPatientName}
          isPatientUser={isPatientUser}
          onClose={onClose}
        />
      </Form>
    </Modal>
  );
}
