import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import PublicTopRibbon from "./PublicTopRibbon";
import publicNavLinks, { LOGIN_URL } from "./publicNavLinks";

describe("PublicTopRibbon Component", () => {
  describe("Log in", () => {
    it("offers a log in link pointing at the application", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const login = screen.getByRole("link", { name: "Log in" });
      expect(login).toHaveAttribute("href", LOGIN_URL);
    });

    it("keeps log in out of the nav links", () => {
      // It is an action that leaves the public site, not a page of it, so
      // it sits outside the nav group and hard right.
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const nav = screen.getByRole("navigation");
      expect(nav).not.toHaveTextContent("Log in");
    });

    it("does not offer the retired Teaching link", () => {
      // Teaching became the log in link when app.quill-medical.com started
      // serving it.
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      expect(screen.queryByText("Teaching")).not.toBeInTheDocument();
    });

    it("links EPR to the clinical records page as a live link", () => {
      // EPR was once a disabled placeholder; it now goes to the page that
      // says the clinical record is in development.
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      expect(screen.getByRole("link", { name: "EPR" })).toHaveAttribute(
        "href",
        "/clinical-records",
      );
    });
  });

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

    it("renders all nav links", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      for (const link of publicNavLinks) {
        expect(screen.getByText(link.label)).toBeInTheDocument();
      }
    });

    it("leads with the learning and assessment pages", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const nav = screen.getByRole("navigation");
      const hrefs = Array.from(nav.querySelectorAll("a")).map((anchor) =>
        anchor.getAttribute("href"),
      );
      expect(hrefs).toEqual([
        "/learning",
        "/assessments",
        "/for-educators",
        "/clinical-records",
        "/contact",
      ]);
    });

    it("renders enabled nav links with correct href values", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const enabledLinks = publicNavLinks.filter((link) => !link.disabled);
      for (const link of enabledLinks) {
        const anchor = screen.getByText(link.label).closest("a");
        expect(anchor).toHaveAttribute("href", link.href);
      }
    });

    it("renders disabled nav links as non-interactive elements", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const disabledLinks = publicNavLinks.filter((link) => link.disabled);
      for (const link of disabledLinks) {
        const element = screen.getByText(link.label);
        expect(element.closest("a")).not.toBeInTheDocument();
      }
    });

    it("does not open enabled links in new tab", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} />);
      const enabledLinks = publicNavLinks.filter((link) => !link.disabled);
      for (const link of enabledLinks) {
        const anchor = screen.getByText(link.label).closest("a");
        expect(anchor).not.toHaveAttribute("target");
      }
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

    it("does not render nav links", () => {
      renderWithMantine(<PublicTopRibbon onBurgerClick={vi.fn()} isNarrow />);
      for (const link of publicNavLinks) {
        expect(screen.queryByText(link.label)).not.toBeInTheDocument();
      }
    });
  });
});
