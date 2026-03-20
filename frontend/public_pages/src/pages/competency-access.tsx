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
            <PublicTitle title="Competency-based access control" c="white" />
            <PublicText size="lg">
              Traditional role-based access control was never designed for
              clinical environments. A &ldquo;doctor&rdquo; role tells you
              nothing about whether someone can prescribe controlled drugs,
              perform independent surgery, or supervise a trainee. Quill&apos;s
              CBAC system models what clinicians can actually do.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>

      <LightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Real NHS hierarchies" c="white" />
            <PublicText size="lg">
              CBAC understands the difference between a foundation year doctor,
              a specialty registrar, and a consultant — and what each is
              permitted to do. Locums, trainees, and permanent staff all have
              appropriately scoped access from the moment they log in.
            </PublicText>
            <PublicText size="lg">
              Competencies are defined centrally and assigned per profession,
              with the ability to grant additional competencies or remove
              specific ones for individual users. The result is fine-grained,
              auditable permissions that reflect actual clinical practice.
            </PublicText>
          </Stack>
        </Container>
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Auditable by design" c="white" />
            <PublicText size="lg">
              Every access decision is logged. Every competency change is
              tracked. When a clinical safety officer needs to know who had
              access to what and when, the answer is immediate and precise — not
              buried in spreadsheets.
            </PublicText>
            <PublicText size="lg">
              Risk-rated competencies ensure that high-risk actions (prescribing
              controlled substances, authorising discharges) carry appropriate
              oversight, while routine clinical tasks flow without unnecessary
              friction.
            </PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
