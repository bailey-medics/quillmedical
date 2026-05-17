import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(({ src, controls }: { src: string; controls: boolean }) => (
    <div data-testid="react-player" data-src={src} data-controls={controls} />
  )),
}));

import VideoPlayer from "./VideoPlayer";

describe("VideoPlayer", () => {
  it("renders YouTube player when youtubeId is provided", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute(
      "data-src",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("renders nothing when no url or youtubeId is provided", () => {
    const { queryByTestId } = renderWithMantine(<VideoPlayer />);
    expect(queryByTestId("react-player")).not.toBeInTheDocument();
  });

  it("enables controls", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toHaveAttribute("data-controls", "true");
  });

  it("accepts onProgress callback", async () => {
    const handleProgress = vi.fn();
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" onProgress={handleProgress} />,
    );

    expect(await findByTestId("react-player")).toBeInTheDocument();
  });
});
