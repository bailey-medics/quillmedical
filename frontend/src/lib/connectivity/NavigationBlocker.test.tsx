import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, Link } from "react-router-dom";

import { NavigationBlocker } from "./NavigationBlocker";

const mockTriggerOfflineModal = vi.fn();
let mockIsOnline = true;

vi.mock("./ConnectivityContext", () => ({
  useConnectivity: () => ({
    isOnline: mockIsOnline,
    triggerOfflineModal: mockTriggerOfflineModal,
  }),
}));

function TestApp() {
  return (
    <>
      <NavigationBlocker />
      <nav>
        <Link to="/">Home</Link>
        <Link to="/other">Other</Link>
      </nav>
    </>
  );
}

function renderWithRouter(initialPath = "/") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <TestApp />,
      },
      {
        path: "/other",
        element: <TestApp />,
      },
    ],
    { initialEntries: [initialPath] },
  );

  return render(<RouterProvider router={router} />);
}

describe("NavigationBlocker", () => {
  beforeEach(() => {
    mockIsOnline = true;
    mockTriggerOfflineModal.mockClear();
  });

  it("allows navigation when online", async () => {
    mockIsOnline = true;
    renderWithRouter("/");

    await userEvent.click(screen.getByText("Other"));
    expect(mockTriggerOfflineModal).not.toHaveBeenCalled();
  });

  it("blocks navigation and triggers modal when offline", async () => {
    mockIsOnline = false;
    renderWithRouter("/");

    await userEvent.click(screen.getByText("Other"));
    expect(mockTriggerOfflineModal).toHaveBeenCalledTimes(1);
  });
});
