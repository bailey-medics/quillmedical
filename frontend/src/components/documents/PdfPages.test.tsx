import { renderWithMantine } from "@test/test-utils";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PdfPages from "./PdfPages";

// jsdom cannot draw a canvas, and pdf.js will not load in it, so pdf.js
// is replaced whole. What is tested is what this component asks of it.
const { getDocument, blob } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  blob: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("@/lib/api", () => ({ api: { blob } }));

interface FakePdf {
  render: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

/**
 * A document of `pages` pages, each 600 by 800 points. `draw` gives what
 * a page's draw resolves to: left pending, a page stays mid-draw. It is
 * a function so a rejection is only made once something is waiting on it.
 */
function fakePdf(
  pages: number,
  draw: () => Promise<void> = () => Promise.resolve(),
): FakePdf {
  const cancel = vi.fn();
  const render = vi.fn(() => ({ promise: draw(), cancel }));
  const destroy = vi.fn(async () => {});
  const pdf = {
    numPages: pages,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render,
    })),
  };
  getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
  return { render, cancel, destroy };
}

/** Makes every observed page count as near the screen straight away. */
function everyPageNearTheScreen() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
}

describe("PdfPages", () => {
  const props = { name: "Test letter", url: "/files/test.pdf" };

  beforeEach(() => {
    getDocument.mockReset();
    blob.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says the file is loading until it has opened", async () => {
    getDocument.mockReturnValue({
      promise: new Promise(() => {}),
      destroy: vi.fn(async () => {}),
    });

    renderWithMantine(<PdfPages {...props} />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading Test letter",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows a document of one page", async () => {
    fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    expect(
      await screen.findByRole("img", { name: "Page 1 of 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows every page of a longer document, each labelled", async () => {
    fakePdf(3);

    renderWithMantine(<PdfPages {...props} />);

    expect(
      await screen.findByRole("img", { name: "Page 1 of 3" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Page 2 of 3" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Page 3 of 3" })).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("holds each page's shape before it is drawn", async () => {
    fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    const page = await screen.findByRole("img", { name: "Page 1 of 1" });
    expect(page).toHaveAttribute("width", "600");
    expect(page).toHaveAttribute("height", "800");
  });

  it("does not draw a page that is nowhere near the screen", async () => {
    // The observer in the test setup never reports anything.
    const { render } = fakePdf(3);

    renderWithMantine(<PdfPages {...props} />);

    await screen.findByRole("img", { name: "Page 3 of 3" });
    expect(render).not.toHaveBeenCalled();
  });

  it("draws each page as it nears the screen", async () => {
    everyPageNearTheScreen();
    const { render } = fakePdf(3);

    renderWithMantine(<PdfPages {...props} />);

    await waitFor(() => expect(render).toHaveBeenCalledTimes(3));
    const page = screen.getByRole("img", { name: "Page 1 of 3" });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: page }),
    );
  });

  it("draws more pixels on a sharper screen, up to twice", async () => {
    everyPageNearTheScreen();
    vi.stubGlobal("devicePixelRatio", 3);
    const { render } = fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    await waitFor(() => expect(render).toHaveBeenCalled());
    const page = screen.getByRole("img", { name: "Page 1 of 1" });
    expect(page).toHaveAttribute("width", "1200");
    expect(page).toHaveAttribute("height", "1600");
  });

  it("says so when one page cannot be drawn", async () => {
    everyPageNearTheScreen();
    fakePdf(1, () => Promise.reject(new Error("bad page")));

    renderWithMantine(<PdfPages {...props} />);

    expect(
      await screen.findByText("Page 1 could not be shown."),
    ).toBeInTheDocument();
  });

  it("fetches a file from the API through the client", async () => {
    fakePdf(1);
    blob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));

    renderWithMantine(
      <PdfPages name="Certificate" url="/api/passport/p1/attachments/abc" />,
    );

    await screen.findByRole("img", { name: "Page 1 of 1" });
    expect(blob).toHaveBeenCalledWith("/passport/p1/attachments/abc");
    const options = getDocument.mock.calls[0][0];
    expect(Array.from(options.data)).toEqual([1, 2, 3]);
    expect(options.url).toBeUndefined();
  });

  it("leaves a file from anywhere else to pdf.js", async () => {
    fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    await screen.findByRole("img", { name: "Page 1 of 1" });
    expect(blob).not.toHaveBeenCalled();
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/files/test.pdf" }),
    );
  });

  it("uses the plain JavaScript decoders, which the policy allows", async () => {
    fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    await screen.findByRole("img", { name: "Page 1 of 1" });
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ useWasm: false, wasmUrl: "/pdfjs/" }),
    );
  });

  it("shows an error when the file cannot be fetched", async () => {
    blob.mockRejectedValue(new Error("HTTP 500"));

    renderWithMantine(<PdfPages name="Certificate" url="/api/files/abc" />);

    expect(
      await screen.findByText("This file could not be shown"),
    ).toBeInTheDocument();
    expect(getDocument).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an error when pdf.js cannot read the file", async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("Invalid PDF structure")),
      destroy: vi.fn(async () => {}),
    });

    renderWithMantine(<PdfPages {...props} />);

    expect(
      await screen.findByText("This file could not be shown"),
    ).toBeInTheDocument();
    // What pdf.js said is never put on screen.
    expect(screen.queryByText(/Invalid PDF/)).not.toBeInTheDocument();
  });

  it("opens the file itself from the button above the pages", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fakePdf(1);

    renderWithMantine(<PdfPages {...props} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Open file: Test letter" }),
    );
    expect(open).toHaveBeenCalledWith(
      "/files/test.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens the file itself from the error, when it cannot be shown", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("unreadable")),
      destroy: vi.fn(async () => {}),
    });

    renderWithMantine(<PdfPages {...props} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Open file" }),
    );
    expect(open).toHaveBeenCalledWith(
      "/files/test.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("stops a page mid-draw and frees the document on unmount", async () => {
    everyPageNearTheScreen();
    const { render, cancel, destroy } = fakePdf(1, () => new Promise(() => {}));

    const { unmount } = renderWithMantine(<PdfPages {...props} />);
    await waitFor(() => expect(render).toHaveBeenCalled());

    unmount();

    expect(cancel).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it("frees a document that finishes opening after unmount", async () => {
    const destroy = vi.fn(async () => {});
    let deliver: (value: Blob) => void = () => {};
    blob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        deliver = resolve;
      }),
    );
    getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy });

    const { unmount } = renderWithMantine(
      <PdfPages name="Certificate" url="/api/files/abc" />,
    );
    unmount();
    deliver(new Blob([new Uint8Array([1])]));

    await waitFor(() => expect(destroy).toHaveBeenCalled());
  });
});
