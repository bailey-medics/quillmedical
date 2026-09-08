/**
 * Settings page — the page-view opt-out
 *
 * Covers the toggle only. The rest of Settings — notifications, two-factor,
 * dark mode — is untested here and was before this change too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
import Settings from "./Settings";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), get: vi.fn() } }));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { username: "testuser", clinical_services_enabled: false },
    },
  }),
}));

describe("the page-view opt-out", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* nothing stored */
    }
  });

  it("is on by default, since this is an opt-out", async () => {
    renderWithRouter(<Settings />);

    const toggle = screen.getByRole("switch", { name: /help improve quill/i });
    expect(toggle).toBeChecked();
  });

  it("records the opt-out when switched off", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(
      screen.getByRole("switch", { name: /help improve quill/i }),
    );

    expect(hasOptedOut()).toBe(true);
  });

  it("reads as off when the user has already opted out", () => {
    // The preference is stored, so it survives a reload — which is the point
    // of storing it, and the difference from the session identifier.
    setOptedOut(true);

    renderWithRouter(<Settings />);

    expect(
      screen.getByRole("switch", { name: /help improve quill/i }),
    ).not.toBeChecked();
  });

  it("can be turned back on", async () => {
    const user = userEvent.setup();
    setOptedOut(true);
    renderWithRouter(<Settings />);

    await user.click(
      screen.getByRole("switch", { name: /help improve quill/i }),
    );

    expect(hasOptedOut()).toBe(false);
  });

  it("says that patient pages are never counted", () => {
    // The claim the guard in usePageViewTracking actually enforces. If one
    // changes without the other, this is where it shows.
    renderWithRouter(<Settings />);

    expect(
      screen.getByText(/patient pages are never counted/i),
    ).toBeInTheDocument();
  });
});
