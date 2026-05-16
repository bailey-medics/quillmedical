/**
 * Stub for react-player used during Storybook static builds.
 *
 * react-player v3 registers youtube-video-element (a custom element)
 * at import time, which hangs Node.js during the Storybook build.
 * This renders a placeholder box instead.
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
          color: "#666",
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
