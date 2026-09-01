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
            <PublicTitle title="Cookie policy" />
            <PublicBodyText justify="centre">
              This website sets no cookies at all. The Quill application, which
              you reach after signing in, sets three &mdash; all of them
              strictly necessary to keep you signed in safely. We do not use
              cookies for advertising, profiling, or tracking you across other
              websites, and we never will.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack gap="lg" py="xl">
            <Heading c="white">This website</Heading>
            <PublicBodyText>
              These public pages set no cookies and store nothing on your
              device. There is no analytics script, no advertising pixel, and no
              consent banner, because there is nothing to consent to.
            </PublicBodyText>
            <PublicBodyText>
              Our web server does keep a short-lived record of requests it
              receives, which includes the address of the page requested, the
              time, your browser&rsquo;s user agent, the page that referred you,
              and your internet protocol (IP) address. This is ordinary server
              logging rather than a cookie: nothing is written to your device
              and nothing follows you to other websites. Those records are kept
              for a limited period and used only to understand how many people
              visit the site and to investigate abuse or faults.
            </PublicBodyText>

            <Heading c="white">The Quill application</Heading>
            <PublicBodyText>
              Once you sign in, three cookies are set. Each is strictly
              necessary to provide the service you have asked for, so none
              requires your consent &mdash; but you are entitled to know about
              them, which is what this page is for.
            </PublicBodyText>
            <PublicBodyText>
              <strong>access_token</strong> keeps you signed in as you move
              between pages. It expires after 15 minutes and is renewed while
              you are active. It cannot be read by JavaScript.
            </PublicBodyText>
            <PublicBodyText>
              <strong>refresh_token</strong> lets your session be renewed
              without asking you to sign in again every 15 minutes. It lasts 7
              days, is sent only to the single address that renews sessions, and
              cannot be read by JavaScript.
            </PublicBodyText>
            <PublicBodyText>
              <strong>XSRF-TOKEN</strong> protects you from a class of attack in
              which another website tries to make your browser perform actions
              in Quill without your knowledge. It is deliberately readable by
              the application&rsquo;s own code, because the application must
              send it back to prove a request genuinely came from you. It lasts
              as long as your access token.
            </PublicBodyText>
            <PublicBodyText>
              All three are restricted to Quill&rsquo;s own domain, are sent
              only over an encrypted connection, and are removed when you sign
              out.
            </PublicBodyText>

            <Heading c="white">Refusing cookies</Heading>
            <PublicBodyText>
              You can block or delete these cookies in your browser settings.
              Because they are the mechanism by which you stay signed in, doing
              so will prevent you from using the application &mdash; there is no
              version of Quill that works without them. Nothing on these public
              pages is affected.
            </PublicBodyText>

            <Heading c="white">Changes and questions</Heading>
            <PublicBodyText>
              If we ever introduce a cookie that is not strictly necessary, we
              will ask for your consent before setting it and update this page
              first. If you have any questions about this policy, please
              contact us.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
