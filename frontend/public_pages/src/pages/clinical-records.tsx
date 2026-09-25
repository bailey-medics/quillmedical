import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import Icon from "@/components/icons/Icon";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Group, Stack } from "@mantine/core";
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
            <PublicTitle title="Clinical records" c="white" />
            <PublicBodyText justify="centre">
              Alongside our learning and assessment platform, we are building a
              clinical record on the same foundations. It is in development and
              not yet in use with patients.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Built on open standards" size="md" c="white" />
            <PublicBodyText justify="centre">
              Patient demographics are held in FHIR R4 and clinical documents in
              OpenEHR, both open international standards. Clinical data is
              stored with its meaning attached rather than as free text, so it
              can be searched precisely and moved to another system without
              being locked into ours.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Clinical messaging" size="md" c="white" />
            <PublicBodyText justify="centre">
              Threaded messages between patients and their clinical team, kept
              inside the record rather than in email, so the conversation stays
              with the clinical context it belongs to.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Access that reflects clinical practice"
              size="md"
              c="white"
            />
            <PublicBodyText justify="centre">
              A job title says little about what somebody may do. Access in
              Quill follows what each clinician is qualified to do, and where
              they are authorised to do it, rather than a single role.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Switched on per organisation"
              size="md"
              c="white"
            />
            <PublicBodyText justify="centre">
              Each part of Quill is turned on for an organisation when it is
              wanted, so a team can start with what it needs and add the rest
              later.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Interested in early access?"
              size="md"
              c="white"
            />
            <PublicBodyText justify="centre">
              If you would like to shape the clinical record while it is being
              built, we would like to hear from you.
            </PublicBodyText>
            <Group mt="lg" justify="center">
              <PublicButton href="/contact">Talk to us</PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
