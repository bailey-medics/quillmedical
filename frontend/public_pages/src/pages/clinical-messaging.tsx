import DarkBackground from "@/components/background/DarkBackground";
import HeroBackground from "@/components/background/HeroBackground";
import LightBackground from "@/components/background/LightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/page-header/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <HeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Clinical messaging" />
            <PublicText size="lg">
              A new approach to patient-clinician communication. Private
              clinics, independent practitioners, and specialist services can
              now offer patients a direct, paid messaging channel — giving
              patients quick access to clinical advice outside of scheduled
              appointments.
            </PublicText>
            <PublicText size="lg">
              Patients pay per question, avoiding the cost and delay of a full
              appointment for straightforward queries. Clinicians respond on
              their own schedule, triaging and prioritising as they see fit.
              It&apos;s a model that respects everyone&apos;s time — and keeps
              clinical communication where it belongs: inside a governed,
              auditable system.
            </PublicText>
          </Stack>
        </Container>
      </HeroBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Clinical messaging" c="white" />
            <PublicText size="lg">
              Clinical communication deserves better than pagers, bleeps, and
              sticky notes. Quill&apos;s messaging layer is built on FHIR
              Communication resources — giving every message a structured,
              queryable foundation that integrates directly with the patient
              record.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Governance without friction" c="white" />
            <PublicText size="lg">
              Every message carries governance metadata — sender identity,
              timestamp, read receipts, and clinical context — kept cleanly
              separate from the clinical content itself. This means audit trails
              are automatic, not an afterthought.
            </PublicText>
            <PublicText size="lg">
              Threaded conversations keep discussions contextual. Whether
              it&apos;s a quick handover note or a complex multi-disciplinary
              discussion, the full history is preserved and searchable.
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Designed for clinical workflows" c="white" />
            <PublicText size="lg">
              Messages can be triaged, escalated, and routed based on urgency
              and clinical context. The system understands that a message about
              a deteriorating patient is not the same as a routine admin query —
              and treats them accordingly.
            </PublicText>
            <PublicText size="lg">
              Role-based visibility ensures the right people see the right
              messages. Competency-based access control means a locum can&apos;t
              accidentally access conversations they shouldn&apos;t, while a
              consultant sees everything they need.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
