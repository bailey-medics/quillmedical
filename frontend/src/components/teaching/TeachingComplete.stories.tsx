/**
 * Teaching Layout-Complete Stories
 *
 * Full-page compositions showing teaching components with the
 * TopRibbon and LearningNav sidebar (no patient demographics,
 * no standard SideNav).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Container, Flex, Stack } from "@mantine/core";
import { useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import TopRibbon from "@/components/ribbon/TopRibbon";
import NavigationDrawer from "@/components/drawers/NavigationDrawer";
import PageHeader from "@/components/typography/PageHeader";
import LearningNav from "@/components/navigation/LearningNav";
import VideoPlayer from "./video-player/VideoPlayer";
import SlideViewer from "./slide-viewer/SlideViewer";
import PreviousNextButton from "@/components/button/PreviousNextButton";
import {
  stubSlides,
  videoSlide,
  imageSlide,
  textWithFigureSlide,
  calloutSlide,
} from "./slide-layouts/stubSlides";

const meta: Meta = {
  title: "Teaching/Layout-Complete",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

const SIDEBAR_W = 260;

/** Shared shell: TopRibbon (no patient) + LearningNav sidebar + content */
function TeachingShell({
  currentIndex,
  children,
}: {
  currentIndex: number;
  children: React.ReactNode;
}) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [opened, { toggle, close }] = useDisclosure(false);
  const visited = new Set(
    Array.from({ length: currentIndex + 1 }, (_, i) => i),
  );

  return (
    <Flex direction="column" h="100dvh">
      <Box
        component="header"
        pos="sticky"
        top={0}
        bg="var(--mantine-color-body)"
        style={{
          zIndex: 100,
          borderBottom: `1px solid var(--card-border, ${theme.colors.gray[2]})`,
          flexShrink: 0,
        }}
      >
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={false}
          patient={null}
          navOpen={opened}
          isNarrow={isSm}
        />
      </Box>

      <Flex flex={1} style={{ overflow: "hidden", position: "relative" }}>
        <NavigationDrawer opened={opened} onClose={close}>
          <LearningNav
            slides={stubSlides}
            currentIndex={currentIndex}
            visited={visited}
            onNavigate={close}
          />
        </NavigationDrawer>

        {!isSm && (
          <Box
            component="aside"
            w={SIDEBAR_W}
            style={{
              borderRight: `1px solid var(--card-border, ${theme.colors.gray[2]})`,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            <LearningNav
              slides={stubSlides}
              currentIndex={currentIndex}
              visited={visited}
              onNavigate={() => {}}
            />
          </Box>
        )}

        <Box
          component="main"
          flex={1}
          style={{ overflowY: "auto" }}
          px={isSm ? 0 : "md"}
          py={isSm ? 0 : "md"}
        >
          <Container size="lg" py="xl">
            <Stack gap="lg">{children}</Stack>
          </Container>
        </Box>
      </Flex>
    </Flex>
  );
}

export const WithVideoPlayer: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={1}>
      <PageHeader>Recorded lecture</PageHeader>
      <VideoPlayer youtubeId="2OTbDQh3MxM" />
    </TeachingShell>
  ),
};

export const SlideWithProgress: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={1}>
      <SlideViewer slide={videoSlide} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Next"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};

export const SlideWithImage: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={2}>
      <SlideViewer slide={imageSlide} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Next"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};

export const SlideWithTextAndFigure: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={3}>
      <SlideViewer slide={textWithFigureSlide} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Next"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};

export const SlideWithCallout: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={5}>
      <SlideViewer slide={calloutSlide} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Next"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};

export const LastSlide: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingShell currentIndex={6}>
      <SlideViewer slide={stubSlides[6]} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Finish"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};

export const DarkModeVideo: Story = {
  tags: ["!test"],
  globals: { colorScheme: "dark" },
  render: () => (
    <TeachingShell currentIndex={1}>
      <SlideViewer slide={videoSlide} />
      <PreviousNextButton
        onPrevious={() => {}}
        onNext={() => {}}
        nextLabel="Next"
        previousLabel="Previous"
      />
    </TeachingShell>
  ),
};
