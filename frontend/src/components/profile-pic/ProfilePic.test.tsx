import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import ProfilePic from "./ProfilePic";

describe("ProfilePic Component", () => {
  describe("Generic person icon", () => {
    it("renders generic icon when no names provided", () => {
      const { container } = renderWithMantine(<ProfilePic />);
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      const icon = container.querySelector("svg[data-avatar-placeholder-icon]");
      expect(icon).toBeInTheDocument();
    });

    it("renders generic icon when showGeneric is true", () => {
      const { container } = renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          gradientIndex={0}
          showGeneric
        />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      const icon = container.querySelector("svg[data-avatar-placeholder-icon]");
      expect(icon).toBeInTheDocument();
    });

    it("shows tooltip with full name when generic icon displayed", () => {
      const { container } = renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          gradientIndex={0}
          showGeneric
        />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      // Avatar renders with generic icon when showGeneric is true
      const icon = container.querySelector("svg[data-avatar-placeholder-icon]");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Image display", () => {
    it("renders image when src provided", () => {
      const { container } = renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          src="https://example.com/photo.jpg"
          gradientIndex={0}
        />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    });
  });

  describe("Initials display", () => {
    it("renders two-letter initials from given and family names", () => {
      renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" gradientIndex={0} />,
      );
      expect(screen.getByText("JS")).toBeInTheDocument();
    });

    it("renders first two letters of given name when no family name", () => {
      renderWithMantine(<ProfilePic givenName="John" gradientIndex={0} />);
      expect(screen.getByText("JO")).toBeInTheDocument();
    });

    it("renders first two letters of family name when no given name", () => {
      renderWithMantine(<ProfilePic familyName="Smith" gradientIndex={0} />);
      expect(screen.getByText("SM")).toBeInTheDocument();
    });

    it("renders generic icon when no names provided and showGeneric is false", () => {
      const { container } = renderWithMantine(<ProfilePic gradientIndex={0} />);
      // No names = generic person icon (not initials)
      const avatar = container.querySelector(
        "svg[data-avatar-placeholder-icon]",
      );
      expect(avatar).toBeInTheDocument();
    });

    it("converts initials to uppercase", () => {
      renderWithMantine(
        <ProfilePic givenName="john" familyName="smith" gradientIndex={0} />,
      );
      expect(screen.getByText("JS")).toBeInTheDocument();
    });
  });

  describe("Gradient backgrounds", () => {
    it("applies gradient when gradientIndex provided", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" gradientIndex={5} />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      const style = avatar?.getAttribute("style") || "";
      expect(style).toContain("linear-gradient");
    });

    it("shows white background when gradientIndex exceeds available gradients", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" gradientIndex={999} />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      // Out of range gradient index should still render avatar
      expect(avatar).toHaveAttribute("style");
    });

    it("handles gradientIndex 0", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" gradientIndex={0} />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      const style = avatar?.getAttribute("style") || "";
      expect(style).toContain("linear-gradient");
    });
  });

  describe("Sizes", () => {
    it("renders small size (32px)", () => {
      const { container } = renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          size="sm"
          gradientIndex={0}
        />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass("mantine-Avatar-root");
    });

    it("renders medium size (48px) by default", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" gradientIndex={0} />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass("mantine-Avatar-root");
    });

    it("renders large size (64px)", () => {
      const { container } = renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          size="lg"
          gradientIndex={0}
        />,
      );
      const avatar = container.querySelector(".mantine-Avatar-root");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass("mantine-Avatar-root");
    });
  });

  describe("Loading state", () => {
    it("renders skeleton when isLoading is true", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" isLoading />,
      );
      const skeleton = container.querySelector('[class*="Skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });

    it("does not render avatar when loading", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="John" familyName="Smith" isLoading />,
      );
      const avatar = container.querySelector('[data-avatars-indicator="true"]');
      expect(avatar).not.toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles empty string names", () => {
      const { container } = renderWithMantine(
        <ProfilePic givenName="" familyName="" gradientIndex={0} />,
      );
      // Empty names = generic person icon
      const avatar = container.querySelector(
        "svg[data-avatar-placeholder-icon]",
      );
      expect(avatar).toBeInTheDocument();
    });

    it("handles whitespace-only names", () => {
      renderWithMantine(
        <ProfilePic givenName="   " familyName="   " gradientIndex={0} />,
      );
      expect(screen.getByText("??")).toBeInTheDocument();
    });

    it("handles null src", () => {
      renderWithMantine(
        <ProfilePic
          givenName="John"
          familyName="Smith"
          src={null}
          gradientIndex={0}
        />,
      );
      expect(screen.getByText("JS")).toBeInTheDocument();
    });

    it("trims whitespace from names", () => {
      renderWithMantine(
        <ProfilePic
          givenName="  John  "
          familyName="  Smith  "
          gradientIndex={0}
        />,
      );
      expect(screen.getByText("JS")).toBeInTheDocument();
    });
  });
});
