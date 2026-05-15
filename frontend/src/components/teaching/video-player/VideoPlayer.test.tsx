import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(({ url, controls }: { url: string; controls: boolean }) => (
    <div data-testid="react-player" data-url={url} data-controls={controls} />
  )),
}));

import VideoPlayer from "./VideoPlayer";

describe("VideoPlayer", () => {
  it("renders YouTube player when youtubeId is provided", () => {
    const { getByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    const player = getByTestId("react-player");
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute(
      "data-url",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("renders nothing when no url or youtubeId is provided", () => {
    const { queryByTestId } = renderWithMantine(<VideoPlayer />);
    expect(queryByTestId("react-player")).not.toBeInTheDocument();
  });

  it("enables controls", () => {
    const { getByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    expect(getByTestId("react-player")).toHaveAttribute(
      "data-controls",
      "true",
    );
  });

  it("accepts onProgress callback", () => {
    const handleProgress = vi.fn();
    const { getByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" onProgress={handleProgress} />,
    );

    expect(getByTestId("react-player")).toBeInTheDocument();
  });
});
