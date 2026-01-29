# Design System & UX Approach

## Overview

This project follows a **minimalist, technical Proton-like design philosophy** with a focus on clarity, consistency, and efficiency. The design system is centralized in CSS variables and reusable components to ensure a unified experience across all applications.

---

## Design System

### Color Palette

#### Primary Colors
- **Primary Purple**: `#6d4aff` - Main brand color for primary actions and accents
- **Primary Hover**: `#5836e8` - Hover state for primary elements
- **Primary Active**: `#4a2bc4` - Active/pressed state
- **Primary Light**: `#f5f3ff` - Light background for selected/active states

#### Semantic Colors
- **Danger Red**: `#dc2626` - Destructive actions
- **Danger Hover**: `#b91c1c` - Hover state for danger actions
- **Danger Light**: `#fef2f2` - Light background for danger states
- **Success Green**: `#059669` - Success indicators
- **Warning Yellow**: `#fbbf24` - Warning indicators

#### Neutral Colors
- **Text Primary**: `#1c1f23` - Main text color
- **Text Secondary**: `#464c52` - Secondary text
- **Text Tertiary**: `#70757a` - Tertiary/muted text
- **Text Disabled**: `#9ca3af` - Disabled state text
- **Border**: `#dde1e6` - Default borders
- **Border Light**: `#f0f1f3` - Light borders
- **Border Dark**: `#c1c7cd` - Emphasized borders
- **Background**: `#f8f9fa` - Main background
- **Background White**: `#ffffff` - Card/panel background
- **Background Hover**: `#f5f6f8` - Hover states

### Border Radius

Following a subtle, technical aesthetic:
- **Small (4px)**: Cards, buttons, inputs, small elements
- **Medium (6px)**: Larger containers, columns, panels
- **Large (10px)**: Modal dialogs, major sections
- **Pill (12px)**: Badges, tags, counters

**Principle**: Prefer `4px` for most elements. Use `6px` only for larger structural components.

### Spacing Scale

Consistent 4px-based spacing system:
- **XS**: `4px` - Minimal gaps
- **SM**: `8px` - Tight spacing
- **MD**: `12px` - Default spacing
- **LG**: `16px` - Comfortable spacing
- **XL**: `20px` - Generous spacing
- **2XL**: `24px` - Section spacing

### Shadows

Subtle elevation system:
- **Small**: `0 1px 2px rgba(0, 0, 0, 0.05)` - Minimal lift
- **Medium**: `0 1px 3px rgba(0, 0, 0, 0.1)` - Default cards
- **Large**: `0 2px 8px rgba(0, 0, 0, 0.15)` - Elevated elements, dropdowns

### Typography

- **Font Family**: System fonts for optimal performance and native feel
- **Sizes**:
  - Headers: `1.75rem` (28px) for h1, `1.5rem` (24px) for h2
  - Body: `0.9375rem` (15px) for main content
  - Small: `0.875rem` (14px) for secondary text
  - Tiny: `0.8125rem` (13px) for tertiary text

### Transitions

- **Fast**: `0.15s` - Hover effects, subtle changes
- **Normal**: `0.2s` - Default transitions

---

## UX Approach

### Information Architecture

All four applications (Notes, Journal, Lists, Boards) follow a consistent **three-panel layout**:

```
┌─────────────┬──────────────┬─────────────────┐
│   Sidebar   │    Middle    │   Main Content  │
│   (Folders/ │    (Items/   │   (Detail View/ │
│  Collections)│   Notes/     │     Editor)     │
│             │   Entries)   │                 │
└─────────────┴──────────────┴─────────────────┘
```

#### Panel Hierarchy

1. **Left Sidebar** (280px)
   - Top-level collections (Folders, Journals, Lists, Boards)
   - Global actions (Export, Import)
   - View filters (Show archived)

2. **Middle Panel** (flexible, ~300-400px)
   - Individual items within selected collection
   - Quick preview information
   - Creation of new items

3. **Right Panel** (main, flexible)
   - Full detail view and editing interface
   - Primary actions contextual to selected item

### Action Hierarchy

#### Primary Actions
**Principle**: Most-used, most-important actions are always visible as buttons.

**Examples**:
- `+ New List` / `+ New Note` / `+ New Board`
- `Edit` (when viewing a note/entry)
- `Save` / `Cancel` (when editing)
- `📌 Pin` (frequent action in Notes)

**Style**: 
- Solid background with primary color
- Clear label (icon optional)
- Prominent placement in header/toolbar

#### Secondary Actions
**Principle**: Less-frequent but important actions are grouped in a dropdown menu (⋯).

**Examples**:
- Rename
- Archive/Unarchive
- Validate (Journal-specific)

**Style**:
- Icon-only button "⋯" that opens dropdown
- Menu items with icon + label
- Hover states for discoverability

#### Destructive Actions
**Principle**: Dangerous actions (Delete) are separated and styled distinctly.

**Location**: Always at the bottom of dropdown menus, separated by a divider line

**Style**: 
- Red text color (`--color-danger`)
- Red background on hover (`--color-danger-light`)
- Confirmation dialog before execution

### Interaction Patterns

#### Inline Editing
- Click on title/name to edit in-place
- `Enter` to save, `Escape` to cancel
- Auto-focus on edit input
- Visual indication (border color change to primary)

#### Contextual Actions
- Actions appear based on current selection and state
- Hover-triggered actions (e.g., delete button on list items)
- State-dependent labels (Archive ↔ Unarchive, Pin ↔ Unpin)

