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
  original_filename: "Echocardiogram_overview.mp4",
  content_type: "video/mp4",
  size_bytes: 943718400,
  uploaded_at: "2026-09-02T09:14:00Z",
};

const orphan: MediaAsset = {
  asset_id: "z9y8x7",
  original_filename: "Echocardiogram_old_intro_take2.mov",
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
    expect(screen.getByText("Echocardiogram_overview.mp4")).toBeInTheDocument();
  });

  it("does not show the file size", () => {
    // It cannot be acted on, it does not tell two videos apart the way
    // the name does, and it competed with the status line beneath it.
    // Size still appears where it decides something: the message
    // refusing a file too large to upload.
    renderWithMantine(<ModuleMediaCard media={complete} />);

    expect(screen.queryByText("900 MB")).toBeNull();
  });

  it("shows no warning when every reference is linked", () => {
    renderWithMantine(<ModuleMediaCard media={complete} />);

    expect(screen.queryByTestId("state-message")).toBeNull();
  });

  it("warns that an incomplete module is hidden from learners", () => {
    // The gate fails safe but would otherwise fail invisibly: this
    // line is the only org_unit an admin learns the module is hidden.
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

    expect(
      screen.getByText("Echocardiogram_old_intro_take2.mov"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not referenced")).toBeInTheDocument();
  });

  /** Open the row's actions menu, which is where delete now lives. */
  async function openActions(
    user: ReturnType<typeof userEvent.setup>,
    filename = lecture.original_filename,
  ) {
    await user.click(
      screen.getByRole("button", { name: `Actions for ${filename}` }),
    );
  }

  it("names the live organisations in the delete confirmation", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <ModuleMediaCard
        media={complete}
        liveOrganisations={["East of England ETA"]}
      />,
    );

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));

    expect(
      screen.getByText(/East of England ETA/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("deletes only once the admin confirms", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithMantine(<ModuleMediaCard media={complete} onDelete={onDelete} />);

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(onDelete).toHaveBeenCalledWith("a1b2c3");
  });

  it("offers editing captions only where there are captions", async () => {
    // A menu item that opens an editor for a track nobody has made is a
    // dead action, and the admin cannot tell that from the label.
    const user = userEvent.setup();
    const onEditCaptions = vi.fn();
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [
            { key: "lecture-01", asset: { ...lecture, has_captions: true } },
          ],
          unattached: [],
          is_complete: true,
        }}
        onEditCaptions={onEditCaptions}
      />,
    );

    await openActions(user);
    await user.click(screen.getByRole("menuitem", { name: /edit captions/i }));

    expect(onEditCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ asset_id: "a1b2c3" }),
    );
  });

  it("hides editing captions when there are none", async () => {
    const user = userEvent.setup();
    renderWithMantine(<ModuleMediaCard media={complete} />);

    await openActions(user);

    expect(
      screen.queryByRole("menuitem", { name: /edit captions/i }),
    ).toBeNull();
  });

  it("drops the bar once the captions are signed off", () => {
    // A full bar on a finished row reads as something still running,
    // and this is the row an admin sees for the rest of the video's
    // life. The line alone says the job is done.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [
            {
              key: "lecture-01",
              asset: {
                ...lecture,
                has_captions: true,
                captions_reviewed_at: "2026-09-16T11:20:00Z",
                progress: {
                  stage: 4,
                  total_stages: 4,
                  label: "Ready — captions checked",
                  in_progress: false,
                  stalled: false,
                },
              },
            },
          ],
          unattached: [],
          is_complete: true,
        }}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("4 of 4")).toBeNull();
    // The row is not left blank: the line stays, so the admin can
    // still see the video has captions and that someone read them.
    expect(screen.getByText("Ready — captions checked")).toBeInTheDocument();
  });

  it("says everything about a file in one column", () => {
    // The name, the size and what is happening to it all sit together,
    // so there is nothing to read across to. Caption state is part of
    // that story rather than a column of its own: the progress line
    // already says whether a track needs checking or has been checked.
    renderWithMantine(<ModuleMediaCard media={complete} />);

    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);

    expect(headers).toContain("File");
    expect(headers).not.toContain("Captions");
    expect(headers).not.toContain("Progress");
  });

  it("puts the bar under the file it is working on", () => {
    // Reading across from a filename in one column to a bar in another
    // is work the admin should not have to do.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [
            {
              key: "lecture-01",
              asset: {
                ...lecture,
                progress: {
                  stage: 1,
                  total_stages: 4,
                  label: "Preparing the video",
                  in_progress: true,
                  stalled: false,
                },
              },
            },
          ],
          unattached: [],
          is_complete: true,
        }}
      />,
    );

    const cell = screen.getByText(lecture.original_filename).closest("td");
    expect(cell).not.toBeNull();
    expect(
      within(cell as HTMLElement).getByRole("progressbar"),
    ).toBeInTheDocument();
    expect(
      within(cell as HTMLElement).getByText("Preparing the video"),
    ).toBeInTheDocument();
  });

  it("keeps the bar while the captions await checking", () => {
    // Stage 3 is not the end: nobody has read the machine output yet,
    // so there is still something outstanding to show.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [
            {
              key: "lecture-01",
              asset: {
                ...lecture,
                has_captions: true,
                captions_reviewed_at: null,
                progress: {
                  stage: 3,
                  total_stages: 4,
                  label: "Ready — captions need checking",
                  in_progress: false,
                  stalled: false,
                },
              },
            },
          ],
          unattached: [],
          is_complete: true,
        }}
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(
      screen.getByText("Ready — captions need checking"),
    ).toBeInTheDocument();
    // No "3 of 4": the stages are our own machinery, and the words
    // underneath already say what is happening.
    expect(screen.queryByText(/\d+ of \d+/)).toBeNull();
  });

  it("shows the upload as the first stage of one progress bar", async () => {
    // Before this the upload drew its own thin bar in the File column
    // and the processing stages a thick counted one elsewhere, so the
    // bar changed shape and jumped sideways partway through.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [{ key: "lecture-01", asset: null }],
          unattached: [],
          is_complete: false,
        }}
        uploadProgress={{ "lecture-01": 42 }}
        uploadNames={{ "lecture-01": "Echocardiogram_overview.mp4" }}
      />,
    );

    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ of \d+/)).toBeNull();
  });

  it("names the file while it is still uploading", async () => {
    // The row shows the same name throughout rather than renaming
    // itself from "Sending the file…" the moment the upload lands.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [{ key: "lecture-01", asset: null }],
          unattached: [],
          is_complete: false,
        }}
        uploadProgress={{ "lecture-01": 42 }}
        uploadNames={{ "lecture-01": "Echocardiogram_overview.mp4" }}
      />,
    );

    expect(screen.getByText("Echocardiogram_overview.mp4")).toBeInTheDocument();
    expect(screen.queryByText("Sending the file…")).toBeNull();
  });

  it("still says something when the name is unknown", async () => {
    // A caller giving progress without a name should not leave the row
    // blank where the file should be.
    renderWithMantine(
      <ModuleMediaCard
        media={{
          module_id: "mod-1",
          references: [{ key: "lecture-01", asset: null }],
          unattached: [],
          is_complete: false,
        }}
        uploadProgress={{ "lecture-01": 42 }}
      />,
    );

    expect(screen.getByText("Sending the file…")).toBeInTheDocument();
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

  it("offers no actions for a reference with nothing uploaded", () => {
    // There is nothing to delete or caption yet, so the row carries no
    // menu at all rather than an empty one.
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

    expect(screen.queryByRole("button", { name: /^actions for/i })).toBeNull();
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
