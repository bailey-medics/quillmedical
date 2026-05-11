import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconMessage } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: "var(--mantine-color-secondary-5)" }}>
              <Icon icon={<IconMessage />} size="xl" />
            </div>
            <PublicTitle title="Clinical messaging" />
            <PublicBodyText justify="centre">
              A new approach to patient-clinician communication. Private
              clinics, independent practitioners, and specialist services can
              now offer patients a direct, paid messaging channel — giving
              patients quick access to clinical advice outside of scheduled
              appointments.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Patients pay per question, avoiding the cost and delay of a full
              appointment for straightforward queries. Clinicians respond on
              their own schedule, triaging and prioritising as they see fit.
              It&apos;s a model that respects everyone&apos;s time — and keeps
              clinical communication where it belongs: inside a governed,
              auditable system.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Clinical messaging" c="white" />
            <PublicBodyText justify="centre">
              Clinical communication deserves better than pagers, bleeps, and
              sticky notes. Quill&apos;s messaging layer is built on FHIR
              Communication resources — giving every message a structured,
              queryable foundation that integrates directly with the patient
              record.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Governance without friction" c="white" />
            <PublicBodyText justify="centre">
              Every message carries governance metadata — sender identity,
              timestamp, read receipts, and clinical context — kept cleanly
              separate from the clinical content itself. This means audit trails
              are automatic, not an afterthought.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Threaded conversations keep discussions contextual. Whether
              it&apos;s a quick handover note or a complex multi-disciplinary
              discussion, the full history is preserved and searchable.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Designed for clinical workflows" c="white" />
            <PublicBodyText justify="centre">
              Messages can be triaged, escalated, and routed based on urgency
              and clinical context. The system understands that a message about
              a deteriorating patient is not the same as a routine admin query —
              and treats them accordingly.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Role-based visibility ensures the right people see the right
              messages. Competency-based access control means a locum can&apos;t
              accidentally access conversations they shouldn&apos;t, while a
              consultant sees everything they need.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
