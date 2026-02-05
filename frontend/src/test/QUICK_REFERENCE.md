# Frontend Testing Quick Reference

## Commands

```bash
# Development
yarn unit-test              # Watch mode
yarn unit-test:run          # CI mode (run once)
yarn unit-test:coverage     # With coverage report
just unit-tests-frontend    # In Docker container
```

## Common Imports

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithMantine,
  renderWithRouter,
  createMockResponse,
} from "@/test/test-utils";
```

## Test Structure

```typescript
describe("ComponentName", () => {
  beforeEach(() => {
    // Setup before each test
  });

  it("does something", () => {
    // Test implementation
  });
});
```

## Rendering

```typescript
// Mantine components
renderWithMantine(<MyComponent />);

// With routing
renderWithRouter(<LoginPage />);
```

## Queries (in order of preference)

```typescript
// 1. Role-based (BEST)
screen.getByRole("button", { name: /submit/i });
screen.getByRole("textbox", { name: /username/i });

// 2. Label-based
screen.getByLabelText(/password/i);

// 3. Text content
screen.getByText(/welcome/i);

// 4. Placeholder
screen.getByPlaceholderText(/search/i);

// 5. Test ID (last resort)
screen.getByTestId("custom-element");
```

## User Interactions

```typescript
const user = userEvent.setup();

// Click
await user.click(screen.getByRole("button"));

// Type
await user.type(screen.getByLabelText(/username/i), "test@example.com");

// Clear and type
await user.clear(input);
await user.type(input, "new text");

// Select
await user.selectOptions(screen.getByRole("combobox"), "option1");

// Check/uncheck
await user.click(screen.getByRole("checkbox"));
```

## Assertions

```typescript
// Existence
expect(element).toBeInTheDocument();
expect(element).not.toBeInTheDocument();

// Visibility
expect(element).toBeVisible();
expect(element).not.toBeVisible();

// State
expect(button).toBeDisabled();
expect(button).toBeEnabled();
expect(checkbox).toBeChecked();

// Content
expect(element).toHaveTextContent("text");
expect(input).toHaveValue("value");
expect(element).toHaveAttribute("href", "/path");
```

## Async Testing

```typescript
// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});

// Find queries (built-in wait)
const element = await screen.findByText("Loaded");
```

## Mocking

```typescript
// Mock function
const mockFn = vi.fn();
mockFn.mockReturnValue("value");
mockFn.mockResolvedValue("async value");

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

mockFetch.mockResolvedValue(createMockResponse({ data: "test" }));

// Clear mocks
beforeEach(() => {
  mockFn.mockClear();
});
```

## Common Patterns

### Form submission

```typescript
const user = userEvent.setup();

await user.type(screen.getByLabelText(/username/i), "test@example.com");
await user.type(screen.getByLabelText(/password/i), "password123");
await user.click(screen.getByRole("button", { name: /sign in/i }));

await waitFor(() => {
  expect(mockApi.post).toHaveBeenCalledWith("/auth/login", {
    username: "test@example.com",
    password: "password123",
  });
});
```

### Error handling

```typescript
mockFetch.mockResolvedValueOnce(
  createMockResponse({ detail: "Invalid input" }, { status: 400, ok: false }),
);

await user.click(submitButton);

expect(await screen.findByText(/invalid input/i)).toBeInTheDocument();
```

### Loading states

```typescript
mockFetch.mockImplementation(
  () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
);

await user.click(button);

expect(button).toBeDisabled();
expect(screen.getByText(/loading/i)).toBeInTheDocument();

await waitFor(() => {
  expect(button).toBeEnabled();
});
```

## Documentation

- Full guide: `frontend/src/test/README.md`
- Setup details: `docs/docs/frontend/test-infrastructure-setup.md`
- Examples: `frontend/src/test/infrastructure.test.tsx`
