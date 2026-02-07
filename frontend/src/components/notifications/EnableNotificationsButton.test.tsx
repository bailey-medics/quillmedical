import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import EnableNotificationsButton from "./EnableNotificationsButton";

// Mock the global Notification API
const mockRequestPermission = vi.fn();
const mockNotification = {
  requestPermission: mockRequestPermission,
} as unknown as typeof Notification;

// Mock service worker
const mockPushManager = {
  subscribe: vi.fn(),
};

const mockServiceWorkerRegistration = {
  pushManager: mockPushManager,
};

describe("EnableNotificationsButton Component", () => {
  beforeEach(() => {
    // Setup VAPID key
    import.meta.env.VITE_VAPID_PUBLIC = "test-vapid-key";

    // Setup global mocks
    global.Notification = mockNotification;
    Object.defineProperty(global.navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve(mockServiceWorkerRegistration),
      },
      writable: true,
      configurable: true,
    });
    global.fetch = vi.fn();

    // Reset mocks
    mockRequestPermission.mockReset();
    mockPushManager.subscribe.mockReset();
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial state", () => {
    it("renders button with initial text", () => {
      renderWithMantine(<EnableNotificationsButton />);
      expect(
        screen.getByRole("button", { name: /enable notifications/i }),
      ).toBeInTheDocument();
    });

    it("button is not disabled initially", () => {
      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });

  describe("Enabling notifications", () => {
    it("requests permission when clicked", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      const mockSub = {
        endpoint: "test",
        toJSON: () => ({
          endpoint: "test",
          keys: { p256dh: "key1", auth: "key2" },
        }),
      };
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      expect(mockRequestPermission).toHaveBeenCalledOnce();
    });

    it("shows busy state while enabling", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      const mockSub = {
        endpoint: "test",
        toJSON: () => ({
          endpoint: "test",
          keys: { p256dh: "key1", auth: "key2" },
        }),
      };
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      // Wait for final state - button should be disabled after enabling completes
      await screen.findByText(/notifications enabled/i);
      expect(button).toBeDisabled();
    });

    it("subscribes to push manager when permission granted", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      const mockSub = {
        endpoint: "test",
        toJSON: () => ({
          endpoint: "test",
          keys: { p256dh: "key1", auth: "key2" },
        }),
      };
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockPushManager.subscribe).toHaveBeenCalled();
      });
    });

    it("sends subscription to backend", async () => {
      const user = userEvent.setup();
      const mockSubscription = {
        endpoint: "https://example.com/push",
        keys: { p256dh: "key1", auth: "key2" },
      };
      const mockSub = {
        ...mockSubscription,
        toJSON: () => mockSubscription,
      };
      mockRequestPermission.mockResolvedValue("granted");
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/push/subscribe",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mockSubscription),
          }),
        );
      });
    });

    it("shows success state after enabling", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      const mockSub = {
        endpoint: "test",
        toJSON: () => ({
          endpoint: "test",
          keys: { p256dh: "key1", auth: "key2" },
        }),
      };
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/notifications enabled/i)).toBeInTheDocument();
      });
      expect(button).toBeDisabled();
    });
  });

  describe("Permission denied", () => {
    it("shows denied state when user denies permission", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("denied");

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
      });
    });

    it("button remains enabled after permission denied", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("denied");

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
      });
      expect(button).not.toBeDisabled();
    });
  });

  describe("Error handling", () => {
    it("shows error state when subscription fails", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      mockPushManager.subscribe.mockRejectedValue(
        new Error("Subscribe failed"),
      );

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it("shows error state when backend request fails", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockResolvedValue("granted");
      const mockSub = {
        endpoint: "test",
        toJSON: () => ({
          endpoint: "test",
          keys: { p256dh: "key1", auth: "key2" },
        }),
      };
      mockPushManager.subscribe.mockResolvedValue(mockSub);
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
      });

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });

    it("button remains enabled after error", async () => {
      const user = userEvent.setup();
      mockRequestPermission.mockRejectedValue(new Error("Failed"));

      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");

      await user.click(button);

      await vi.waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
      expect(button).not.toBeDisabled();
    });
  });

  describe("Button styling", () => {
    it("has max-width of 150px", () => {
      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ maxWidth: "150px" });
    });

    it("has 100% width", () => {
      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ width: "100%" });
    });

    it("has padding", () => {
      renderWithMantine(<EnableNotificationsButton />);
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ padding: "0.5rem 1rem" });
    });
  });
});
