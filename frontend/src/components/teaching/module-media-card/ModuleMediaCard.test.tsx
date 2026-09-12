/**
 * ModuleMediaCard Component Tests
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import ModuleMediaCard from "./ModuleMediaCard";
import { formatSize } from "./mediaFormat";
import type { MediaAsset, ModuleMedia } from "@/features/teaching/types";

const lecture: MediaAsset = {
  asset_id: "a1b2c3",
  original_filename: "EoEETA_Colonoscopy_FINAL_v3.mp4",
  content_type: "video/mp4",
  size_bytes: 943718400,
  uploaded_at: "2026-09-02T09:14:00Z",
};

const orphan: MediaAsset = {
  asset_id: "z9y8x7",
  original_filename: "old_intro_take2.mov",
  content_type: "video/quicktime",
  size_bytes: 88080384,
  uploaded_at: "2026-08-19T16:40:00Z",
};

const complete: ModuleMedia = {
  module_id: "mod-1",
  references: [{ key: "lecture-01", asset: lecture }],
  unattached: [],
  is_complete: true,
};

const incomplete: ModuleMedia = {
  module_id: "mod-1",
  references: [
    { key: "lecture-01", asset: lecture },
    { key: "debrief", asset: null },
  ],
  unattached: [],
  is_complete: false,
};

describe("ModuleMediaCard", () => {
  it("lists a reference with its uploaded file", () => {
    renderWithMantine(<ModuleMediaCard media={complete} />);

    expect(screen.getByText("lecture-01")).toBeInTheDocument();
    expect(
      screen.getByText("EoEETA_Colonoscopy_FINAL_v3.mp4"),
    ).toBeInTheDocument();
  });

  it("shows no warning when every reference is linked", () => {
    renderWithMantine(<ModuleMediaCard media={complete} />);

    expect(screen.queryByTestId("state-message")).toBeNull();
  });

  it("warns that an incomplete module is hidden from learners", () => {
    // The gate fails safe but would otherwise fail invisibly: this
    // line is the only place an admin learns the module is hidden.
    renderWithMantine(<ModuleMediaCard media={incomplete} />);

    expect(screen.getByText("1 video is missing")).toBeInTheDocument();
    expect(
      screen.getByText(/will not be available to learners/),
    ).toBeInTheDocument();
  });

  it("counts more than one missing video", () => {
    const twoMissing: ModuleMedia = {
      module_id: "mod-1",
      references: [
        { key: "lecture-01", asset: null },
        { key: "debrief", asset: null },
      ],
      unattached: [],
      is_complete: false,
    };
    renderWithMantine(<ModuleMediaCard media={twoMissing} />);

    expect(screen.getByText("2 videos are missing")).toBeInTheDocument();
  });

  it("lists an upload that matches no reference", () => {
    renderWithMantine(
      <ModuleMediaCard media={{ ...complete, unattached: [orphan] }} />,
    );

    expect(screen.getByText("old_intro_take2.mov")).toBeInTheDocument();
    expect(screen.getByText("Not referenced")).toBeInTheDocument();
  });

  it("names the live organisations in the delete confirmation", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <ModuleMediaCard
        media={complete}
        liveOrganisations={["East of England ETA"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(
      screen.getByText(/East of England ETA/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("deletes only once the admin confirms", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithMantine(<ModuleMediaCard media={complete} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(onDelete).toHaveBeenCalledWith("a1b2c3");
  });

  it("shows what went wrong", () => {
    // An upload that fails silently is indistinguishable from a button
    // that does nothing — which is exactly how a 503 from an
    // unconfigured deployment presented before this.
    renderWithMantine(
      <ModuleMediaCard
        media={complete}
        error="Media upload is not configured"
      />,
    );

    expect(
      screen.getByText("Media upload is not configured"),
    ).toBeInTheDocument();
  });

  it("shows nothing when there is no error", () => {
    renderWithMantine(<ModuleMediaCard media={complete} />);

    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("shows an error and a missing-media warning together", () => {
    // They answer different questions — what is absent, and what just
    // failed — so one must not hide the other.
    renderWithMantine(
      <ModuleMediaCard media={incomplete} error="Upload failed" />,
    );

    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByText("1 video is missing")).toBeInTheDocument();
  });

  it("offers no delete for a reference with nothing uploaded", () => {
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [{ key: "debrief", asset: null }],
          unattached: [],
          is_complete: false,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });
});

describe("formatSize", () => {
  it.each([
    [512, "512 B"],
    [2048, "2.0 KB"],
    [943718400, "900 MB"],
    [5368709120, "5.0 GB"],
  ])("formats %i as %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});
