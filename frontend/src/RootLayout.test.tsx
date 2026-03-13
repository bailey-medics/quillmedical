/**
 * RootLayout Tests
 *
 * Verifies that patient context is cleared when navigating away from
 * patient-specific routes, so the ribbon does not show stale patient data.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  MemoryRouter,
  Routes,
  Route,
  useOutletContext,
  useNavigate,
} from "react-router-dom";
import { theme } from "@/theme";
import RootLayout from "@/RootLayout";
import type { LayoutCtx } from "@/RootLayout";

// Mock MainLayout to avoid rendering the full layout tree
vi.mock("./components/layouts/MainLayout", () => ({
  default: ({
    patient,
    children,
  }: {
    patient: { name: string } | null;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid="ribbon-patient">{patient?.name ?? ""}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: "1", username: "testuser", email: "test@example.com" },
      loading: false,
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  }),
}));

/**
 * Child component that sets patient via outlet context, simulating usePatientLoader.
 * Also provides a button to navigate to the home page.
 */
function PatientPage() {
  const { setPatient } = useOutletContext<LayoutCtx>();
  const navigate = useNavigate();

  return (
    <div>
      <button
        data-testid="set-patient"
        onClick={() =>
          setPatient({
            id: "p-123",
            name: "Jane Smith",
            givenName: "Jane",
            familyName: "Smith",
            onQuill: true,
          })
        }
      >
        Load patient
      </button>
      <button data-testid="go-home" onClick={() => navigate("/")}>
        Go home
      </button>
      <button data-testid="go-messages" onClick={() => navigate("/messages")}>
        Go to messages
      </button>
    </div>
  );
}

function HomePage() {
  return <div data-testid="home-page">Home</div>;
}

function renderWithRoutes(initialRoute: string) {
  return render(
    <MantineProvider theme={theme} env="test">
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/patients/:id/messages" element={<PatientPage />} />
            <Route
              path="/messages"
              element={<div data-testid="messages-page">Messages</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("RootLayout", () => {
  it("clears patient from ribbon when navigating to home", async () => {
    renderWithRoutes("/patients/p-123/messages");

    // Set a patient (simulating what usePatientLoader does)
    await act(async () => {
      screen.getByTestId("set-patient").click();
    });

    expect(screen.getByTestId("ribbon-patient").textContent).toBe("Jane Smith");

    // Navigate to home (non-patient route)
    await act(async () => {
      screen.getByTestId("go-home").click();
    });

    // Patient should be cleared from ribbon
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    expect(screen.getByTestId("ribbon-patient").textContent).toBe("");
  });

  it("clears patient from ribbon when navigating to global messages", async () => {
    renderWithRoutes("/patients/p-123/messages");

    await act(async () => {
      screen.getByTestId("set-patient").click();
    });

    expect(screen.getByTestId("ribbon-patient").textContent).toBe("Jane Smith");

    // Navigate to global messages (non-patient route)
    await act(async () => {
      screen.getByTestId("go-messages").click();
    });

    expect(screen.getByTestId("messages-page")).toBeInTheDocument();
    expect(screen.getByTestId("ribbon-patient").textContent).toBe("");
  });

  it("keeps patient in ribbon on patient-specific routes", async () => {
    renderWithRoutes("/patients/p-123/messages");

    await act(async () => {
      screen.getByTestId("set-patient").click();
    });

    expect(screen.getByTestId("ribbon-patient").textContent).toBe("Jane Smith");
  });

  it("starts with no patient on non-patient routes", () => {
    renderWithRoutes("/");

    expect(screen.getByTestId("ribbon-patient").textContent).toBe("");
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });
});
