import DarkBackground from "@/components/background/DarkBackground";
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
      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Structured clinical records" c="white" />
            <PublicText size="lg">
              Most electronic health records store clinical data as free text —
              trapped in notes fields, unsearchable, and impossible to analyse
              at scale. Quill takes a different approach, built from the ground
              up on OpenEHR archetypes.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Semantically rich data" c="white" />
            <PublicText size="lg">
              Every clinical observation, diagnosis, and procedure is stored as
              structured, semantically rich data. An archetype defines not just
              what data is captured, but what it means — making it queryable,
              comparable, and portable across systems.
            </PublicText>
            <PublicText size="lg">
              This means you can ask questions like &ldquo;show me all patients
              with a systolic blood pressure above 160 in the last month&rdquo;
              — and get a precise, reliable answer. Not a keyword search through
              free text.
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built on open standards" c="white" />
            <PublicText size="lg">
              OpenEHR is an internationally recognised standard for clinical
              data modelling. By building on EHRbase — a certified, open-source
              OpenEHR server — Quill ensures your clinical data is never locked
              into a proprietary format.
            </PublicText>
            <PublicText size="lg">
              Combined with FHIR R4 for demographics and administrative data,
              Quill speaks the same language as the wider healthcare ecosystem.
              Interoperability is not a feature — it is the architecture.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
