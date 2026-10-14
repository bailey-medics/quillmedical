import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PosterFrameModal from "./PosterFrameModal";

function renderModal(
  props: Partial<React.ComponentProps<typeof PosterFrameModal>> = {},
) {
  const onSave = vi.fn(async () => true);
  const onClose = vi.fn();
  const view = renderWithMantine(
    <PosterFrameModal opened onClose={onClose} onSave={onSave} {...props} />,
  );

  return { ...view, onSave, onClose };
}

describe("PosterFrameModal", () => {
  it("starts on the default when nobody has chosen", () => {
    const { getByLabelText, getByText } = renderModal({
      currentSeconds: null,
    });

    expect(getByLabelText("Time in the video")).toHaveValue("0:05");
    expect(getByText(/Now 0:05, the default/)).toBeInTheDocument();
  });

  it("starts on the time already chosen", () => {
    const { getByLabelText } = renderModal({ currentSeconds: 85 });

    expect(getByLabelText("Time in the video")).toHaveValue("1:25");
  });

  it("names the file so the admin knows which video", () => {
    const { getByText } = renderModal({ filename: "lecture-01.mp4" });

    expect(getByText("lecture-01.mp4")).toBeInTheDocument();
  });

  it("saves the time as seconds, read as the player shows it", async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, onSave, onClose } = renderModal();

    await user.clear(getByLabelText("Time in the video"));
    await user.type(getByLabelText("Time in the video"), "1:25");
    await user.click(getByRole("button", { name: "Save poster frame" }));

    expect(onSave).toHaveBeenCalledWith(85);
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses a time it cannot read, and says how to write one", async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, getByText, onSave } = renderModal();

    await user.clear(getByLabelText("Time in the video"));
    await user.type(getByLabelText("Time in the video"), "soon");
    await user.click(getByRole("button", { name: "Save poster frame" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(getByText("Enter a time such as 42 or 1:25")).toBeInTheDocument();
  });

  it("stays open when the save is refused", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => false);
    const { getByRole, onClose } = renderModal({ onSave });

    await user.click(getByRole("button", { name: "Save poster frame" }));

    expect(onSave).toHaveBeenCalledWith(5);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows why a save failed", () => {
    const { getByText } = renderModal({ error: "Still being prepared" });

    expect(getByText("Still being prepared")).toBeInTheDocument();
  });
});
