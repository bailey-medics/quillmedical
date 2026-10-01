/**
 * Stub for react-player used during Storybook static builds.
 *
 * react-player v3 registers youtube-video-element (a custom element)
 * at import time, which hangs Node.js during the Storybook build.
 * This renders a placeholder box instead.
 *
 * The interaction tests run against a static build, so they see this box in
 * place of the player and axe checks it like anything else. Its text must
 * keep a contrast of at least 4.5:1 against its background.
 */
import { forwardRef } from "react";

const ReactPlayer = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function ReactPlayer(props, ref) {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        style={{
          width: props.width as string,
          height: props.height as string,
          background: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ccc",
          fontSize: 14,
          borderRadius: 8,
        }}
      >
        Video player (build placeholder)
      </div>
    );
  },
);

export default ReactPlayer;
