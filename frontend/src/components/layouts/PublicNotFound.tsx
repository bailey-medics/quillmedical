import DarkBackground from "@/components/background/DarkBackground";
import PublicButton from "@/components/button/PublicButton";
import PublicText from "@/components/typography/PublicText";
import PublicTitle from "@/components/page-header/PublicTitle";
import { Container, Stack } from "@mantine/core";

export interface PublicNotFoundProps {
  /** Override the default home URL — defaults to "/" */
  homeHref?: string;
}

export default function PublicNotFound({
  homeHref = "/",
}: PublicNotFoundProps) {
  return (
    <DarkBackground>
      <Container size="lg" py="xl">
        <Stack align="center" gap="md" py="xl" style={{ minHeight: "50dvh" }}>
          <PublicTitle title="404 — Page not found" c="white" />
          <PublicText size="lg">
            The page you requested does not exist. It may have been moved or
            removed.
          </PublicText>
          <PublicButton href={homeHref}>Go to home</PublicButton>
        </Stack>
      </Container>
    </DarkBackground>
  );
}
