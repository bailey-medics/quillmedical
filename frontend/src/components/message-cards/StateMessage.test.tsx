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
        screen.getByText(/Quill databases are just warming up/i),
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

  describe("Error message", () => {
    it('renders "Error loading data" title', () => {
      renderWithMantine(
        <StateMessage type="error" message="Something went wrong" />,
      );
      expect(screen.getByText("Error loading data")).toBeInTheDocument();
    });

    it("displays the error message", () => {
      renderWithMantine(
        <StateMessage type="error" message="Failed to load data" />,
      );
      expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    });

    it("shows alert-circle icon", () => {
      const { container } = renderWithMantine(
        <StateMessage type="error" message="Error" />,
      );
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders as alert element", () => {
      const { container } = renderWithMantine(
        <StateMessage type="error" message="Error" />,
      );
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });
  });

  describe("Empty list states", () => {
    const emptyStates = [
      {
        type: "no-letters" as const,
        title: "No letters to show",
        description: /no clinical letters/i,
      },
      {
        type: "no-messages" as const,
        title: "No messages to show",
        description: /messages from your care team/i,
      },
      {
        type: "no-notes" as const,
        title: "No notes to show",
        description: /no clinical notes/i,
      },
      {
        type: "no-documents" as const,
        title: "No documents to show",
        description: /no documents for this patient/i,
      },
      {
        type: "no-appointments" as const,
        title: "No appointments to show",
        description: /no appointments scheduled/i,
      },
    ];

    it.each(emptyStates)(
      'renders "$title" for type $type',
      ({ type, title }) => {
        renderWithMantine(<StateMessage type={type} />);
        expect(screen.getByText(title)).toBeInTheDocument();
      },
    );

    it.each(emptyStates)(
      "displays description for type $type",
      ({ type, description }) => {
        renderWithMantine(<StateMessage type={type} />);
        expect(screen.getByText(description)).toBeInTheDocument();
      },
    );

    it.each(emptyStates)(
      "renders as alert element for type $type",
      ({ type }) => {
        const { container } = renderWithMantine(<StateMessage type={type} />);
        const alert = container.querySelector('[role="alert"]');
        expect(alert).toBeInTheDocument();
      },
    );

    it.each(emptyStates)("shows an icon for type $type", ({ type }) => {
      const { container } = renderWithMantine(<StateMessage type={type} />);
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });
});
