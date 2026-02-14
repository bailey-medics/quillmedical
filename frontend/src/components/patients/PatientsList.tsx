/**
 * Patients List Component
 *
 * Displays a list of patients with profile pictures and demographics.
 * Responsive layout adapts to mobile/desktop screen sizes. Provides
 * loading skeleton state and click handlers for patient selection.
 *
 * Features:
 * - Loading skeletons while fetching patient data
 * - Informative message when FHIR/openEHR systems are initializing
 * - Responsive avatar sizing (mobile/desktop)
 * - Patient selection callbacks
 */

import type { Patient } from "@/domains/patient";
import ProfilePic from "@/components/profile-pic/ProfilePic";
import Demographics from "@/components/demographics/Demographics";
import {
  Alert,
  Group,
  Skeleton,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";

/**
 * PatientsList Props
 */
type Props = {
  /** Array of patients to display */
  patients: Patient[];
  /** Whether patient data is currently loading */
  isLoading?: boolean;
  /** Callback when patient is clicked/selected */
  onSelect?: (p: Patient) => void;
};

/**
 * Patients List
 *
 * Renders list of patient cards with profile pictures and demographics.
 * Shows skeleton loaders while loading. Displays informative alert when
 * no patients are available (e.g., FHIR/openEHR initializing). Adapts
 * avatar size based on screen width (sm/lg).
 *
 * @param props - Component props
 * @returns Patient list component
 */
export default function PatientsList({
  patients,
  isLoading = false,
  onSelect,
}: Props) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "lg";
  if (isLoading) {
    return (
      <div>
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
        <div style={{ height: 8 }} />
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
        <div style={{ height: 8 }} />
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    return (
      <Alert
        icon={<IconInfoCircle size={20} />}
        title="Patient demographics loading"
        color="blue"
        variant="light"
        styles={{
          root: { maxWidth: 600 },
        }}
      >
        <Text size="sm">
          Patient demographics are being retrieved from FHIR/openEHR. This may
          take a few moments while the health record systems initialize. The
          patient list will appear automatically once the data is available.
        </Text>
      </Alert>
    );
  }

  return (
    <div>
      {patients.map((p) => {
        // Split patient name into given and family names
        const nameParts = p.name?.split(" ") || [];
        const givenName = nameParts[0];
        const familyName =
          nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

        return (
          <UnstyledButton
            key={p.id}
            onClick={() => onSelect?.(p)}
            style={{ textAlign: "left", width: "100%", padding: 8 }}
          >
            <Group style={{ width: "100%" }} align="center">
              <ProfilePic
                givenName={givenName}
                familyName={familyName}
                gradientIndex={p.gradientIndex}
                size={avatarSize}
              />
              <Demographics patient={p} />
              <div>
                {p.onQuill ? (
                  <Text style={{ fontSize: 12, color: "teal" }}>On Quill</Text>
                ) : null}
              </div>
            </Group>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
