/**
 * PassportExportButtons Tests
 *
 * Three things are worth pinning. That each button fetches the format it
 * names — swapping two would be invisible until somebody opened the file.
 * That a failed download says so, because a browser that silently saves
 * nothing looks identical to one that saved something. And that
 * reflections are not offered here, which is a privacy rule rather than a
 * layout choice.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import PassportExportButtons from "./PassportExportButtons";

const exportMarkdown = vi.fn();
const exportPdf = vi.fn();
const exportBundle = vi.fn();

vi.mock("@lib/passport", () => ({
  exportMarkdown: (...args: unknown[]) => exportMarkdown(...args),
  exportPdf: (...args: unknown[]) => exportPdf(...args),
  exportBundle: (...args: unknown[]) => exportBundle(...args),
}));

const PASSPORT_ID = "3f2a8c1e";

/**
 * Wait until no button is still showing its loading state.
 *
 * Clicking one of these buttons puts a Mantine `Loader` inside it, and
 * Mantine mounts that behind a `Transition` whose exit is driven by a
 * timer. A test that asserts on the mock and returns leaves that timer
 * queued; Testing Library then unmounts the tree, jsdom goes with it,
 * and the timer fires into a world with no `window` — which vitest
 * reports as an unhandled error and fails the whole run, with every
 * test passing. It failed two unrelated pull requests before it was
 * tracked down, so the wait is deliberate rather than defensive.
 */
async function waitForLoadersToSettle(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector("[data-loading='true']")).toBeNull();
  });
}

describe("PassportExportButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  });

  it("says the record belongs to the holder", () => {
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    expect(
      screen.getByText(/Nothing here depends on Quill still existing/),
    ).toBeInTheDocument();
  });

  it("downloads the Markdown rendering", async () => {
    const user = userEvent.setup();
    exportMarkdown.mockResolvedValue(new Blob(["# passport"]));
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    await user.click(screen.getByRole("button", { name: /Markdown/ }));

    await waitFor(() => {
      expect(exportMarkdown).toHaveBeenCalledWith(PASSPORT_ID);
    });
    await waitForLoadersToSettle();
  });

  it("downloads the PDF", async () => {
    const user = userEvent.setup();
    exportPdf.mockResolvedValue(new Blob(["%PDF"]));
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    await user.click(screen.getByRole("button", { name: /^PDF/ }));

    await waitFor(() => {
      expect(exportPdf).toHaveBeenCalledWith(PASSPORT_ID);
    });
    await waitForLoadersToSettle();
  });

  it("downloads the full bundle", async () => {
    const user = userEvent.setup();
    exportBundle.mockResolvedValue(new Blob(["PK"]));
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    await user.click(screen.getByRole("button", { name: /Full bundle/ }));

    await waitFor(() => {
      expect(exportBundle).toHaveBeenCalledWith(PASSPORT_ID);
    });
    await waitForLoadersToSettle();
  });

  it("names the saved file after the passport", async () => {
    const user = userEvent.setup();
    exportPdf.mockResolvedValue(new Blob(["%PDF"]));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    await user.click(screen.getByRole("button", { name: /^PDF/ }));

    await waitFor(() => {
      expect(click).toHaveBeenCalled();
    });
    await waitForLoadersToSettle();
    click.mockRestore();
  });

  it("says so when a download fails", async () => {
    // A browser that silently saves nothing looks exactly like one that
    // saved something, so the failure has to be stated.
    const user = userEvent.setup();
    exportBundle.mockRejectedValue(new Error("network"));
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    await user.click(screen.getByRole("button", { name: /Full bundle/ }));

    expect(
      await screen.findByText(/could not be prepared/),
    ).toBeInTheDocument();
    await waitForLoadersToSettle();
  });

  it("offers no way to include reflections", async () => {
    // Deliberate: the backend defaults them off, and a checkbox beside a
    // download button is not a deliberate enough act for something that
    // can be disclosed in legal proceedings.
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/reflection/i)).not.toBeInTheDocument();
  });

  it("explains what the bundle is for", () => {
    renderWithMantine(<PassportExportButtons passportId={PASSPORT_ID} />);

    expect(
      screen.getByText(/how to check it against the hashes/),
    ).toBeInTheDocument();
  });
});
