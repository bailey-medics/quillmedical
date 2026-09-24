import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PublicLayout from "./PublicLayout";
import publicNavLinks, { LOGIN_URL } from "@/components/ribbon/publicNavLinks";

describe("PublicLayout", () => {
  it("renders children content", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Page content</p>
      </PublicLayout>,
    );
    expect(getByText("Page content")).toBeInTheDocument();
  });

  it("renders the PublicTopRibbon in the header", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
  });

  it("renders the Quill Medical logo in the ribbon", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const logo = container.querySelector('img[alt="Quill Medical"]');
    expect(logo).toBeInTheDocument();
  });

  it("renders the PublicFooter with copyright text", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const year = new Date().getFullYear();
    expect(
      getByText(`© ${year} Quill Medical. All rights reserved.`),
    ).toBeInTheDocument();
  });

  it("has header, main, and footer semantic elements", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    expect(container.querySelector("header")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeInTheDocument();
  });

  describe("Navigation drawer", () => {
    it("renders a navigation drawer that is closed by default", () => {
      renderWithMantine(
        <PublicLayout>
          <p>Content</p>
        </PublicLayout>,
      );
      const drawer = screen.getByRole("dialog", { hidden: true });
      expect(drawer).toHaveStyle({ transform: "translateX(-100%)" });
    });

    it("renders all public nav links inside the drawer", () => {
      renderWithMantine(
        <PublicLayout>
          <p>Content</p>
        </PublicLayout>,
      );
      const nav = screen.getByRole("navigation", { name: "Primary" });
      const enabledLinks = publicNavLinks.filter((link) => !link.disabled);
      for (const link of enabledLinks) {
        const anchor = nav.querySelector(`a[href="${link.href}"]`);
        expect(anchor).toBeInTheDocument();
        expect(anchor).toHaveTextContent(link.label);
      }
      // Disabled links should still render as text within the nav
      const disabledLinks = publicNavLinks.filter((link) => link.disabled);
      for (const link of disabledLinks) {
        const within = nav.querySelectorAll(`[class*="NavLink"]`);
        const found = Array.from(within).some((el) =>
          el.textContent?.includes(link.label),
        );
        expect(found).toBe(true);
      }
    });

    it("offers a log in link, which the ribbon's own does not cover", () => {
      // The ribbon renders "Log in" in wide mode only, so on a narrow
      // viewport the drawer is the only way to reach the application.
      renderWithMantine(
        <PublicLayout>
          <p>Content</p>
        </PublicLayout>,
      );
      const nav = screen.getByRole("navigation", { name: "Primary" });
      const login = nav.querySelector(`a[href="${LOGIN_URL}"]`);
      expect(login).toBeInTheDocument();
      expect(login).toHaveTextContent("Log in");
    });

    it("renders nav icons for each link", () => {
      renderWithMantine(
        <PublicLayout>
          <p>Content</p>
        </PublicLayout>,
      );
      const nav = screen.getByRole("navigation", { name: "Primary" });
      const icons = nav.querySelectorAll("svg");
      // The links, plus Home and Log in, neither of which is in the list:
      // Home is the site root, and Log in leaves the site for the app.
      expect(icons.length).toBe(publicNavLinks.length + 2);
    });

    it("opens the drawer when burger is clicked", async () => {
      const user = userEvent.setup();
      Object.defineProperty(window, "innerWidth", { value: 400 });
      window.matchMedia = (query: string) =>
        ({
          matches: query.includes("max-width"),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList;

      renderWithMantine(
        <PublicLayout>
          <p>Content</p>
        </PublicLayout>,
      );

      const burger = screen.getByRole("button", {
        name: "Open navigation",
      });
      await user.click(burger);

      const drawer = screen.getByRole("dialog");
      expect(drawer).toHaveStyle({ transform: "translateX(0)" });
    });
  });

  it("offers a skip link that lands inside main", () => {
    renderWithMantine(
      <PublicLayout>
        <p>Page body</p>
      </PublicLayout>,
    );

    const link = screen.getByRole("link", { name: "Skip to main content" });
    const target = document.getElementById("main-content");
    expect(link).toHaveAttribute("href", "#main-content");
    expect(target).toHaveTextContent("Page body");
    expect(target?.closest("main")).not.toBeNull();
  });
});
