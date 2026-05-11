import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import PublicButton from "@/components/button/PublicButton";
import PublicBodyText from "@/components/typography/PublicBodyText";
import PublicTitle from "@/components/typography/PublicTitle";
import { Container, Stack } from "@mantine/core";

export interface PublicNotFoundProps {
  /** Override the default home URL — defaults to "/" */
  homeHref?: string;
}

export default function PublicNotFound({
  homeHref = "/",
}: PublicNotFoundProps) {
  return (
    <PublicDarkBackground>
      <Container size="lg" py="xl">
        <Stack align="center" gap="md" py="xl" style={{ minHeight: "100dvh" }}>
          <PublicTitle title="404 — Page not found" c="white" />
          <PublicBodyText justify="centre">
            The page you requested does not exist. It may have been moved or
            removed.
          </PublicBodyText>
          <PublicButton href={homeHref}>Go to home</PublicButton>
        </Stack>
      </Container>
    </PublicDarkBackground>
  );
}
