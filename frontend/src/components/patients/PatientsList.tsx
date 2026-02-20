/**
 * Patients List Component
 *
 * Displays a list of patients with profile pictures and demographics.
 * Responsive layout adapts to mobile/desktop screen sizes. Provides
 * loading states and empty state messages for patient selection.
 *
 * Features:
 * - Backend-driven FHIR health status checks (via /health endpoint)
 * - Safe "Database is initialising" message when FHIR unavailable
 * - "No patients to show" only when FHIR confirmed available
 * - Responsive avatar sizing (mobile/desktop)
 * - Patient selection callbacks
 *
 * Safety: Uses backend health checks instead of timing heuristics to
 * prevent showing "No patients" when FHIR is still initializing.
 */

import type { Patient } from "@/domains/patient";
import ProfilePic from "@/components/profile-pic";
import Demographics from "@/components/demographics";
import StateMessage from "@/components/state-message";
import {
  Group,
  Text,
  UnstyledButton,
  Skeleton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

/**
 * PatientsList Props
 */
type Props = {
  /** Array of patients to display */
  patients: Patient[];
  /** Whether patient data is currently loading */
  isLoading?: boolean;
  /** Whether FHIR server is available and ready */
  fhirAvailable?: boolean;
  /** Callback when patient is clicked/selected */
  onSelect?: (p: Patient) => void;
};

/**
 * Patients List
 *
 * Renders list of patient cards with profile pictures and demographics.
 * Displays context-aware messages based on backend FHIR health status:
 * - FHIR unavailable: "Database is initialising" (blue alert)
 * - FHIR available with no patients: "No patients to show" (gray alert)
 * Uses backend /health endpoint to safely determine system readiness.
 * Adapts avatar size based on screen width (sm/lg).
 *
 * @param props - Component props
 * @returns Patient list component
 */
export default function PatientsList({
  patients,
  isLoading = false,
  fhirAvailable = false,
  onSelect,
}: Props) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "lg";

  if (isLoading) {
    return (
      <div style={{ width: "100%" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Group key={i} align="center" style={{ width: "100%", padding: 8 }}>
            <Skeleton circle height={isSm ? 40 : 60} />
            <div style={{ flex: 1 }}>
              <Skeleton height={20} width="60%" mb={8} />
              <Skeleton height={16} width="40%" />
            </div>
          </Group>
        ))}
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    // If FHIR is available and has no patients, show "no patients" message
    if (fhirAvailable) {
      return <StateMessage type="no-patients" />;
    }

    // If FHIR is not available yet, show database initializing message
    return <StateMessage type="database-initialising" />;
  }

  return (
    <div style={{ width: "100%" }}>
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
                  <Text size="xs" c="teal">
                    On Quill
                  </Text>
                ) : null}
              </div>
            </Group>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
