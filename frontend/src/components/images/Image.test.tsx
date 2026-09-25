import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import Image from "./Image";

describe("Image", () => {
  it("gives a meaningful image its alt text", () => {
    const { container } = renderWithMantine(
      <Image src="/scan.png" alt="Chest X-ray, anterior view" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "Chest X-ray, anterior view");
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("hides a decorative image from assistive technology", () => {
    const { container } = renderWithMantine(<Image src="/swirl.png" alt="" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back when there is no source", () => {
    const { container } = renderWithMantine(
      <Image alt="Logo" fallback="/fallback.png" />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/fallback.png",
    );
  });
});
