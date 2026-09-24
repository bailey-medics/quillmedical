import { describe, expect, it } from "vitest";
import { titleFrames, YOUTUBE_FRAME_TITLE } from "./titleFrames";

/** Let the MutationObserver's callback run. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("titleFrames", () => {
  it("titles an iframe that is already there", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.appendChild(document.createElement("iframe"));

    const stop = titleFrames(root, YOUTUBE_FRAME_TITLE);

    expect(root.querySelector("iframe")).toHaveAttribute(
      "title",
      "YouTube video player",
    );
    stop();
  });

  it("titles an iframe added later, as when the video changes", async () => {
    const root = document.createElement("div");
    const stop = titleFrames(root, "Player");

    root.appendChild(document.createElement("iframe"));
    await flush();

    expect(root.querySelector("iframe")).toHaveAttribute("title", "Player");
    stop();
  });

  it("leaves a frame that already has a title alone", () => {
    const root = document.createElement("div");
    const titled = document.createElement("iframe");
    titled.setAttribute("title", "Own title");
    root.appendChild(titled);

    const stop = titleFrames(root, "Player");

    expect(root.querySelector("iframe")).toHaveAttribute("title", "Own title");
    stop();
  });

  it("stops watching once stopped", async () => {
    const root = document.createElement("div");
    titleFrames(root, "Player")();

    root.appendChild(document.createElement("iframe"));
    await flush();

    expect(root.querySelector("iframe")).not.toHaveAttribute("title");
  });
});
