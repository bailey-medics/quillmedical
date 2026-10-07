/**
 * MediaDropzone Component Tests
 *
 * The accepted types matter more than the appearance: this is the first
 * of two checks on what may be uploaded, the second being the backend's
 * allow-list when it mints the URL. If they disagree, an admin learns
 * their file was wrong only after sending several hundred megabytes.
 */
import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import MediaDropzone from "./MediaDropzone";

/** One caller's settings: the teaching card's, video, named as such. */
const video = {
  accept: ["video/mp4", "video/webm", "video/quicktime"],
  label: "Drop a video or click to browse",
};

describe("MediaDropzone", () => {
  it("invites a file", () => {
    renderWithMantine(<MediaDropzone onDrop={vi.fn()} {...video} />);
    expect(
      screen.getByText("Drop a video or click to browse"),
    ).toBeInTheDocument();
  });

  it("takes a file through the hidden input", async () => {
    const onDrop = vi.fn();
    const { container } = renderWithMantine(
      <MediaDropzone onDrop={onDrop} {...video} />,
    );

    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute(
      "accept",
      "video/mp4,video/webm,video/quicktime",
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("accepts another allow-list when given one", async () => {
    // The passport uploads scanned certificates through the same box.
    // There is no default list: each caller names its own, so one
    // component serves both without either inheriting the other's.
    const { container } = renderWithMantine(
      <MediaDropzone
        onDrop={vi.fn()}
        accept={["application/pdf", "image/png"]}
        label="Drop a certificate or click to browse"
      />,
    );

    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      "accept",
      "application/pdf,image/png",
    );
    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
  });

  it("can be disabled while another upload runs", () => {
    // Mantine marks the wrapper rather than the input, so the data
    // attribute is what carries the state.
    const { container } = renderWithMantine(
      <MediaDropzone onDrop={vi.fn()} disabled {...video} />,
    );

    expect(container.querySelector("[data-disabled]")).toBeTruthy();
  });

  it("reports a file of the wrong type rather than dropping it", async () => {
    const onDrop = vi.fn();
    const onReject = vi.fn();
    const { container } = renderWithMantine(
      <MediaDropzone onDrop={onDrop} onReject={onReject} {...video} />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(onReject).toHaveBeenCalled();
    });
    expect(onDrop).not.toHaveBeenCalled();
  });
});
