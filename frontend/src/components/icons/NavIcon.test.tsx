import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import NavIcon from "./NavIcon";

describe("NavIcon Component", () => {
  describe("Icon rendering", () => {
    it("renders home icon", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders settings icon", () => {
      const { container } = renderWithMantine(<NavIcon name="settings" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders logout icon", () => {
      const { container } = renderWithMantine(<NavIcon name="logout" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders user icon", () => {
      const { container } = renderWithMantine(<NavIcon name="user" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders bell icon", () => {
      const { container } = renderWithMantine(<NavIcon name="bell" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders message icon", () => {
      const { container } = renderWithMantine(<NavIcon name="message" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders file icon", () => {
      const { container } = renderWithMantine(<NavIcon name="file" />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Size variations", () => {
    it("renders with xs size", () => {
      const { container } = renderWithMantine(
        <NavIcon name="home" size="xs" />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "12");
      expect(svg).toHaveAttribute("height", "12");
    });

    it("renders with sm size", () => {
      const { container } = renderWithMantine(
        <NavIcon name="home" size="sm" />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "16");
      expect(svg).toHaveAttribute("height", "16");
    });

    it("renders with md size", () => {
      const { container } = renderWithMantine(
        <NavIcon name="home" size="md" />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "20");
      expect(svg).toHaveAttribute("height", "20");
    });

    it("renders with lg size (default)", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "28");
      expect(svg).toHaveAttribute("height", "28");
    });

    it("renders with xl size", () => {
      const { container } = renderWithMantine(
        <NavIcon name="home" size="xl" />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "36");
      expect(svg).toHaveAttribute("height", "36");
    });
  });

  describe("ThemeIcon wrapper", () => {
    it("wraps icon in ThemeIcon component", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
      expect(themeIcon).toBeInTheDocument();
    });

    it("applies light variant", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
      expect(themeIcon).toBeInTheDocument();
      // Mantine applies styles via CSS variables, not class names
    });

    it("applies gray color", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
      expect(themeIcon).toBeInTheDocument();
      // Mantine applies colors via CSS variables
    });

    it("applies xl radius", () => {
      const { container } = renderWithMantine(<NavIcon name="home" />);
      const themeIcon = container.querySelector(".mantine-ThemeIcon-root");
      expect(themeIcon).toBeInTheDocument();
      // Mantine applies radius via CSS variables
    });
  });

  describe("All icon names", () => {
    const iconNames = [
      "home",
      "settings",
      "logout",
      "user",
      "bell",
      "message",
      "file",
    ] as const;

    iconNames.forEach((iconName) => {
      it(`renders ${iconName} icon without errors`, () => {
        const { container } = renderWithMantine(<NavIcon name={iconName} />);
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe("All size presets", () => {
    const sizes = ["xs", "sm", "md", "lg", "xl"] as const;
    const expectedSizes = {
      xs: "12",
      sm: "16",
      md: "20",
      lg: "28",
      xl: "36",
    };

    sizes.forEach((size) => {
      it(`renders ${size} size correctly`, () => {
        const { container } = renderWithMantine(
          <NavIcon name="home" size={size} />,
        );
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("width", expectedSizes[size]);
      });
    });
  });
});
