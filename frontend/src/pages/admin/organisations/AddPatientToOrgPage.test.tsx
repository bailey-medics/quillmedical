/**
 * AddPatientToOrgPage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddPatientToOrgPage from "./AddPatientToOrgPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("AddPatientToOrgPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders page title", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [],
      fhir_ready: true,
    });

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    expect(
      screen.getByRole("heading", { name: "Add patient" }),
    ).toBeInTheDocument();
  });

  it("loads patients from API", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [
        { id: "fhir-001", name: [{ given: ["Alice"], family: "Johnson" }] },
      ],
      fhir_ready: true,
    });

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalledWith("/patients?scope=admin");
    });
  });

  it("shows validation error when no patient selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [],
      fhir_ready: true,
    });

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    const submitButton = screen.getByRole("button", { name: "Add patient" });
    await user.click(submitButton);

    expect(screen.getByText("Please select a patient")).toBeInTheDocument();
  });

  it("navigates back on cancel", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [],
      fhir_ready: true,
    });

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
  });

  it("shows error when FHIR is not ready", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [],
      fhir_ready: false,
    });

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    await waitFor(() => {
      expect(
        screen.getByText("FHIR server is not ready. Please try again later."),
      ).toBeInTheDocument();
    });
  });

  it("shows success message on successful submission", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [
        { id: "fhir-001", name: [{ given: ["Alice"], family: "Johnson" }] },
      ],
      fhir_ready: true,
    });
    vi.spyOn(apiLib.api, "post").mockResolvedValue({
      organisation_id: 1,
      patient_id: "fhir-001",
    });

    const user = userEvent.setup();

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    const selectInput = await screen.findByPlaceholderText(
      "Search for a patient",
    );
    await user.click(selectInput);
    await user.type(selectInput, "Alice");

    const option = await screen.findByRole("option", {
      name: "Alice Johnson",
    });
    await user.click(option);

    const submitButton = screen.getByRole("button", { name: "Add patient" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Patient added")).toBeInTheDocument();
    });
  });

  it("shows error on API failure when adding patient", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      patients: [
        { id: "fhir-001", name: [{ given: ["Alice"], family: "Johnson" }] },
      ],
      fhir_ready: true,
    });
    vi.spyOn(apiLib.api, "post").mockRejectedValue(
      new Error("Patient is already a member of this organisation"),
    );

    const user = userEvent.setup();

    renderWithRouter(<AddPatientToOrgPage />, {
      routePath: "/admin/organisations/:id/add-patient",
      initialRoute: "/admin/organisations/1/add-patient",
    });

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    const selectInput = await screen.findByPlaceholderText(
      "Search for a patient",
    );
    await user.click(selectInput);
    await user.type(selectInput, "Alice");

    const option = await screen.findByRole("option", {
      name: "Alice Johnson",
    });
    await user.click(option);

    const submitButton = screen.getByRole("button", { name: "Add patient" });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Patient is already a member of this organisation"),
      ).toBeInTheDocument();
    });
  });
});
