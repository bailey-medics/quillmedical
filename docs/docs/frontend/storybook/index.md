# Storybook

**Status:** Storybook is configured and operational with 51 story files covering core UI components. Component documentation and interactive development environment are available.

## Overview

Quill Medical uses [Storybook 10.2.10](https://storybook.js.org/) as an interactive component development and documentation tool. Storybook allows developers to:

- Develop UI components in isolation
- Document component props and variations
- Test components visually across different states
- Share living documentation with the team

## Configuration

Storybook is configured with:

- **Framework**: React + Vite integration (`@storybook/react-vite`)
- **Version**: 10.2.10
- **Dev Server**: Port 6006
- **Build Output**: `docs/code/storybook/` (deployed with MkDocs documentation)

### Decorators

All stories are wrapped with essential providers:

```tsx
<AuthProvider>
  <MantineProvider defaultColorScheme="light">
    <MemoryRouter>{Story()}</MemoryRouter>
  </MantineProvider>
</AuthProvider>
```

This ensures components have access to:

- **Authentication context** (AuthProvider)
- **Mantine theming and components** (MantineProvider)
- **React Router navigation** (MemoryRouter)

### Story Sorting

Stories are alphabetically sorted in the sidebar for easy navigation.

## Available Stories

The project includes **51 component story files** across various UI categories:

### Core Components

- **Date** - Date display formatting
- **NationalNumber** - National identifier display
- **MarkdownView** - Markdown content rendering
- **ProfilePic** - User avatar with gradient colours
- **StackedProfilePics** - Overlapping avatar group display
- **QuillLogo** - Brand logo component
- **QuillName** - Brand name component
- **Typography** - Reference story for typographic styles

### Navigation & Layout

- **Complete** - Full page layout compositions
- **CompletePatientList** - Full page layout with patient list
- **MainLayout** - Primary application layout
- **NavigationDrawer** - Mobile navigation drawer
- **NotFoundLayout** - 404 error page layout
- **SideNav** - Sidebar navigation component
- **TopRibbon** - Header ribbon component
- **NavIcon** - Navigation icon component
- **Footer** - Application footer component
- **PageHeader** - Page title and description header

### Patient Management

- **PatientsList** - Patient list with demographics and loading states
- **Demographics** - Patient demographics display
- **Gender** - Gender display component
- **GenderIcon** - Gender icon component

### Actions & Buttons

- **ActionCard** - Card with icon, title, subtitle, and action
- **ActionCardButton** - Button variant for action cards
- **AddButton** - Add/create action button
- **BurgerButton** - Hamburger menu toggle
- **ButtonPair** - Paired button layout
- **IconButton** - Icon-only button

### Badges & Status

- **ActiveStatus** - Active/inactive status badge
- **PermissionBadge** - User permission level badge
- **UnreadBadge** - Unread message count badge

### State Messages

- **StateMessage** - System state message component for database initialisation and empty states

### Clinical Features

- **LetterList** - Letter list view
- **LetterView** - Individual letter display
- **NotesList** - Clinical notes list
- **AppointmentsList** - Appointment history display

### Documents

- **Document** - Document viewer
- **DocumentThumbnail** - Document thumbnail preview
- **DocumentsList** - Document list display

### Messaging

- **Messaging** - Messaging interface component
- **MessagesList** - Message thread list
- **MessagingTriagePayment** - Payment workflow component
- **NewMessageModal** - New message creation modal

### Forms & Data Entry

- **MultiStepForm** - Multi-step form wizard
- **DirtyFormNavigation** - Unsaved changes navigation guard
- **SearchFields** - Collapsible search input component
- **SolidSwitch** - Toggle switch component

### Icons & Images

- **Icon** - Icon wrapper component with size variants

### Tables & Data Display

- **AdminTable** - Configurable admin data table
- **StatCard** - Statistics card component
- **Admin** - Admin dashboard component

## Notable Stories

### Loading States & FHIR Initialization

The **PatientsList** component includes comprehensive loading state stories demonstrating the application's behavior during FHIR server initialization:

#### AnimatedLoadingSequence

A 30-second animated story showing the complete startup flow:

1. **Health check phase** (0-5s): System checks if FHIR server is ready
2. **Database initialising** (5-10s): Shows "Database is initialising" message with clock icon (blue alert)
3. **Fetching patients** (10-15s): Skeleton loading UI with animated pulse effect
4. **Patient list loaded** (15-30s): Displays mock patient data

This story provides visual documentation of expected UX during system startup and helps validate that loading states are visually distinct and user-friendly.

- **File**: `frontend/src/components/patients/PatientsList.stories.tsx`
- **Story**: `AnimatedLoadingSequence`
- **Purpose**: Visual regression testing, UX documentation, startup flow validation

#### StateMessage Component

The **StateMessage** component provides consistent system state messaging across the application:

- **Database Initialising**: Blue alert with `IconClock`, message: "The Quill databases are just warming up. This may take a few moments..."
  - Used when FHIR server is starting up or search indexes are building
  - Prevents showing "failed to load" errors during startup window
  - Linked to Hazard-0046 (Backend starts before FHIR ready) mitigation

- **No Patients**: Gray alert with `IconUserOff`, message: "There are currently no patients in the system. New patients can be added by administrators."
  - Used when FHIR server is ready but patient list is genuinely empty
  - Visually distinct from initialization state (different color and icon)
  - Linked to Hazard-0019 (FHIR health check false negative) mitigation

**Implementation**: The StateMessage component is used by PatientsList based on the `fhirAvailable` prop, which is determined by frontend health polling and conservative readiness tracking.

## Running Storybook

### Development Mode

Start the Storybook development server:

```bash
cd frontend
yarn storybook
```

This launches Storybook at `http://localhost:6006` with hot reload enabled.

### Building Static Storybook

Build a static version of Storybook for deployment:

```bash
cd frontend
yarn storybook:build
```

The static build outputs to `docs/docs/code/storybook/` and is integrated with the MkDocs documentation site.

## Documentation Standards

All story files follow these conventions:

1. **File Naming**: `ComponentName.stories.tsx`
2. **TSDoc Comments**: Comprehensive documentation with `@param`, `@returns`, `@example`
3. **Story Exports**: Named exports for each component variation
4. **Default Export**: Component metadata (title, component, parameters)

### Example Story Structure

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { ComponentName } from "./ComponentName";

/**
 * Component description
 * @component
 */
const meta: Meta<typeof ComponentName> = {
  title: "Category/ComponentName",
  component: ComponentName,
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

/**
 * Default component state
 */
export const Default: Story = {
  args: {
    // props
  },
};
```

## Component Testing

While Storybook provides visual testing, unit tests for components are located in:

```
frontend/src/test/
```

Tests use **Vitest** with `@testing-library/react` and share test utilities (`renderWithMantine`, `renderWithRouter`) to ensure consistency with Storybook decorators.

## Accessibility Testing

**Planned**: The `@storybook/addon-a11y` addon is installed (version 10.2.7) but not yet configured in `.storybook/main.ts`. When enabled, this addon provides:

- WCAG violation detection
- Colour contrast analysis
- Keyboard navigation testing
- Screen reader simulation

## Further Documentation

- **Component API Docs**: See [TypeDoc documentation](../code/frontend/)
- **Component Tests**: See individual `.test.tsx` files in `frontend/src/test/`
- **Storybook Official Docs**: [storybook.js.org](https://storybook.js.org/)
