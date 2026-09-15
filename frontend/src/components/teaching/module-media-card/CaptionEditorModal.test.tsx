import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CaptionEditorModal from "./CaptionEditorModal";

const VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nThe caecum is entered";

describe("CaptionEditorModal", () => {
  it("shows the loaded captions for editing", () => {
    const { getByLabelText } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={vi.fn()}
        webvtt={VTT}
        onSave={vi.fn()}
      />,
    );

    expect(getByLabelText("WebVTT captions")).toHaveValue(VTT);
  });

  it("names the file so the admin knows which video", () => {
    const { getByText } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={vi.fn()}
        filename="lecture-01.mp4"
        webvtt={VTT}
        onSave={vi.fn()}
      />,
    );

    expect(getByText("lecture-01.mp4")).toBeInTheDocument();
  });

  it("says when the caption job has not run", () => {
    // Distinct from an empty file: a blank box with no explanation
    // invites the admin to save nothing over nothing.
    const { getByText } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={vi.fn()}
        webvtt={null}
        onSave={vi.fn()}
      />,
    );

    expect(getByText("No captions yet")).toBeInTheDocument();
  });

  it("saves the edited text", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    const { getByLabelText, getByRole } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={vi.fn()}
        webvtt="WEBVTT"
        onSave={onSave}
      />,
    );

    await user.type(getByLabelText("WebVTT captions"), "\n\nmore");
    await user.click(getByRole("button", { name: "Save captions" }));

    expect(onSave).toHaveBeenCalledWith("WEBVTT\n\nmore");
  });

  it("closes once the save succeeds", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { getByRole } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={onClose}
        webvtt={VTT}
        onSave={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(getByRole("button", { name: "Save captions" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the save fails", async () => {
    // Closing on failure would look exactly like success, and the
    // admin's corrections would be gone.
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { getByRole } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={onClose}
        webvtt={VTT}
        onSave={vi.fn().mockResolvedValue(false)}
      />,
    );

    await user.click(getByRole("button", { name: "Save captions" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows what went wrong", () => {
    const { getByText } = renderWithMantine(
      <CaptionEditorModal
        opened
        onClose={vi.fn()}
        webvtt={VTT}
        onSave={vi.fn()}
        error="Captions must be WebVTT, beginning with the line WEBVTT"
      />,
    );

    expect(
      getByText("Captions must be WebVTT, beginning with the line WEBVTT"),
    ).toBeInTheDocument();
  });
});
