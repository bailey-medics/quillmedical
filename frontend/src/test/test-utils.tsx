/**
 * Testing Utilities
 *
 * Custom render functions and utilities for testing React components
 * with common providers (Router, Mantine, Auth).
 */

/* eslint-disable react-refresh/only-export-components */

import { render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";

/**
 * Render options with all providers
 */
interface AllProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial route for React Router */
  initialRoute?: string;
}

/**
 * Wrapper with Mantine Provider
 */
function MantineWrapper({ children }: { children: ReactNode }) {
  return <MantineProvider env="test">{children}</MantineProvider>;
}

/**
 * Wrapper with Router and Mantine
 */
function RouterAndMantineWrapper({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <MantineProvider env="test">{children}</MantineProvider>
    </BrowserRouter>
  );
}

/**
 * Render component with Mantine Provider
 *
 * Use this for testing components that use Mantine UI components
 * but don't need routing or authentication.
 *
 * @example
 * const { getByText } = renderWithMantine(<MyComponent />);
 */
export function renderWithMantine(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: MantineWrapper, ...options });
}

/**
 * Render component with Router and Mantine Provider
 *
 * Use this for testing components that use routing (Link, useNavigate)
 * and Mantine UI components.
 *
 * @example
 * const { getByRole } = renderWithRouter(<LoginPage />);
 */
export function renderWithRouter(
  ui: ReactElement,
  options?: AllProvidersOptions,
) {
  const { initialRoute, ...renderOptions } = options ?? {};

  if (initialRoute) {
    window.history.pushState({}, "Test page", initialRoute);
  }

  return render(ui, { wrapper: RouterAndMantineWrapper, ...renderOptions });
}

/**
 * Create a mock fetch response
 *
 * Helper for creating mock fetch responses in tests.
 *
 * @example
 * global.fetch = vi.fn().mockResolvedValue(
 *   createMockResponse({ data: "test" })
 * );
 */
export function createMockResponse(
  data: unknown,
  options: { status?: number; statusText?: string; ok?: boolean } = {},
): Response {
  const { status = 200, statusText = "OK", ok = true } = options;

  return {
    ok,
    status,
    statusText,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    clone: () => createMockResponse(data, options),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as Response;
}

/**
 * Wait for a condition to be true
 *
 * Alternative to waitFor that's more flexible.
 *
 * @example
 * await waitForCondition(() => mockFn.mock.calls.length > 0);
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 1000,
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
