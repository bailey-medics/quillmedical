import { describe, expect, it } from "vitest";
import { ACCEPTED_VIDEO_TYPES } from "./mediaFormat";

describe("ACCEPTED_VIDEO_TYPES", () => {
  it("is only the video types the backend will mint a URL for", () => {
    // Pinned against the backend's ALLOWED_MEDIA_TYPES. Drift here is
    // silent until an upload fails at the last step.
    expect(ACCEPTED_VIDEO_TYPES).toEqual([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
  });
});
