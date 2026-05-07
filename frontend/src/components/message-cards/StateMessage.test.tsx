import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import StateMessage from "./StateMessage";
import {
  IconAlertCircle,
  IconClock,
  IconShieldCheck,
  IconUserOff,
} from "@/components/icons/appIcons";

describe("StateMessage Component", () => {
  describe("Rendering", () => {
    it("renders title text", () => {
      renderWithMantine(
        <StateMessage
          icon={<IconUserOff />}
          title="No patients to show"
          description="There are currently no patients in the system."
        />,
      );
      expect(screen.getByText("No patients to show")).toBeInTheDocument();
    });

    it("renders description text", () => {
      renderWithMantine(
        <StateMessage
          icon={<IconClock />}
          title="Database is initialising"
          description="The Quill databases are just warming up."
        />,
      );
      expect(
        screen.getByText("The Quill databases are just warming up."),
      ).toBeInTheDocument();
    });

    it("renders an icon", () => {
      const { container } = renderWithMantine(
        <StateMessage
          icon={<IconShieldCheck />}
          title="Test"
          description="Test description"
        />,
      );
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("renders as state message card", () => {
      const { container } = renderWithMantine(
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error"
          description="Something went wrong"
        />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe("Colour prop", () => {
    it("defaults to info colour when no colour provided", () => {
      const { container } = renderWithMantine(
        <StateMessage
          icon={<IconClock />}
          title="Loading"
          description="Please wait"
        />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });

    it("accepts alert colour", () => {
      const { container } = renderWithMantine(
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description="Something broke"
          colour="alert"
        />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });

    it("accepts warning colour", () => {
      const { container } = renderWithMantine(
        <StateMessage
          icon={<IconUserOff />}
          title="No patients"
          description="None found"
          colour="warning"
        />,
      );
      const card = container.querySelector('[data-testid="state-message"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe("Description content", () => {
    it("renders JSX description content", () => {
      renderWithMantine(
        <StateMessage
          icon={<IconShieldCheck />}
          title="Contact us"
          description={<a href="mailto:test@example.com">test@example.com</a>}
        />,
      );
      const link = screen.getByRole("link", { name: "test@example.com" });
      expect(link).toHaveAttribute("href", "mailto:test@example.com");
    });

    it("renders string description", () => {
      renderWithMantine(
        <StateMessage
          icon={<IconClock />}
          title="Waiting"
          description="This is a plain string"
        />,
      );
      expect(screen.getByText("This is a plain string")).toBeInTheDocument();
    });
  });
});
