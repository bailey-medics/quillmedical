import DarkBackground from "@/components/background/DarkBackground";
import HeroBackground from "@/components/background/HeroBackground";
import LightBackground from "@/components/background/LightBackground";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicText from "@/components/typography/PublicText";
import { theme } from "@/theme";
import { Container, MantineProvider, Stack } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PublicLayout>
      <HeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Company information" />
            <PublicText size="lg">
              Quill Medical is a trade name of Bailey Medics Ltd, also trading
              under the trade name of Let&rsquo;s Do Digital.
            </PublicText>
          </Stack>
        </Container>
      </HeroBackground>

      <LightBackground>
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
      </LightBackground>

      <DarkBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Company details" c="white" />
            <PublicText size="lg">Company number: 15604352</PublicText>
          </Stack>
        </Container>
      </DarkBackground>
    </PublicLayout>
  </MantineProvider>,
);
