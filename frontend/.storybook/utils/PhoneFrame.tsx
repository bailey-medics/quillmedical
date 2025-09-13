import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type PhoneFrameProps = {
  width: number;
  height: number;
  showCapsule?: boolean;
  capsuleHeight?: number;
  capsuleWidth?: number;
  showTime?: boolean;
  showSignal?: boolean;
  showWifi?: boolean;

  // URL bar
  showUrlBar?: boolean;
  url?: string;
  urlBarHeight?: number;

  children: ReactNode;
};

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PhoneFrame({
  width,
  height,
  showCapsule = true,
  capsuleHeight = 32,
  capsuleWidth = Math.min(110, Math.floor(width * 0.6)),
  showTime = true,
  showSignal = true,
  showWifi = false,

  showUrlBar = true,
  url = "https://quill.example/patient/123",
  urlBarHeight = 44,

  children,
}: PhoneFrameProps) {
  const [autoTime, setAutoTime] = useState(formatTime());

  useEffect(() => {
    if (!showCapsule || !showTime) return;
    const interval = setInterval(() => setAutoTime(formatTime()), 60000);
    return () => clearInterval(interval);
  }, [showCapsule, showTime]);

  // Height reserved for status area (time/capsule/icons)
  const safeTop = showCapsule ? capsuleHeight + 12 : 0;
  // Where scrolling content begins
  const contentTop = safeTop + (showUrlBar ? urlBarHeight : 0);

  return (
    <div
      style={{
        width,
        height,
        margin: 16,
        borderRadius: 50,
        border: "6px solid #222",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#111",
        position: "relative",
      }}
    >
      {/* Screen area fills the device; internal layers are absolutely positioned */}
      <div style={{ flex: 1, position: "relative", background: "#fff" }}>
        {/* --- STATUS OVERLAY LAYER (always on top) --- */}
        {showCapsule && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: safeTop,
              zIndex: 30,
              pointerEvents: "none",
            }}
          >
            {/* time (left) */}
            {showTime && (
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: 50,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#000", // switch to #fff if you add a dark status bar
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
              >
                {autoTime}
              </div>
            )}

            {/* capsule (center) */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                width: capsuleWidth,
                height: capsuleHeight,
                background: "#000",
                borderRadius: capsuleHeight,
                boxShadow: "0 2px 8px rgba(0,0,0,0.35) inset",
              }}
            />

            {/* right-side indicators */}
            {(showWifi || showSignal) && (
              <div
                style={{
                  position: "absolute",
                  top: 15,
                  right: 80,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                  color: "#000", // Wi-Fi SVG uses currentColor
                }}
              >
                {/* Wi-Fi (arcs only) */}
                {showWifi && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ display: "block" }}
                  >
                    <path d="M3 8a15 15 0 0 1 18 0" />
                    <path d="M6 11a10.5 10.5 0 0 1 12 0" />
                    <path d="M9 14a6 6 0 0 1 6 0" />
                  </svg>
                )}
                {/* Cellular bars (full) */}
                {showSignal && (
                  <div
                    style={{ display: "flex", alignItems: "flex-end", gap: 2 }}
                  >
                    {[8, 11, 14, 17].map((h, i) => (
                      <div
                        key={i}
                        style={{
                          width: 3,
                          height: h,
                          borderRadius: 1,
                          background: "#000",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- URL BAR (fixed within screen) --- */}
        {showUrlBar && (
          <div
            style={{
              position: "absolute",
              top: safeTop,
              left: 0,
              right: 0,
              height: urlBarHeight,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f8f9fb",
              zIndex: 20,
            }}
          >
            {/* Back / forward */}
            <div style={{ display: "flex", gap: 6 }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                stroke="#6b7280"
                fill="none"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                stroke="#9ca3af"
                fill="none"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>

            {/* Address pill */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 9999,
                padding: "6px 12px",
                minWidth: 0,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 1 1 8 0v3" />
              </svg>
              <span
                style={{
                  fontSize: 12,
                  color: "#111827",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={url}
              >
                {url}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6b7280"
                strokeWidth="2"
                style={{ marginLeft: "auto" }}
              >
                <path d="M21 12a9 9 0 1 1-9-9" />
                <path d="M21 3v9h-9" />
              </svg>
            </div>

            {/* Share */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6b7280"
              strokeWidth="2"
              style={{ marginLeft: 8 }}
            >
              <path d="M12 16v-8" />
              <path d="M9 7l3-3 3 3" />
              <path d="M19 12v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5" />
            </svg>
          </div>
        )}

        {/* --- SCROLLABLE CONTENT PANE --- */}
        <div
          style={{
            position: "absolute",
            top: contentTop,
            left: 0,
            right: 0,
            bottom: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            containerType: "inline-size",
            zIndex: 10,
          }}
        >
          {children}
          {/* demo filler */}
          <div
            style={{ height: 1200, background: "linear-gradient(#fff,#eee)" }}
          />
        </div>
      </div>
    </div>
  );
}
