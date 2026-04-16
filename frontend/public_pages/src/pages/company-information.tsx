import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicLightBackground from "@/components/background/PublicLightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Company information" />
            <PublicText size="lg">
              Quill Medical is a trade name of Bailey Medics Ltd, also trading
              under the trade name of Let&rsquo;s Do Digital.
            </PublicText>
          </Stack>
        </Container>
      </PublicHeroBackground>

      <PublicLightBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Registered address" c="white" />
            <PublicText size="lg">
              Brooklands Place
              <br />
              Unit 5
              <br />
              Brooklands Road
              <br />
              Sale
              <br />
              Cheshire
              <br />
              United Kingdom, M33 3SD
            </PublicText>
          </Stack>
        </Container>
      </PublicLightBackground>

      <PublicDarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Company details" c="white" />
            <PublicText size="lg">Company number: 15604352</PublicText>
          </Stack>
        </Container>
      </PublicDarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
