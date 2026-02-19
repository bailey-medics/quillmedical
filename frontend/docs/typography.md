# Typography System

This document describes the standardised typography system for Quill Medical, aligned with NHS design system accessibility standards.

## Font Size System

The application uses a **4-size responsive typography system** to maintain consistency and improve readability. All font sizes are defined in [`src/theme.ts`](../src/theme.ts) and scale responsively via [`src/styles/typography.css`](../src/styles/typography.css).

### The 4 Standard Sizes (Responsive)

| Size        | Mobile (Base)     | Desktop (≥768px)   | Usage                                                    |
| ----------- | ----------------- | ------------------ | -------------------------------------------------------- |
| `xs` / `sm` | `0.875rem` (14px) | `1rem` (16px)      | Captions, hints, metadata, secondary information, badges |
| `md`        | `1rem` (16px)     | `1.1875rem` (19px) | Body text, default text size, form labels (NHS standard) |
| `lg`        | `1.25rem` (20px)  | `1.5rem` (24px)    | Subheadings, section titles, card titles                 |
| `xl`        | `1.625rem` (26px) | `2rem` (32px)      | Page headings, primary titles, hero text                 |

**Note:** `xs` and `sm` are intentionally the same size to reduce complexity while maintaining Mantine's API.

### NHS Design System Alignment

