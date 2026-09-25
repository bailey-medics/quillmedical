import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import { PublicFeatureCard } from "@/components/feature-card/PublicFeatureCard";
import PublicFeatureCardGrid from "@/components/feature-card/PublicFeatureCardGrid";
import {
  IconAccessible,
  IconBadgeCc,
  IconCircleCheck,
  IconEye,
  IconFileText,
  IconKeyboard,
  IconMoon,
  IconPlayerPlay,
} from "@/components/icons/appIcons";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Anchor, Container, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Accessible by *design*" />
            <PublicBodyText justify="centre">
              Accessibility matters to us. An exam is only fair if every
              candidate can read it.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              We are working towards WCAG 2.2 AA, and a lot of that work is
              already built in: automated accessibility checks run on every
              change, and a change that fails them cannot be released. Testing
              with screen readers and with people who use assistive technology
              is still to come.
            </PublicBodyText>
            <PublicBodyText justify="centre">
              Our{" "}
              <Anchor
                href="/accessibility-statement"
                c="secondary.5"
                underline="always"
              >
                accessibility statement
              </Anchor>{" "}
              sets out how accessible Quill is and what is not yet.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="What is built in" size="md" c="white" />
          </Stack>
          <PublicFeatureCardGrid>
            <PublicFeatureCard
              icon={IconEye}
              title="A typeface designed for low vision"
              body="Atkinson Hyperlegible Next, designed by the Braille Institute so similar letters and numbers cannot be mistaken for each other."
            />
            <PublicFeatureCard
              icon={IconFileText}
              title="Text at the size the NHS uses"
              body="Body text is fixed at 19px, the size the NHS and GOV.UK design systems settle on, and does not shrink on small screens."
            />
            <PublicFeatureCard
              icon={IconMoon}
              title="Strong contrast, light or dark"
              body="Every text colour is tested for the WCAG contrast ratio against what it sits on, in light and dark mode, and a change that breaks it fails the build."
            />
            <PublicFeatureCard
              icon={IconCircleCheck}
              title="Colour is never the only signal"
              body="Status colours are chosen to be told apart by colour-blind users, and every status also carries an icon or text."
            />
            <PublicFeatureCard
              icon={IconKeyboard}
              title="Works from the keyboard"
              body="A skip link on every page, focus that is always visible, and navigation reachable with the Tab key alone."
            />
            <PublicFeatureCard
              icon={IconAccessible}
              title="Screen reader announcements"
              body="Loading, search results and form outcomes are announced without moving focus, and every page has its own title."
            />
            <PublicFeatureCard
              icon={IconBadgeCc}
              title="Captions on every hosted video"
              body="Every video hosted in a learning module carries captions."
            />
            <PublicFeatureCard
              icon={IconPlayerPlay}
              title="Respects reduced motion"
              body="Animations stop when your device asks for less motion."
            />
          </PublicFeatureCardGrid>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Reporting a problem" size="md" c="white" />
            <PublicBodyText justify="centre">
              If something is hard to use, please tell us. Use Feedback in the
              app, or email{" "}
              <Anchor
                href="mailto:info@quill-medical.com"
                c="secondary.5"
                underline="always"
              >
                info@quill-medical.com
              </Anchor>
              .
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
