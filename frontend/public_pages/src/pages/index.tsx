import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicButton from "@/components/button/PublicButton";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import PublicInfoCard from "@/components/info-card/PublicInfoCard";
import PublicLayout from "@/components/layouts/PublicLayout";
import QuillLogo from "@/components/images/QuillLogo";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import {
  Container,
  Group,
  MantineProvider,
  SimpleGrid,
  Stack,
} from "@mantine/core";
import "../global-styles";
import {
  IconChalkboardTeacher,
  IconDatabase,
  IconMessage,
  IconPhoneRinging,
  IconSlice,
  IconStack2,
} from "@tabler/icons-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" justify="center" style={{ minHeight: "60dvh" }}>
            <QuillLogo height={8} colour="light-grey" />
            <PublicTitle title="Communication that counts!" />
            <PublicText size="lg">
              Exceptional clinical care deserves exceptional clinical tools.
              Software your team actually wants to use, and trainees who walk
              into any clinical setting knowing exactly what they're doing.
              Quill Medical is what a clinical team builds when they refuse to
              settle - for trainees across every specialty, and the clinicians
              who teach them.
            </PublicText>
            <Group mt="lg" justify="center">
              <PublicButton href="https://teaching.quill-medical.com">
                Teaching
              </PublicButton>
              <PublicButton href="https://staging.quill-medical.com">
                EPR Staging
              </PublicButton>
              <PublicButton variant="outline" disabled>
                EPR Live
              </PublicButton>
            </Group>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt="xl">
            <PublicInfoCard
              label="Architecture"
              heading="FHIR R4"
              description="HL7-compliant data layer"
            />
            <PublicInfoCard
              label="Clinical Safety"
              heading="DCB 0129"
              description="Certification"
            />
            <PublicInfoCard
              label="Data Residency"
              heading="UK / EU"
              description="GCP European region"
            />
          </SimpleGrid>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Built by clinicians *for* clinicians!"
              c="white"
            />
            <PublicText size="lg" mb="sm">
              Great clinical care has always depended on great clinical
              judgement. We believe it should also have great clinical tools to
              match - tools that support that judgement, surface the right
              information at the right moment, and get out of the way.
            </PublicText>
            <PublicText size="lg">
              The Quill team brings something rare to software development:
              genuine clinical experience. We have trained, examined, referred,
              prescribed, and taught. We know what good looks like at the
              bedside, and we build towards it. That is our commitment — to keep
              raising the standard of what clinical software can be, one
              carefully considered feature at a time.
            </PublicText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Everything a clinic *actually* needs!"
              c="white"
            />
            <PublicText size="lg">
              Quill brings together patient records, clinical messaging,
              letters, and structured documentation in a single coherent system
              — modular by design, so you deploy only what you need.
            </PublicText>
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconMessage}
              title="Clinical messaging"
              body="FHIR Communication resources underpin a secure, threaded messaging layer — with governance metadata kept cleanly separate from clinical content."
              href="/clinical-messaging.html"
            />
            <PublicFeatureCard
              icon={IconDatabase}
              title="Structured clinical records"
              body="OpenEHR archetypes ensure clinical data is semantically rich, queryable, and portable — not free-text trapped in a notes field."
              href="/structured-records.html"
            />
            <PublicFeatureCard
              icon={IconStack2}
              title="Modular deployment"
              body="Deploy Quill as a full EPR or activate only the modules your organisation needs — runtime feature gating means you grow the system alongside your workflows."
              href="/modular-deployment.html"
            />
            <PublicFeatureCard
              icon={IconSlice}
              title="Competency-based access"
              body="CBAC models real NHS clinical hierarchies — locums, trainees, and consultants — with fine-grained, auditable permissions that reflect actual clinical practice."
              href="/competency-access.html"
            />
            <PublicFeatureCard
              icon={IconPhoneRinging}
              title="External referrals made easy"
              body="Refer a patient and the receiving clinician gets immediate, structured access to their record. No faxes, no lost letters, no repeating history."
              href="/external-referrals.html"
            />
            <PublicFeatureCard
              icon={IconChalkboardTeacher}
              title="Clinical teaching platform"
              body="A structured MCQ-based learning platform for trainees across every specialty — built on the same clinical foundation as the EPR, not bolted on as an afterthought."
              href="/clinical-teaching.html"
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
