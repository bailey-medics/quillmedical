import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconBell,
  IconBuildingHospital,
  IconDatabase,
  IconEyeOff,
  IconLock,
  IconLogin,
  IconShieldCheck,
  IconUserCheck,
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
              body="The app, its database, its backups and its logs are all in Google Cloud's London region, which is certified to ISO/IEC 27001."
            />
            <PublicFeatureCard
              icon={IconLock}
              title="Encrypted throughout"
              body="Every connection uses HTTPS, and everything we store is encrypted, backups included."
            />
            <PublicFeatureCard
              icon={IconLogin}
              title="Strong sign-in"
              body="Passwords hashed with Argon2, short-lived session cookies that scripts cannot read, optional two-factor authentication with an authenticator app, and repeated sign-in attempts slowed down."
            />
            <PublicFeatureCard
              icon={IconUserCheck}
              title="Only the people who need it"
              body="Staff see records only if their role needs it, and only for their own organisation. The server checks this on every request, and testing fails if any route is left unguarded."
            />
            <PublicFeatureCard
              icon={IconShieldCheck}
              title="Security tested on every change"
              body="Automated penetration tests cover tampered logins, cross-site request forgery, access to other people's data, injection and rate limits on every change, alongside weekly OWASP ZAP scans, static code scanning and secret scanning."
            />
            <PublicFeatureCard
              icon={IconDatabase}
              title="Backed up every day"
              body="Daily backups are kept for 30 days, and the database can be restored to any minute in the last seven days."
            />
            <PublicFeatureCard
              icon={IconBell}
              title="Watched around the clock"
              body="Errors and outages alert us straight away, and a major outage phones our on-call team immediately."
            />
            <PublicFeatureCard
              icon={IconEyeOff}
              title="No tracking"
              body="No advertising, no third-party analytics and no tracking cookies. The only cookies keep you signed in, protect forms and play teaching video."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
