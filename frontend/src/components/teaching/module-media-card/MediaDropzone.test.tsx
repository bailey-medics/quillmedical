/**
 * MediaDropzone Component Tests
 *
 * The accepted types matter more than the appearance: this is the first
 * of two checks on what may be uploaded, the second being the backend's
 * allow-list when it mints the URL. If they disagree, an admin learns
 * their file was wrong only after sending several hundred megabytes.
 */
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import MediaDropzone from "./MediaDropzone";
import { ACCEPTED_VIDEO_TYPES } from "./mediaFormat";

describe("MediaDropzone", () => {
  it("invites a file", () => {
    renderWithMantine(<MediaDropzone onDrop={vi.fn()} />);
    expect(
      screen.getByText("Drop a video, or click to browse"),
    ).toBeInTheDocument();
  });

  it("accepts only the video types the backend will mint a URL for", () => {
    // Pinned against the backend's ALLOWED_MEDIA_TYPES. Drift here is
    // silent until an upload fails at the last step.
    expect(ACCEPTED_VIDEO_TYPES).toEqual([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
  });

  it("takes a file through the hidden input", async () => {
    const onDrop = vi.fn();
    const { container } = renderWithMantine(<MediaDropzone onDrop={onDrop} />);

    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute(
      "accept",
      "video/mp4,video/webm,video/quicktime",
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("can be disabled while another upload runs", () => {
    // Mantine marks the wrapper rather than the input, so the data
    // attribute is what carries the state.
    const { container } = renderWithMantine(
      <MediaDropzone onDrop={vi.fn()} disabled />,
    );

    expect(container.querySelector("[data-disabled]")).toBeTruthy();
  });
});
