/**
 * Edit Patient Page Tests
 *
 * The page is a picker: it fetches the patients, lists them, and opens
 * the edit form for the one chosen. The form itself is NewPatientPage.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import EditPatientPage from "./EditPatientPage";

const navigate = vi.fn();
const get = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

const patients = [
  {
    id: "p-1",
    name: [{ given: ["Jane"], family: "Smith" }],
    birthDate: "1980-05-12",
    gender: "female",
  },
  { id: "p-2", name: [{ family: "Jones" }] },
  { id: "p-3", name: [] },
];

describe("EditPatientPage", () => {
  beforeEach(() => {
    navigate.mockClear();
    get.mockReset();
    get.mockResolvedValue({ patients });
  });

  it("asks the API for the patients, and for nothing else", async () => {
    renderWithRouter(<EditPatientPage />);

    await screen.findByText("Jane Smith");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/patients");
  });

  it("lists each patient with their name, birth date and gender", async () => {
    renderWithRouter(<EditPatientPage />);

    expect(await screen.findByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("1980-05-12")).toBeInTheDocument();
    expect(screen.getByText("female")).toBeInTheDocument();
  });

  it("copes with a name that is partly or wholly missing", async () => {
    renderWithRouter(<EditPatientPage />);

    expect(await screen.findByText("Jones")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getAllByText("N/A")).toHaveLength(4);
  });

  it("opens the edit form of the patient whose button is pressed", async () => {
    const user = userEvent.setup();
    renderWithRouter(<EditPatientPage />);

    await screen.findByText("Jane Smith");
    await user.click(
      screen.getAllByRole("button", { name: "Edit patient" })[1],
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/admin/patients/p-2/edit");
  });

  it("shows no table and no message while the patients are loading", () => {
    get.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<EditPatientPage />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No patients found")).not.toBeInTheDocument();
  });

  it("says so when there are no patients", async () => {
    get.mockResolvedValue({});

    renderWithRouter(<EditPatientPage />);

    expect(await screen.findByText("No patients found")).toBeInTheDocument();
  });

  it("shows the error when the patients cannot be fetched", async () => {
    get.mockRejectedValue(new Error("Network down"));

    renderWithRouter(<EditPatientPage />);

    expect(
      await screen.findByText("Error loading patients"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
  });

  it("no longer shows a placeholder where the form should be", async () => {
    renderWithRouter(<EditPatientPage />);

    await screen.findByText("Jane Smith");

    expect(screen.queryByText(/not yet implemented/i)).not.toBeInTheDocument();
  });
});
