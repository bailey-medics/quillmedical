/**
 * SendFeedbackNavLink Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import SendFeedbackNavLink from "./SendFeedbackNavLink";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn().mockResolvedValue({ id: 1 }) },
}));

describe("SendFeedbackNavLink", () => {
  it("shows the label", () => {
    renderWithRouter(<SendFeedbackNavLink />);

    expect(screen.getByText("Feedback")).toBeInTheDocument();
  });

  it("shows the icon by default", () => {
    const { container } = renderWithRouter(<SendFeedbackNavLink />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("hides the icon when asked", () => {
    const { container } = renderWithRouter(
      <SendFeedbackNavLink showIcons={false} />,
    );

    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("opens the feedback modal rather than navigating", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SendFeedbackNavLink />);

    await user.click(screen.getByText("Feedback"));

    expect(
      await screen.findByText("Do not include patient details."),
    ).toBeInTheDocument();
  });

  it("closes the modal from Cancel", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SendFeedbackNavLink />);

    await user.click(screen.getByText("Feedback"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Do not include patient details."),
    ).not.toBeInTheDocument();
  });

  it("closes the drawer when the modal's link to previous feedback is followed", async () => {
    // On a narrow screen `onNavigate` closes the navigation drawer, which
    // otherwise stayed open over the feedback page.
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithRouter(<SendFeedbackNavLink onNavigate={onNavigate} />);

    await user.click(screen.getByText("Feedback"));
    await user.click(
      await screen.findByRole("link", { name: "Your previous feedback" }),
    );

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("Do not include patient details."),
    ).not.toBeInTheDocument();
  });

  it("does not close the drawer just to open the modal", async () => {
    // Closing it unmounts the drawer's contents, modal included.
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithRouter(<SendFeedbackNavLink onNavigate={onNavigate} />);

    await user.click(screen.getByText("Feedback"));

    expect(
      await screen.findByText("Do not include patient details."),
    ).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("hangs Your feedback beneath it on the sender's feedback page", () => {
    renderWithRouter(<SendFeedbackNavLink />, { initialRoute: "/feedback" });

    const child = screen.getByText("Your feedback");
    expect(child.closest("a, button")?.getAttribute("data-active")).toBe(
      "true",
    );
  });

  it("shows no child anywhere else", () => {
    renderWithRouter(<SendFeedbackNavLink />, { initialRoute: "/teaching" });

    expect(screen.queryByText("Your feedback")).not.toBeInTheDocument();
  });
});
