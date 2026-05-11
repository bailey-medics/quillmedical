import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconDatabase } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: "var(--mantine-color-secondary-5)" }}>
              <Icon icon={<IconDatabase />} size="xl" />
            </div>
            <PublicTitle title="Structured clinical records" c="white" />
            <PublicBodyText justify="centre">
              Most electronic health records store clinical data as free text —
              trapped in notes fields, unsearchable, and impossible to analyse
              at scale. Quill takes a different approach, built from the ground
              up on OpenEHR archetypes.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Semantically rich data" c="white" />
            <PublicBodyText justify="centre">
              Every clinical observation, diagnosis, and procedure is stored as
              structured, semantically rich data. An archetype defines not just
              what data is captured, but what it means — making it queryable,
              comparable, and portable across systems.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              This means you can ask questions like &ldquo;show me all patients
              with a systolic blood pressure above 160 in the last month&rdquo;
              — and get a precise, reliable answer. Not a keyword search through
              free text.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built on open standards" c="white" />
            <PublicBodyText justify="centre">
              OpenEHR is an internationally recognised standard for clinical
              data modelling. By building on EHRbase — a certified, open-source
              OpenEHR server — Quill ensures your clinical data is never locked
              into a proprietary format.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Combined with FHIR R4 for demographics and administrative data,
              Quill speaks the same language as the wider healthcare ecosystem.
              Interoperability is not a feature — it is the architecture.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
