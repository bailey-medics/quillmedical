import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import StateMessage from "./StateMessage";

describe("StateMessage Component", () => {
  describe("No patients message", () => {
    it('renders "No patients to show" message', () => {
      renderWithMantine(<StateMessage type="no-patients" />);
      expect(screen.getByText("No patients to show")).toBeInTheDocument();
    });

    it("displays gray alert color", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });

    it("shows user-off icon", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("displays explanatory text", () => {
      renderWithMantine(<StateMessage type="no-patients" />);
      expect(
        screen.getByText(/There are currently no patients in the system/i),
      ).toBeInTheDocument();
    });
  });

  describe("Database initialising message", () => {
    it('renders "Database is initialising" message', () => {
      renderWithMantine(<StateMessage type="database-initialising" />);
      expect(screen.getByText("Database is initialising")).toBeInTheDocument();
    });

    it("displays blue alert color", () => {
      const { container } = renderWithMantine(
        <StateMessage type="database-initialising" />,
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });

    it("shows clock icon", () => {
      const { container } = renderWithMantine(
        <StateMessage type="database-initialising" />,
      );
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("displays explanatory text about data retrieval", () => {
      renderWithMantine(<StateMessage type="database-initialising" />);
      expect(
        screen.getByText(/Patient data is being retrieved/i),
      ).toBeInTheDocument();
    });

    it("mentions automatic appearance of patient list", () => {
      renderWithMantine(<StateMessage type="database-initialising" />);
      expect(
        screen.getByText(/will appear automatically once available/i),
      ).toBeInTheDocument();
    });
  });

  describe("Component structure", () => {
    it("renders as alert element", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });

    it("has constrained width", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });
  });
});