This typography system follows [NHS design system guidelines](https://service-manual.nhs.uk/design-system/styles/typography):

- **Default body text: 19px on desktop** (not 16px) for improved readability
- **Responsive scaling**: Smaller on mobile (space efficiency), larger on desktop (accessibility)
- **Mobile-first approach**: Base sizes optimized for small screens
- **Tested with users**: Including those with dyslexia and color blindness
- **Generous line heights**: Improved readability for clinical content

### Responsive Breakpoint

Font sizes scale up at **768px (48em)** to provide optimal readability on tablet and desktop devices while remaining efficient on mobile.

## Usage Guidelines

### Text Component

```tsx
import { Text } from "@mantine/core";

// Small text (captions, metadata, hints)
<Text size="sm" c="dimmed">Last updated 2 hours ago</Text>

// Body text (default - can omit size prop)
<Text>This is regular body text.</Text>
<Text size="md">This is also body text.</Text>

// Larger text (emphasis, callouts)
<Text size="lg">Important information</Text>
```

### Title/Heading Components

```tsx
import { Title } from "@mantine/core";

// Page heading (h1)
<Title order={1}>Patient Administration</Title>

// Section heading (h2)
<Title order={2}>Demographics</Title>

// Subsection heading (h3)
<Title order={3}>Contact Details</Title>

// Card heading (h4)
<Title order={4}>Recent Activity</Title>
```

Heading font sizes are automatically mapped:

- `h1` → 1.75rem (xl)
- `h2` → 1.5rem (between lg and xl)
- `h3` → 1.25rem (lg)
- `h4` → 1rem (md)
- `h5` → 0.875rem (sm)
- `h6` → 0.875rem (sm)

### PageHeader Component

The PageHeader component accepts a `size` prop that maps to these standards:

```tsx
<PageHeader
  title="User Management"
  description="Create and manage user accounts"
  size="lg" // Uses xl for title, md for description
/>
```

## What NOT to Do

### ❌ Avoid Inline Font Sizes

```tsx
// DON'T DO THIS
<Text style={{ fontSize: 12 }}>Small text</Text>
<Text style={{ fontSize: "0.75rem" }}>Tiny text</Text>

// DO THIS INSTEAD
<Text size="sm">Small text</Text>
```

### ❌ Avoid Non-Standard Sizes

```tsx
// DON'T DO THIS
<Text fz="0.9rem">Slightly smaller</Text>
<Title order={2} fz="1.8rem">Custom size</Title>

// DO THIS INSTEAD
<Text size="sm">Small text</Text>
<Title order={2}>Standard heading</Title>
```

### ❌ Avoid CSS Font Sizes

```tsx
// DON'T DO THIS
<div className={classes.customText}>Text</div>
// with .customText { font-size: 15px; }

// DO THIS INSTEAD
<Text size="md">Text</Text>
```

## Common Use Cases

### Metadata and Captions

```tsx
<Text size="sm" c="dimmed">
  Created by Dr. Smith on 15/02/2026
</Text>
```

### Error Messages

```tsx
<Text size="sm" c="red">
  This field is required
</Text>
```

### Badges and Labels

```tsx
<Badge size="sm">Active</Badge>
<Text size="sm" fw={500}>Status:</Text>
```

### Form Descriptions

```tsx
<TextInput
  label="Email"
  description={
    <Text size="sm" c="dimmed">
      We'll never share your email
    </Text>
  }
/>
```

### Card Titles

```tsx
<Card>
  <Title order={3} size="lg" mb="md">
    Patient Details
  </Title>
  <Text size="md">Regular card content...</Text>
</Card>
```

### Empty States

```tsx
<Text size="lg" fw={600} mb="xs">
  No patients found
</Text>
<Text size="sm" c="dimmed">
  There are currently no patients in the system.
</Text>
```

## Exceptions

There are very few valid reasons to deviate from the 4-size system:

1. **Interactive navigation elements** may use dynamic sizing for accessibility
2. **Test fixtures and stories** may use specific sizes for demonstration
3. **Third-party component integration** may require exact pixel values

If you need a size not in the system, consider:

1. Whether one of the 4 sizes would work with different font weight or spacing
2. Whether the design needs adjustment rather than the typography
3. Discussing with the team before adding a new size

## Theme Configuration

The typography system is configured in [`src/theme.ts`](../src/theme.ts):

```typescript
export const theme = createTheme({
  fontSizes: {
    xs: "0.875rem", // 14px mobile → 16px desktop
    sm: "0.875rem", // 14px mobile → 16px desktop
    md: "1rem", // 16px mobile → 19px desktop (NHS standard)
    lg: "1.25rem", // 20px mobile → 24px desktop
    xl: "1.625rem", // 26px mobile → 32px desktop
  },
  // ... other theme settings
});
```

Responsive scaling is implemented in [`src/styles/typography.css`](../src/styles/typography.css) using CSS custom properties that override Mantine's default font sizes at the 768px breakpoint.

This theme is applied to all MantineProvider instances throughout the application.

## Benefits of This System

1. **Accessibility** - Aligned with NHS design system standards, tested with users with dyslexia and color blindness
2. **Responsive** - Optimal readability on all devices: efficient on mobile, comfortable on desktop
3. **Consistency** - Uniform typography across all pages and components
4. **NHS Compliance** - 19px default body text on desktop matches NHS recommendations
5. **Maintainability** - Easy to adjust app-wide typography from central theme
6. **Performance** - Fewer font sizes mean better browser rendering
7. **Design speed** - Clear guidelines speed up development
8. **Clinical safety** - Consistent, readable typography reduces misreading risk

## Accessibility Features

Following NHS design system best practices:

- **Larger default text**: 19px body text on desktop (not 16px) for improved readability
- **Generous line heights**: 1.5-1.6 for comfortable reading
- **Left-aligned text**: Helps users with screen magnifiers
- **Responsive scaling**: Adapts to device capabilities
- **Tested with users**: Including those with visual impairments and cognitive differences

## Testing Responsive Behavior

To verify responsive font scaling:

1. Open application in browser (desktop view)
2. Use browser DevTools to view computed styles
3. Resize browser window below 768px width
4. Observe font sizes scale down for mobile efficiency
5. Expand window above 768px
6. Observe font sizes scale up for desktop readability

Example: Body text (`<Text size="md">`) will be 16px on mobile and 19px on desktop.

## Related Files

- [`src/theme.ts`](../src/theme.ts) - Theme configuration (base sizes)
- [`src/styles/typography.css`](../src/styles/typography.css) - Responsive scaling implementation
- [`src/components/page-header/PageHeader.tsx`](../src/components/page-header/PageHeader.tsx) - Page header sizes
- [`src/stories/Typography.stories.tsx`](../src/stories/Typography.stories.tsx) - Visual examples
- [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) - Coding conventions
- [NHS Typography Guidelines](https://service-manual.nhs.uk/design-system/styles/typography) - Reference standards
