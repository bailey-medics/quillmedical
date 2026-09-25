# Storybook

**Status:** Storybook is configured and operational with 145 story files covering core UI components. Component documentation and interactive development environment are available.

## Overview

Quill Medical uses [Storybook 10.3.3](https://storybook.js.org/) as an interactive component development and documentation tool. Storybook allows developers to:

- Develop UI components in isolation
- Document component props and variations
- Test components visually across different states
- Share living documentation with the team

## Configuration

Storybook is configured with:

- **Framework**: React + Vite integration (`@storybook/react-vite`)
- **Version**: 10.3.6
- **Dev Server**: Port 6006
- **Build Output**: `docs/docs/code/storybook/` (deployed with MkDocs documentation)

### Decorators

All stories are wrapped with essential providers via a `createMemoryRouter`:

```tsx
<RouterProvider
  router={createMemoryRouter([
    {
      path: "*",
      element: (
        <AuthProvider>
          <MantineProvider theme={theme}>
            <AuthWrapper>{Story()}</AuthWrapper>
          </MantineProvider>
        </AuthProvider>
      ),
    },
  ])}
/>
```

This ensures components have access to:

- **Authentication context** (AuthProvider)
- **Mantine theming and components** (MantineProvider)
- **React Router navigation** (MemoryRouter)

### Story Sorting

Stories are alphabetically sorted in the sidebar for easy navigation.

## Available Stories

The project includes **145 component story files** across various UI categories:

### Core Components

- **Date** - Date display formatting
- **NationalNumber** - National identifier display
- **MarkdownView** - Markdown content rendering
- **ProfilePic** - User avatar with gradient colours
- **StackedProfilePics** - Overlapping avatar group display
- **QuillLogo** - Brand logo component
- **QuillName** - Brand name component

### Typography

- **BodyText**, **BodyTextBold**, **BodyTextClamp**, **BodyTextInline**, **BodyTextMuted** - Body text variants
- **ErrorText** - Error message text with alert icon
- **HeaderText** - Heading text
- **HyperlinkText** - Internal navigation link
- **PageHeader** - Page title and description header
- **PlaceholderText** - Placeholder text
- **PublicText**, **PublicTitle** - Public-facing typography

### Navigation & Layout

- **Complete** - Full page layout compositions
- **CompletePatientList** - Full page layout with patient list
- **MainLayout** - Primary application layout
- **NavigationDrawer** - Mobile navigation drawer
- **NotFoundLayout** - 404 error page layout
- **PublicLayout** - Public-facing page layout
- **PublicNotFound** - Public 404 error page
- **SideNav** - Sidebar navigation component
- **TopRibbon** - Header ribbon component
- **PublicTopRibbon** - Public-facing header ribbon
- **NavIcon** - Navigation icon component
- **PublicNavIcon** - Public-facing navigation icon
- **Footer** - Application footer component
- **PublicFooter** - Public-facing footer component

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
- **ButtonPairRed** - Paired button layout with destructive action styling
- **IconButton** - Icon-only button
- **IconTextButton** - Icon with text button
- **PreviousNextButton** - Previous/next navigation button pair
- **PublicBurgerButton** - Public-facing hamburger menu toggle
- **PublicButton** - Public-facing button
- **SearchButton** - Search toggle button for the top ribbon

### Badges & Status

- **ActiveStatus** - Active/inactive status badge
- **AppointmentStatus** - Appointment status badge
- **AssessmentResultBadge** - Assessment result badge
- **LetterStatusBadge** - Letter status badge
- **NoteCategoryBadge** - Note category badge
- **OnQuillBadge** - On Quill status badge
- **PassFailIcon** - Atomic pass/fail indicator icons (PassIcon + FailIcon)
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

- **MultiSelectField** - Multi-select dropdown field
- **MultiStepForm** - Multi-step form wizard
- **DirtyFormNavigation** - Unsaved changes navigation guard
- **PasswordField** - Password input with visibility toggle
- **SearchFields** - Collapsible search input component
- **SelectField** - Dropdown select field
- **SolidSwitch** - Toggle switch component
- **TextField** - Text input field
- **TextAreaField** - Multi-line text input field
- **SelectField** - Dropdown select field
- **MultiSelectField** - Multi-value select field

### Icons & Images

- **Icon** - Icon wrapper component with size variants
- **NavIcon** - Navigation icon
- **PublicNavIcon** - Public-facing navigation icon

### Backgrounds

- **PublicDarkBackground** - Dark background component
- **PublicHeroBackground** - Hero section background
- **PublicLightBackground** - Light background component

### Cards

- **ActionCard** - Card with icon, title, subtitle, and action (see Actions & Buttons)
- **PublicFeatureCard** - Feature highlight card
- **PublicInfoCard** - Public-facing informational card
- **StatCard** - Statistics card component

### Tables & Data Display

- **DataTable** - Configurable responsive data table
- **Admin** - Admin dashboard component

### Teaching

- **AssessmentClosing** - Assessment closing/completion screen
- **AssessmentHistoryTable** - Assessment history data table
- **AssessmentIntro** - Assessment introduction screen
- **AssessmentProgress** - Assessment progress indicator
- **AssessmentResult** - Assessment result display
- **AssessmentTimer** - Assessment countdown timer
- **CertificateDownload** - Certificate download component
- **ExamCloseButton** - Button to close/abandon an exam early
- **ItemManagementTable** - Teaching item management table
- **QuestionBankCard** - Question bank card component
- **QuestionView** - Question display component
- **ScoreBreakdown** - Score breakdown display
- **SyncResultsPanel** - Sync results table with status display
- **TeachingProgressBar** - Teaching progress bar
- **VideoPlayer** - Video player component
- **Callout** - Callout/highlight component
- **Figure** - Figure/image component with caption
- **SlideViewer** - Slide deck viewer

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

While Storybook provides visual testing, unit tests for components are co-located alongside the component files in `frontend/src/components/`. For example:

```
frontend/src/components/
└── messaging/
    ├── Messaging.tsx
    ├── Messaging.stories.tsx
    └── Messaging.test.tsx
```

Shared test utilities (`renderWithMantine`, `renderWithRouter`, `MockAuthProvider`) are in `frontend/src/test/`.

Tests use **Vitest** with `@testing-library/react` and share test utilities to ensure consistency with Storybook decorators.

## Accessibility Testing

Every story is checked against WCAG 2.2 AA by [axe-core](https://github.com/dequelabs/axe-core) through `@storybook/addon-a11y`, in light mode and again in dark mode. A violation fails the Storybook interaction tests in the heavy CI tier, which runs on pull requests that are not drafts. The wider programme, and what automation cannot see, is in the [accessibility plan](../../plans/2026-09-20-accessibility-plan.md).

### What runs, and where it is configured

- **The rules** — `parameters.a11y` in `.storybook/preview.tsx`: the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags, plus `target-size` (WCAG 2.5.8), which axe ships switched off. `test: "error"` makes a violation fail the test.
- **The light pass** — the addon checks each story as it renders, which is light mode unless the story pins a scheme.
- **The dark pass** — `.storybook/a11y-dark-mode.ts` switches the `colorScheme` global to dark after each story, waits for it to re-render, and checks it again. It is loaded as a Jest setup file by `frontend/test-runner-jest.config.js`, not as `.storybook/test-runner.ts`, because Storybook 10 loads that file in a way Jest 30.5 refuses; the reason is in the file's header.
- **Not checked** — stories tagged `!test`, and anything a story does not render. A story that renders nothing passes, so a component gated on a competency needs the mock user in `preview.tsx` to hold it.

### Running the checks locally

- `just sbtci` starts Storybook, runs every story's tests including both a11y passes, and stops it. This is what CI runs.
- `just sbt` runs the same tests against a Storybook already running from `just sb`.
- To check a few files, run `yarn test-storybook --url http://localhost:6006 src/path/to/Thing.stories.tsx` in `frontend/`.
- **Restart Storybook after changing `.storybook/main.ts`.** A server started before a change there does not pick it up, and the test-runner then fails every story with `ReferenceError: Cannot access 'StorybookTestRunnerError' before initialization`, which says nothing about the real cause.

### Reading a failure

A light-mode failure in the test output looks like this:

```text
Expected the HTML found at $('.m_220c80f2') to have no violations:
<button class="… mantine-Modal-close …" type="button">
Received:
"Buttons must have discernible text (button-name)"
Fix any of the following:
  aria-label attribute does not exist or is empty
  …
```

- **The rule id** is in brackets at the end of the "Received" line (`button-name`). The rule's page, linked at the foot of the message, explains the WCAG criterion and the usual fixes.
- **The selector** after "HTML found at" is the failing element. Mantine class names such as `m_220c80f2` are not stable, so find the element by the HTML printed underneath rather than by the class.
- **The "Fix any of the following" list** is the set of ways to pass; one is enough.
- **Only the first failing element is printed.** Open the story's link, printed at the top of the message with `addonPanel=storybook/a11y/panel`, to see them all.

A dark-mode failure is printed by the dark pass instead, as the story title with "(dark mode)" and a list of rule ids with the failing selectors. To see it in the browser, switch the **Colour scheme** toolbar button to dark.

In the Storybook browser, the **Accessibility** tab under each story lists **Violations**, **Passes** and **Incomplete**. Expanding a violation and choosing **Highlight** outlines the failing elements on the canvas. "Incomplete" means axe could not decide, usually contrast over an image or gradient; it does not fail the test, but deserves a look.

### When a story needs different rules

Fix the component rather than the rule wherever possible: a contrast failure is usually a colour token that fails everywhere it is used, and fixing the token fixes every component at once. When a story genuinely must differ, override it on that story only, with a comment saying why:

```tsx
export const SwatchSamples: Story = {
  parameters: {
    a11y: {
      // Shows the placeholder grey as a swatch; it is never used for text
      config: { rules: [{ id: "color-contrast", enabled: false }] },
    },
  },
};
```

- **Never switch a rule off in `preview.tsx`.** That removes it for every story, including the ones it would catch next.
- **`test: "todo"` on one story** reports without failing, for a known failure being fixed in a follow-up. Say which in the comment.
- **`disable: true`** skips the story's checks entirely, and should need a very good reason.

## Further Documentation

- **Component API Docs**: See [TypeDoc documentation](../code/frontend/)
- **Component Tests**: See individual `.test.tsx` files in `frontend/src/components/`
- **Storybook Official Docs**: [storybook.js.org](https://storybook.js.org/)
