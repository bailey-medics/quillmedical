import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { IconSlice } from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <div style={{ color: "var(--public-amber)" }}>
              <Icon icon={<IconSlice />} size="xl" />
            </div>
            <PublicTitle title="Competency-based access control" c="white" />
            <PublicBodyText justify="centre">
              Traditional role-based access control was never designed for
              clinical environments. A &ldquo;doctor&rdquo; role tells you
              nothing about whether someone can prescribe controlled drugs,
              perform independent surgery, or supervise a trainee. Quill&apos;s
              CBAC system models what clinicians can actually do.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Real NHS hierarchies" c="white" />
            <PublicBodyText justify="centre">
              CBAC understands the difference between a foundation year doctor,
              a specialty registrar, and a consultant — and what each is
              permitted to do. Locums, trainees, and permanent staff all have
              appropriately scoped access from the moment they log in.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Competencies are defined centrally and assigned per profession,
              with the ability to grant additional competencies or remove
              specific ones for individual users. The result is fine-grained,
              auditable permissions that reflect actual clinical practice.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Auditable by design" c="white" />
            <PublicBodyText justify="centre">
              Every access decision is logged. Every competency change is
              tracked. When a clinical safety officer needs to know who had
              access to what and when, the answer is immediate and precise — not
              buried in spreadsheets.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Risk-rated competencies ensure that high-risk actions (prescribing
              controlled substances, authorising discharges) carry appropriate
              oversight, while routine clinical tasks flow without unnecessary
              friction.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
