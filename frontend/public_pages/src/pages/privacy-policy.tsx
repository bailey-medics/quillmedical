import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import Heading from "@/components/typography/Heading";
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
            <PublicTitle title="Privacy policy" />
            <PublicBodyText justify="centre">
              How Quill Medical handles your personal information, in plain
              terms. We collect as little as we can, we keep it inside
              infrastructure we control, and we do not share it with
              advertising or analytics companies.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack gap="lg" py="xl">
            <Heading c="white">Visiting this website</Heading>
            <PublicBodyText>
              These public pages set no cookies and run no analytics scripts.
              Our web server records the requests it receives &mdash; the page
              requested, the time, your browser&rsquo;s user agent, the
              referring page, and your internet protocol (IP) address. We use
              these records to count visits and to investigate faults or abuse.
              They are kept for a limited period and then deleted
              automatically. Visit counts are also kept in aggregate form, with
              no IP address attached, so that we can see long-term trends
              without retaining anything about individual visitors.
            </PublicBodyText>
            <PublicBodyText>
              These pages currently load a typeface from Google Fonts, which
              means your IP address is sent to Google when the page loads. We
              are moving to serving that typeface ourselves so that no request
              leaves our infrastructure.
            </PublicBodyText>

            <Heading c="white">Using the Quill application</Heading>
            <PublicBodyText>
              When you hold an account we process the information needed to run
              it: your name and email address, your professional role and
              competencies, the organisation and site you belong to, and
              records of your activity within the service such as assessments
              you complete. We also keep security records &mdash; sign-in
              attempts and changes to accounts &mdash; because a clinical system
              must be able to show who did what.
            </PublicBodyText>
            <PublicBodyText>
              Where Quill is used to hold clinical information, that information
              is processed on behalf of the healthcare organisation responsible
              for your care. That organisation decides how it is used; we
              process it under their instructions.
            </PublicBodyText>

            <Heading c="white">What we do not do</Heading>
            <PublicBodyText>
              We do not sell your data. We do not use it for advertising or
              build advertising profiles. We do not run third-party analytics or
              tracking products, and we do not record your screen or sessions.
              We do not combine what we hold with data bought from anyone else.
            </PublicBodyText>

            <Heading c="white">Where your data is held</Heading>
            <PublicBodyText>
              Quill runs on Google Cloud Platform in European data centres.
              Google acts as our processor and cannot use the data for its own
              purposes. We use a small number of suppliers to operate the
              service, such as a provider that delivers our emails; each is
              bound by contract to process data only as we instruct.
            </PublicBodyText>

            <Heading c="white">Your rights</Heading>
            <PublicBodyText>
              Under United Kingdom data protection law you can ask us for a copy
              of the personal data we hold about you, ask us to correct it if it
              is wrong, ask us to delete it, object to how we are using it, or
              ask us to restrict its use. If Quill holds your health records on
              behalf of a healthcare organisation, requests about those records
              are usually best directed to that organisation, and we will help
              them respond.
            </PublicBodyText>
            <PublicBodyText>
              To exercise any of these rights, please contact us. If you are not
              satisfied with our response you have the right to complain to the
              Information Commissioner&rsquo;s Office, the United Kingdom data
              protection regulator.
            </PublicBodyText>

            <Heading c="white">Changes to this policy</Heading>
            <PublicBodyText>
              If we change how we handle personal data, we will update this page
              before the change takes effect. Please contact us if anything here
              is unclear.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