#### Keyboard Navigation
- `Enter` to confirm/save in all input fields
- `Escape` to cancel editing/close dropdowns
- Natural tab order for accessibility

#### Empty States
- Friendly, centered messages when no content exists
- Large emoji icon for visual interest
- Call-to-action hint (e.g., "Create one!")

### Visual Feedback

#### Loading States
- Disabled buttons during save operations
- "Saving..." text for async operations
- Prevent double-submissions

#### Error States
- Prominent error message banner (red background)
- Clear error text describing the issue
- Automatic dismissal or close button

#### Success Indicators
- Smooth transitions when items are created/updated
- Items appear/update without page refresh
- Sort order updates reflect latest changes

### State Management

#### Active States
- Selected items highlighted with light primary background (`--color-bg-active`)
- Clear visual distinction from hover states
- Maintains context across panel views

#### Archived Items
- Reduced opacity (50%) for archived items
- "Show archived" toggle in filters
- Archive badge/label in headers when viewing archived item

#### Pinned Items (Notes)
- Appear at top of list
- Pin indicator in item preview
- Toggle on/off in editor

### Responsive Behavior

#### Panel Collapse (Future Enhancement)
For smaller screens:
1. Hide left sidebar, show hamburger menu
2. Middle panel becomes full-width item list
3. Detail view replaces list when item selected

#### Touch Targets
- Minimum 32px height for all interactive elements
- Adequate spacing between clickable items
- No hover-only actions (all accessible via tap/click)

---

## Component Library

### DropdownMenu
**Purpose**: Consistent menu component for secondary actions

**Features**:
- Icon + label menu items
- Danger variant for destructive actions
- Separator lines for grouping
- Click-outside and Escape-key dismissal
- Left/right alignment options

**Usage**:
```tsx
<DropdownMenu
  items={[
    { label: 'Rename', icon: '✏️', onClick: handleRename },
    { label: 'Archive', icon: '📦', onClick: handleArchive },
    { separator: true, label: '', onClick: () => {} },
    { label: 'Delete', icon: '🗑️', onClick: handleDelete, variant: 'danger' },
  ]}
/>
```

### Button Variants
Defined in `design-system.css`:
- `.btn-primary` - Main actions (purple background)
- `.btn-secondary` - Alternative actions (gray background)
- `.btn-danger` - Destructive actions (red background)
- `.btn-icon` - Icon-only buttons (32x32px)
- `.btn-small` - Compact buttons for dense UIs

### Form Inputs
- Consistent padding: `8px 12px`
- Border color: `--color-border` (default), `--color-primary` (focus)
- Border radius: `--radius-sm` (4px)
- Transitions on focus for smooth interaction

### Badges & Labels
- Small, rounded indicators
- Semantic colors (archived, pinned, etc.)
- Fixed padding for consistent sizing

---

## Design Principles

### 1. **Consistency First**
Every application follows the same patterns:
- Same layout structure
- Same action placement
- Same visual language
- Same interaction behaviors

### 2. **Progressive Disclosure**
- Show most important information and actions by default
- Hide less-frequent actions in organized menus
- Expand details on demand (e.g., card descriptions)

### 3. **Minimize Cognitive Load**
- Clear visual hierarchy
- Familiar interaction patterns
- Predictable behavior across apps
- Minimal clicks to complete tasks

### 4. **Technical Aesthetic**
- Subtle, not flashy
- Functional, not decorative
- Precise, not rounded
- Clean, not cluttered

### 5. **Accessibility & Performance**
- Semantic HTML
- Keyboard navigation support
- High contrast ratios
- Fast, lightweight CSS

---

## Implementation Guidelines

### Adding New Features

1. **Check Design System First**: Use existing CSS variables and components
2. **Follow Layout Patterns**: Maintain three-panel structure
3. **Use DropdownMenu**: For any secondary/tertiary actions
4. **Apply Spacing Scale**: Use `--spacing-*` variables
5. **Match Existing Patterns**: Look at similar features in other apps

### Modifying Styles

1. **Update Variables**: Change `design-system.css` for global updates
2. **Component-Specific**: Add styles only for unique component needs
3. **Avoid Magic Numbers**: Always use design system values
4. **Test Across Apps**: Ensure changes work in all four applications

### Creating New Components

1. **Evaluate Reusability**: Can this be used across multiple apps?
2. **Follow Naming**: Use BEM-like class naming (`.component-name-element`)
3. **Use CSS Variables**: Reference design system colors, spacing, etc.
4. **Document Usage**: Add examples and guidelines

---

## Future Enhancements

### Planned Improvements
- [ ] Dark mode support (duplicate CSS variables with dark theme)
- [ ] Mobile responsive layouts (panel collapse)
- [ ] Enhanced accessibility (ARIA labels, screen reader support)
- [ ] Animation library (consistent micro-interactions)
- [ ] Icon system (replace emoji with SVG icons)

### Consideration Areas
- Keyboard shortcuts documentation
- Undo/redo functionality UI
- Bulk actions (select multiple items)
- Drag-and-drop visual feedback enhancement
- Real-time collaboration indicators

---

## Conclusion

This design system provides a solid foundation for consistent, usable, and maintainable applications. By centralizing design decisions and following established patterns, we ensure that:

- New features integrate seamlessly
- Users have a predictable experience
- Code remains clean and DRY
- Future updates are easier to implement

For questions or suggestions, refer to this document and existing implementations in Notes, Journal, Lists, and Boards.
