import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import StateMessage from "./StateMessage";
import { IconShieldCheck } from "@/components/icons/appIcons";

describe("StateMessage Component", () => {
  describe("No patients message", () => {
    it('renders "No patients to show" message', () => {
      renderWithMantine(<StateMessage type="no-patients" />);
      expect(screen.getByText("No patients to show")).toBeInTheDocument();
    });

    it("displays state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
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

    it("displays state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage type="database-initialising" />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
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
    it("renders as state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });

    it("renders card element", () => {
      const { container } = renderWithMantine(
        <StateMessage type="no-patients" />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
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

    it("renders as state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage type="error" message="Error" />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
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
      "renders as state message card for type $type",
      ({ type }) => {
        const { container } = renderWithMantine(<StateMessage type={type} />);
        const card = container.querySelector('[data-testid="state-message"]');
        expect(card).toBeInTheDocument();
      },
    );

    it.each(emptyStates)("shows an icon for type $type", ({ type }) => {
      const { container } = renderWithMantine(<StateMessage type={type} />);
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Custom message", () => {
    it("renders custom title", () => {
      renderWithMantine(
        <StateMessage
          type="custom"
          icon={<IconShieldCheck />}
          title="Custom title"
          description="Custom description"
        />,
      );
      expect(screen.getByText("Custom title")).toBeInTheDocument();
    });

    it("renders custom description", () => {
      renderWithMantine(
        <StateMessage
          type="custom"
          icon={<IconShieldCheck />}
          title="Custom title"
          description="Custom description"
        />,
      );
      expect(screen.getByText("Custom description")).toBeInTheDocument();
    });

    it("renders custom icon", () => {
      const { container } = renderWithMantine(
        <StateMessage
          type="custom"
          icon={<IconShieldCheck />}
          title="Custom title"
          description="Custom description"
        />,
      );
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders JSX description content", () => {
      renderWithMantine(
        <StateMessage
          type="custom"
          icon={<IconShieldCheck />}
          title="Custom title"
          description={<a href="mailto:test@example.com">test@example.com</a>}
        />,
      );
      const link = screen.getByRole("link", { name: "test@example.com" });
      expect(link).toHaveAttribute("href", "mailto:test@example.com");
    });

    it("displays state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage
          type="custom"
          icon={<IconShieldCheck />}
          title="Custom title"
          description="Custom description"
        />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });
  });
});
