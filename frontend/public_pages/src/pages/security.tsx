import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconBuildingHospital,
  IconLock,
  IconShieldCheck,
} from "@/components/icons/appIcons";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Safe and *secure*" />
            <PublicBodyText justify="centre">
              Assessment results and the people who sit them deserve the same
              care as clinical data. This is how Quill looks after both.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconBuildingHospital}
              title="Hosted in the UK"
              body="Your data stays in the UK."
            />
            <PublicFeatureCard
              icon={IconShieldCheck}
              title="Security tested on every change"
              body="Automated penetration tests try tampered logins, cross-site request forgery, access to other people's data, injection and rate limits on every change, alongside weekly OWASP ZAP scans and static code scanning."
            />
            <PublicFeatureCard
              icon={IconLock}
              title="Strong sign-in"
              body="Passwords hashed with Argon2, short-lived session cookies that scripts cannot read, and optional two-factor authentication with an authenticator app."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
