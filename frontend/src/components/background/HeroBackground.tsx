import { colours } from "@/styles/colours";
import { Box } from "@mantine/core";
import type { ReactNode } from "react";

interface HeroBackgroundProps {
  children?: ReactNode;
}

export default function HeroBackground({ children }: HeroBackgroundProps) {
  return (
    <Box
      data-testid="hero-background"
      pb="3rem"
      style={{
        background: colours.navy,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Layer 1 — radial glow */}
      <Box
        data-testid="hero-glow"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: [
            "radial-gradient(ellipse 900px 600px at 65% 50%, rgba(200,150,62,0.07) 0%, transparent 60%)",
            "radial-gradient(ellipse 500px 500px at 15% 80%, rgba(30,58,95,0.6) 0%, transparent 60%)",
          ].join(", "),
        }}
      />

      {/* Layer 2 — grid lines */}
      <Box
        data-testid="hero-grid"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: [
            "linear-gradient(rgba(200,150,62,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(200,150,62,0.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "80px 80px",
        }}
      />

      {/* Content slot */}
      <Box
        data-testid="hero-content"
        style={{ position: "relative", zIndex: 1 }}
      >
        {children}
      </Box>
    </Box>
  );
}
