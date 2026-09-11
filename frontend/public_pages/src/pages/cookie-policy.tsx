import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
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
            <PublicTitle title="Cookie policy" />
            <PublicBodyText justify="centre">
              A cookie is a small file a website stores on your device. Quill
              Medical uses four, and every one of them is needed for the service
              to work. We do not use cookies for advertising, and we do not
              track you across other websites.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="1. access_token" c="white" />
            <PublicBodyText justify="centre">
              Keeps you signed in. It proves who you are on each request, so you
              are not asked to sign in again with every click. Expires after 15
              minutes.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="2. refresh_token" c="white" />
            <PublicBodyText justify="centre">
              Keeps you signed in for longer. It obtains a new access token when
              the one above expires, so a normal working session is not
              interrupted. Expires after 7 days, and is sent only to the single
              address that renews a session.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="3. XSRF-TOKEN" c="white" />
            <PublicBodyText justify="centre">
              Keeps you safe. It protects against another website making
              requests on your behalf without your knowledge. Lasts for your
              browsing session.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="4. Cloud-CDN-Cookie" c="white" />
            <PublicBodyText justify="centre">
              Plays a lecture. It is released when you open a teaching video,
              and allows that one module&rsquo;s video to play. Expires after 30
              minutes and is renewed while you are watching. It is set only in
              the learning section, and only for the module you opened.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle
              title="Why we do not ask you to accept cookies"
              c="white"
            />
            <PublicBodyText justify="centre">
              Under the Privacy and Electronic Communications Regulations
              (PECR), consent is not required for cookies that are strictly
              necessary to provide a service you have asked for. All four of
              ours are in that category: without them you could not sign in,
              stay signed in, be protected from forged requests, or watch a
              lecture.
              <br />
              <br />A banner offering to reject them would be misleading,
              because refusing would simply stop the service working. If we ever
              add a cookie that is not strictly necessary — for analytics, say —
              we will ask first, and this page will change.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Measuring how the site is used" c="white" />
            <PublicBodyText justify="centre">
              We do count visits, but not with cookies. Our web server keeps a
              record of requests it receives, and those records are summarised
              into totals. Nothing is stored on your device for this, and the
              summaries do not identify you.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicDarkBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Managing cookies" c="white" />
            <PublicBodyText justify="centre">
              Your browser can block or delete cookies, and you are free to do
              so. Because ours are all strictly necessary, blocking them will
              stop you signing in and stop videos playing.
              <br />
              <br />
              If you have a question about this policy, please get in touch
              through our contact page.
            </PublicBodyText>
          </Stack>
        </Container>
      </PublicLightBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
