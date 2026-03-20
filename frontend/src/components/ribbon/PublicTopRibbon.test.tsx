import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import PublicTopRibbon from "./PublicTopRibbon";

describe("PublicTopRibbon Component", () => {
  describe("Wide mode (default)", () => {
    it("renders with dark navy background", () => {
      const { container } = renderWithMantine(
        <PublicTopRibbon onBurgerClick={vi.fn()} />,
      );
      const ribbon = container.firstChild as HTMLElement;
      expect(ribbon).toBeInTheDocument();
    });

    it("renders QuillName logo", () => {
      const { container } = renderWithMantine(
        <PublicTopRibbon onBurgerClick={vi.fn()} />,
      );
      const img = container.querySelector('img[alt="Quill Medical"]');
      expect(img).toBeInTheDocument();
    });

    it("renders white-amber logo image", () => {
      const { container } = renderWithMantine(
        <PublicTopRibbon onBurgerClick={vi.fn()} />,
      );
      const img = container.querySelector(
        'img[alt="Quill Medical"]',
      ) as HTMLImageElement;
      expect(img.src).toContain("quill-name-long-white-amber.png");
    });

    it("renders logo as anchor linking to home", () => {
      const { container } = renderWithMantine(
        <PublicTopRibbon onBurgerClick={vi.fn()} />,
      );
      const anchor = container.querySelector("a[href='/']");
      expect(anchor).toBeInTheDocument();
    });

    it("does not render burger button", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("Narrow mode", () => {
    it("renders burger button", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} isNarrow />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("calls onBurgerClick when burger is clicked", async () => {
      const user = userEvent.setup();
      const onBurgerClick = vi.fn();
      renderWithMantine(
        <PublicTopRibbon onBurgerClick={onBurgerClick} isNarrow />,
      );
      await user.click(screen.getByRole("button"));
      expect(onBurgerClick).toHaveBeenCalledOnce();
    });

    it("does not render QuillName logo", () => {
      const { container } = renderWithMantine(
        <PublicTopRibbon onBurgerClick={vi.fn()} isNarrow />,
      );
      const img = container.querySelector('img[alt="Quill Medical"]');
      expect(img).not.toBeInTheDocument();
    });
  });
});
