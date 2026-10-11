/**
 * Edit Patient Page
 *
 * The list an administrator picks a patient from to edit, at
 * /admin/patients/edit. Choosing one opens /admin/patients/:id/edit, which
 * is NewPatientPage in its edit mode: the form itself is there, not here.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stack, Table, Skeleton, Center } from "@mantine/core";
import { IconEdit } from "@components/icons/appIcons";
import IconButton from "@/components/button/IconButton";
import { BodyTextBold, EmptyState } from "@/components/typography";
import PageHeader from "@/components/page-header";
import { api } from "@/lib/api";
import ErrorState from "@/components/error-state/ErrorState";

interface Patient {
  id: string;
  name: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
}

/**
 * Edit Patient Page
 *
 * Lists every patient, each with a button that opens its edit form.
 *
 * @returns Edit patient selection page component
 */
export default function EditPatientPage() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const data = await api.get<{ patients?: Patient[] }>("/patients");
        setPatients(data.patients || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchPatients();
  }, []);

  const formatName = (
    nameArray: Array<{ given?: string[]; family?: string }>,
  ) => {
    if (!nameArray || nameArray.length === 0) return "Unknown";
    const name = nameArray[0];
    const givenName = name.given?.[0] || "";
    const familyName = name.family || "";
    return `${givenName} ${familyName}`.trim() || "Unknown";
  };

  const handleEditPatient = (id: string) => {
    navigate(`/admin/patients/${id}/edit`);
  };

  return (
    <Stack gap="lg">
      <PageHeader title="Edit patient" />

      {loading ? (
        <Stack gap="xs">
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </Stack>
      ) : error ? (
        <ErrorState title="Error loading patients" message={error} />
      ) : patients.length === 0 ? (
        <Center p="xl">
          <EmptyState>No patients found</EmptyState>
        </Center>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Birth Date</Table.Th>
              <Table.Th>Gender</Table.Th>
              <Table.Th style={{ width: "100px", textAlign: "right" }}>
                Action
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {patients.map((patient) => (
              <Table.Tr key={patient.id}>
                <Table.Td>
                  <BodyTextBold>{formatName(patient.name)}</BodyTextBold>
                </Table.Td>
                <Table.Td>{patient.birthDate || "N/A"}</Table.Td>
                <Table.Td>{patient.gender || "N/A"}</Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <IconButton
                    icon={<IconEdit />}
                    variant="light"
                    color="primary"
                    onClick={() => handleEditPatient(patient.id)}
                    aria-label="Edit patient"
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
