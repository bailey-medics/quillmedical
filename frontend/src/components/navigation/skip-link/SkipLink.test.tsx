import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { MAIN_CONTENT_ID, SkipLink, SkipLinkTarget } from "./SkipLink";

function Page() {
  return (
    <>
      <SkipLink />
      <nav>
        <a href="/one">One</a>
        <a href="/two">Two</a>
      </nav>
      <main>
        <SkipLinkTarget>
          <p>Page content</p>
        </SkipLinkTarget>
      </main>
    </>
  );
}

describe("SkipLink", () => {
  it("is the first thing the keyboard reaches", async () => {
    const user = userEvent.setup();
    renderWithMantine(<Page />);

    await user.tab();

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveFocus();
  });

  it("points at the main content", () => {
    renderWithMantine(<Page />);
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
  });

  it("moves focus past the navigation to the content", async () => {
    const user = userEvent.setup();
    renderWithMantine(<Page />);

    await user.tab();
    await user.keyboard("{Enter}");

    const target = screen.getByText("Page content").parentElement;
    expect(target).toHaveAttribute("id", MAIN_CONTENT_ID);
    expect(target).toHaveFocus();
  });

  it("adds no tab stop of its own at the target", async () => {
    const user = userEvent.setup();
    renderWithMantine(<Page />);

    await user.tab(); // skip link
    await user.tab(); // One
    await user.tab(); // Two
    await user.tab(); // nothing left: back to the body

    expect(document.getElementById(MAIN_CONTENT_ID)).not.toHaveFocus();
    expect(document.getElementById(MAIN_CONTENT_ID)).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("does nothing harmful when a page has no target", async () => {
    const user = userEvent.setup();
    renderWithMantine(<SkipLink />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toBeInTheDocument();
  });
});
