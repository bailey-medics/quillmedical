import PublicHeroBackground from "@/components/background/PublicHeroBackground";
import PublicButton from "@/components/button/PublicButton";
import PublicLayout from "@/components/layouts/PublicLayout";
import PublicTitle from "@/components/typography/PublicTitle";
import PublicBodyText from "@/components/typography/PublicBodyText";
import { Container, Group, Stack } from "@mantine/core";
import PublicMantineProvider from "../PublicMantineProvider";
import "../global-styles";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <PublicMantineProvider>
    <PublicLayout>
      <PublicHeroBackground>
        <Container size="lg" py="xl">
          <Stack align="center" gap="md" py="xl">
            <PublicTitle title="Pricing" />
            <PublicBodyText justify="centre">
              Pricing is agreed with each organisation. Tell us what you would
              like to teach or assess, and we will talk it through with you.
            </PublicBodyText>
            <Group mt="lg">
              <PublicButton href="/contact">Contact us</PublicButton>
            </Group>
          </Stack>
        </Container>
      </PublicHeroBackground>
    </PublicLayout>
  </PublicMantineProvider>,
);
