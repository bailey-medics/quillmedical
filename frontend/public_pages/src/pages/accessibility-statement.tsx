/**
 * Accessibility statement.
 *
 * Served at /accessibility-statement. The page at /accessibility is the
 * public-facing overview; this is the statement the regulations require.
 *
 * Follows the GOV.UK model accessibility statement, in its order, because
 * the Public Sector Bodies Accessibility Regulations 2018 set out what a
 * statement must say, and NHS organisations that buy Quill are bound by
 * them. It must stay true: "partially compliant" until people have tested
 * the service with assistive technology, and the review date moved each
 * time it is checked. The evidence behind it is
 * docs/docs/frontend/accessibility/dtac-d1.md and testing-log.md.
 */

import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import { Link, List, Section } from "../statementParts";
import "../global-styles";
import { createRoot } from "react-dom/client";

const FEEDBACK_EMAIL = "info@quill-medical.com";

/** Last reviewed; move this every time the statement is checked. */
const REVIEWED = "25 September 2026";

const email = <Link href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</Link>;

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Accessibility statement" />
            <PublicBodyText justify="centre">
              This statement applies to the Quill Medical website at
              quill-medical.com and to the Quill applications at
              app.quill-medical.com and teaching.quill-medical.com.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="md" py="xl">
          <Stack gap="xl" py="xl">
            <Section title="Using Quill">
              <PublicBodyText>
                Quill Medical runs this website and these applications. We want
                as many people as possible to be able to use them. For example,
                that means you should be able to:
              </PublicBodyText>
              <List
                items={[
                  "use the applications with a keyboard alone, including a link on every page to skip straight to its content",
                  "switch to a dark colour scheme, with text that keeps its contrast",
                  "read body text at 19 pixels, the size the NHS and GOV.UK design systems use, in a typeface designed for people with low vision",
                  "have animation switched off, if your device asks for reduced motion",
                  "hear loading, search results and form messages announced by a screen reader",
                ]}
              />
              <PublicBodyText>
                <Link href="https://mcmw.abilitynet.org.uk/">AbilityNet</Link>{" "}
                has advice on making your device easier to use if you have a
                disability.
              </PublicBodyText>
            </Section>

            <Section title="How accessible Quill is">
              <PublicBodyText>
                We know some parts of Quill are not yet fully accessible:
              </PublicBodyText>
              <List
                items={[
                  "we have not yet tested Quill with screen readers, screen magnifiers or voice control, so there may be problems we have not found",
                  "in Safari, you may not be able to scroll a long page that has nothing to select on it with the keyboard until you use the skip link",
                  "captions on teaching videos are generated automatically, and some may not yet have been checked by a person",
                  "teaching videos hosted on YouTube use YouTube's own player, which we do not control",
                ]}
              />
            </Section>

            <Section title="Feedback and contact information">
              <PublicBodyText>
                If you need information from Quill in a different format, such
                as large print, easy read, an audio recording or braille, email{" "}
                {email}. We will consider your request and get back to you as
                soon as we can.
              </PublicBodyText>
            </Section>

            <Section title="Reporting accessibility problems">
              <PublicBodyText>
                We are always looking to improve the accessibility of Quill. If
                you find a problem that is not listed on this page, or you think
                we are not meeting accessibility requirements, email {email}. If
                you are signed in, you can also use Feedback in the side
                navigation.
              </PublicBodyText>
            </Section>

            <Section title="Enforcement procedure">
              <PublicBodyText>
                The Equality and Human Rights Commission (EHRC) is responsible
                for enforcing the Public Sector Bodies (Websites and Mobile
                Applications) (No. 2) Accessibility Regulations 2018 (the
                &quot;accessibility regulations&quot;). If you are not happy
                with how we respond to your complaint, contact the{" "}
                <Link href="https://www.equalityadvisoryservice.com/">
                  Equality Advisory and Support Service (EASS)
                </Link>
                .
              </PublicBodyText>
            </Section>

            <Section title="Technical information about accessibility">
              <PublicBodyText>
                Quill Medical is committed to making its website and
                applications accessible, in accordance with the Public Sector
                Bodies (Websites and Mobile Applications) (No. 2) Accessibility
                Regulations 2018.
              </PublicBodyText>
            </Section>

            <Section title="Compliance status">
              <PublicBodyText>
                Quill is partially compliant with the{" "}
                <Link href="https://www.w3.org/TR/WCAG22/">
                  Web Content Accessibility Guidelines version 2.2
                </Link>{" "}
                AA standard, due to the non-compliances listed below, and
                because it has not yet been tested with assistive technology.
              </PublicBodyText>
            </Section>

            <Section title="Non-accessible content">
              <PublicTitle
                title="Non-compliance with the accessibility regulations"
                size="sm"
                ta="left"
                c="white"
              />
              <List
                items={[
                  "In Safari, a long page with no controls on it may not scroll with the keyboard until the skip link has moved focus into the page. This may fail WCAG 2.2 success criterion 2.1.1 (Keyboard) in that browser. We will confirm this when we test with Safari, and fix it if so.",
                  "Captions on hosted teaching videos are generated automatically, and a person checks and corrects them afterwards. Until that check is done, a video's captions may contain errors, which may fail WCAG 2.2 success criterion 1.2.2 (Captions, prerecorded). We aim to check every video's captions.",
                ]}
              />
              <PublicTitle
                title="Disproportionate burden"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                We are not claiming disproportionate burden for any part of
                Quill.
              </PublicBodyText>
              <PublicTitle
                title="Content that is not within the scope of the accessibility regulations"
                size="sm"
                ta="left"
                c="white"
              />
              <PublicBodyText>
                Teaching videos hosted on YouTube are played in YouTube&apos;s
                own player. Third-party content that we do not fund, develop or
                control is not covered by the regulations, though we give it an
                accessible name.
              </PublicBodyText>
            </Section>

            <Section title="What we are doing to improve accessibility">
              <PublicBodyText>
                Every change to Quill is checked automatically against WCAG 2.2
                AA before it can be released: every component, in light and dark
                colour schemes, and the main pages, in two browser engines,
                including by keyboard alone. Before Quill is used more widely in
                the NHS, we will test it with screen readers, screen magnifiers
                and voice control, and with people who use them, and update this
                statement with what we find.
              </PublicBodyText>
            </Section>

            <Section title="Preparation of this accessibility statement">
              <PublicBodyText>
                This statement was prepared on 25 September 2026. It was last
                reviewed on {REVIEWED}.
              </PublicBodyText>
              <PublicBodyText>
                Quill was last tested on 25 September 2026 by Quill Medical. The
                tests were automated: axe-core accessibility checks against WCAG
                2.2 AA on every component and on the main pages, and
                keyboard-only journeys through signing in and the navigation, in
                Chromium and WebKit, the engine Safari uses. We have not yet
                tested with assistive technology.
              </PublicBodyText>
            </Section>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
