# Frontend Testing Guide

## Overview

Quill Medical frontend uses **Vitest** with **React Testing Library** for unit and integration testing. The test infrastructure is configured to support testing React components with Mantine UI and React Router.

## Running Tests

```bash
# Run tests in watch mode (interactive)
yarn unit-test

# Run tests once (CI mode)
yarn unit-test:run

# Or use Justfile commands
just unit-tests-frontend    # Runs in Docker container
```

## Test Infrastructure

### Configuration Files

- **`vitest.config.ts`** - Vitest configuration with jsdom environment
- **`src/test/setup.ts`** - Global test setup (runs before all tests)
- **`src/test/test-utils.tsx`** - Custom render utilities and helpers

### Available Utilities

#### Render Functions

```typescript
import { renderWithMantine, renderWithRouter } from "@/test/test-utils";

// For components using Mantine UI
renderWithMantine(<MyComponent />);

// For components using React Router
renderWithRouter(<LoginPage />);
```

#### Mock Helpers

```typescript
import { createMockResponse } from "@/test/test-utils";
import { vi } from "vitest";

// Mock fetch responses
global.fetch = vi
  .fn()
  .mockResolvedValue(createMockResponse({ data: "test" }, { status: 200 }));
```

### Available Matchers

All **jest-dom** matchers are available via `@testing-library/jest-dom`:

```typescript
// Element queries
expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeDisabled();
expect(element).toBeEnabled();

// Content matchers
expect(element).toHaveTextContent("text");
expect(element).toHaveValue("value");
expect(element).toHaveAttribute("attr", "value");

// Form matchers
expect(input).toHaveValue("test");
expect(checkbox).toBeChecked();
expect(select).toHaveDisplayValue("Option 1");
```

[Full list of matchers](https://github.com/testing-library/jest-dom#custom-matchers)

## Writing Tests

### Basic Component Test

```typescript
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    renderWithMantine(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

### Testing User Interactions

```typescript
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";

describe("Button Component", () => {
  it("handles click events", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    renderWithMantine(<Button onClick={handleClick}>Click me</Button>);

    await user.click(screen.getByText("Click me"));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Testing Forms

```typescript
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import LoginPage from "./LoginPage";

describe("LoginPage", () => {
  it("submits form with user input", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginPage />);

    // Fill form
    await user.type(screen.getByLabelText(/username/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");

    // Submit
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Assert submission
    // ... expectations here
  });
});
```

### Mocking API Calls

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockResponse } from "@/test/test-utils";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("API Tests", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("fetches data successfully", async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({ data: "test" }));

    // Test code that calls fetch
    const response = await fetch("/api/test");
    const data = await response.json();

    expect(data).toEqual({ data: "test" });
  });

  it("handles errors", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ detail: "Error" }, { status: 500, ok: false }),
    );

    // Test error handling
  });
});
```

### Testing Async Behaviour

```typescript
import { waitFor } from "@testing-library/react";

it("waits for async updates", async () => {
  renderWithMantine(<AsyncComponent />);

  await waitFor(() => {
    expect(screen.getByText("Loaded")).toBeInTheDocument();
  });
});
```

## Best Practices

### 1. Use Semantic Queries

Prefer queries that reflect how users interact with your app:

```typescript
// ✅ Good - semantic queries
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText(/username/i);
screen.getByText(/welcome/i);

// ❌ Bad - implementation details
screen.getByTestId("submit-button");
screen.getByClassName("btn-primary");
```

### 2. Async User Interactions

Always use `userEvent.setup()` and `await` for user interactions:

```typescript
// ✅ Good
const user = userEvent.setup();
await user.click(button);
await user.type(input, "text");

// ❌ Bad
fireEvent.click(button);
```

### 3. Clean Up After Tests

The test setup automatically calls `cleanup()` after each test, but if you need manual cleanup:

```typescript
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Additional cleanup
});
```

### 4. Mock External Dependencies

Always mock external dependencies (API calls, timers, etc.):

```typescript
import { vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});
```

### 5. Test Behaviour, Not Implementation

```typescript
// ✅ Good - tests user-facing behaviour
it("displays error when login fails", async () => {
  // ... setup
  await user.click(loginButton);
  expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
});

// ❌ Bad - tests implementation details
it("sets error state to true", () => {
  // Testing internal state
});
```

## File Structure

```
frontend/src/
├── test/
│   ├── setup.ts                 # Global test setup
│   ├── test-utils.tsx          # Custom render utilities
│   ├── infrastructure.test.tsx # Infrastructure verification tests
│   └── README.md               # This file
├── lib/
│   ├── api.ts
│   └── api.test.ts             # Unit tests for API client
├── auth/
│   ├── AuthContext.tsx
│   └── AuthContext.test.tsx    # Tests for auth context
└── pages/
    ├── LoginPage.tsx
    └── LoginPage.test.tsx      # Page component tests
```

## Coverage

Run tests with coverage:

```bash
yarn unit-test --coverage
```

Coverage configuration in `vitest.config.ts`:

- Provider: v8
- Reporters: text, json, html
- Excludes: node_modules, test files, type definitions, storybook

## Troubleshooting

### Tests not finding components

Make sure you're using the correct render function:

- Use `renderWithMantine` for Mantine components
- Use `renderWithRouter` for components using routing

### Mocks not working

Clear mocks in `beforeEach`:

```typescript
beforeEach(() => {
  mockFn.mockClear();
});
```

### Async tests timing out

Increase timeout or check your `waitFor` conditions:

```typescript
await waitFor(
  () => {
    expect(screen.getByText("Loaded")).toBeInTheDocument();
  },
  { timeout: 3000 },
);
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [jest-dom Matchers](https://github.com/testing-library/jest-dom)
- [user-event](https://testing-library.com/docs/user-event/intro)
