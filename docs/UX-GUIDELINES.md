# UX Guidelines for Cryptd Applications

This document defines consistent UX patterns across all Cryptd applications (Notes, Lists, Journal, Boards).

## Version
**Version:** 1.0  
**Last Updated:** January 29, 2026

---

## Table of Contents
1. [Button Consistency](#button-consistency)
2. [Naming Conventions](#naming-conventions)
3. [Archive Functionality](#archive-functionality)
4. [Export/Import Actions](#exportimport-actions)
5. [View Filters](#view-filters)
6. [Empty States](#empty-states)
7. [Form Actions](#form-actions)
8. [Icon Usage](#icon-usage)

---

## 1. Button Consistency

### 1.1 Button Heights
All buttons of the same category **must** have identical padding for consistent heights.

**Primary Action Buttons** (Save, Add Entry, etc.):
```css
padding: 9px 18px;
```

**Secondary Action Buttons** (Cancel, Pin, Archive, etc.):
```css
padding: 9px 18px;
```

**Small Buttons** (in forms):
```css
padding: 6px 12px;
```

**Icon-only Buttons**:
```css
width: 32px;
height: 32px;
padding: 0;
```

### 1.2 Button Classes
- `.btn-primary` - Main actions (Save, Add, Create)
- `.btn-secondary` - Alternative actions (Pin, Archive)
- `.btn-danger` - Destructive actions (Delete)
- `.btn-icon` - Icon-only buttons for non-destructive actions
- `.btn-icon-danger` - Icon-only buttons for destructive actions
- `.btn-save-small` - Small save buttons in inline forms
- `.btn-cancel-small` - Small cancel buttons in inline forms

---

## 2. Naming Conventions

### 2.1 "New" Button Labels
All "New" buttons should follow the pattern: `+ New [ItemType]`

**Required format:**
- Notes: `+ New Folder`
- Lists: `+ New List`
- Journal: `+ New Journal`
- Boards: `+ New Board`

**When creating items within a context:**
- Notes: `+ New Note` (inside a folder)
- Lists: `+ New Item` (inside a list)
- Journal: `Add Entry` (inside a journal - button style)
- Boards: `+ Add column` (when adding columns), `+ Add a card` (when adding cards)

### 2.2 Item Naming
Use consistent terminology:
- **Container Level**: Folder, List, Journal, Board
- **Item Level**: Note, Item, Entry, Card/Column

---

## 3. Archive Functionality

### 3.1 Availability
**All applications** must support archiving at both container and item levels:
- **Notes**: Folders and Notes can be archived
- **Lists**: Lists and Items can be archived
- **Journal**: Journals and Entries can be archived
- **Boards**: Boards and Columns/Cards can be archived

### 3.2 Archive UI Elements

**Container Level (Folder/List/Journal/Board):**
- Icon button with emoji: 📦 (Archive) or 📂 (Unarchive)
- Button title attribute: "Archive [type]" or "Unarchive [type]"
- Located in header actions next to Edit/Delete

**Item Level:**
- Button/action in item actions menu
- Label: "Archive" or "Unarchive"

### 3.3 Archive Badge
Archived items show:
- Badge emoji: 📦
- Reduced opacity: `opacity: 0.6`
- Label (when expanded): "Archived" or "📦 Archived"

---

## 4. Export/Import Actions

### 4.1 Button Layout
Export and Import buttons should:
- Be placed in sidebar under the main header
- Use a horizontal flex layout with equal width
- Include emoji icons for visual clarity

### 4.2 Button Style
```
📥 Export | 📤 Import
```

**CSS Classes:**
- `.btn-export` for Export button
- `.btn-import` for Import button

**Emoji prefix:**
- Export: 📥
- Import: 📤

### 4.3 Button Text
Always include text label with emoji:
- "📥 Export" (not just "Export")
- "📤 Import" (not just "Import")

---

## 5. View Filters

### 5.1 "Show archived" Checkbox
**All applications** must include a "Show archived" checkbox filter.

**Location:** In sidebar, below Export/Import actions, above the items list.

**Structure:**
```html
<div className="view-filters">
  <label className="filter-checkbox">
    <input
      type="checkbox"
      checked={showArchived}
      onChange={(e) => setShowArchived(e.target.checked)}
    />
    <span>Show archived</span>
  </label>
</div>
```

### 5.2 Additional Filters
Applications may have additional app-specific filters (e.g., Lists has "Show checked").

All filters should follow the same checkbox pattern and be grouped in the `.view-filters` section.

---

## 6. Empty States

### 6.1 Empty State Messages
Use consistent, helpful messages:

**No containers:**
- "No [containers] yet. Create one!"
- Example: "No folders yet. Create one!"

**No active containers (when filtered):**
- "No active [containers]. Create one!"

**With archive filter on:**
- "No [containers] yet."

**No items in container:**
- "No [items] in this [container]."
- Example: "No notes in this folder."

### 6.2 Empty State Icons
Use relevant emoji icons:
- Notes: 📝
- Lists: ✅
- Journal: 📔 (sidebar), ✍️ (entries)
- Boards: 📋

---

## 7. Form Actions

### 7.1 Inline Create Forms
When creating new containers (folder, list, journal, board):

1. Input field appears inline
2. Two buttons below: "Create" and "Cancel"
3. Enter key triggers save
4. Escape key triggers cancel

### 7.2 Button Labels
- Create mode: "Create" (not "Save")
- Edit mode: "Save"
- Always pair with "Cancel"

### 7.3 Button Layout
```html
<div className="form-actions">
  <button className="btn-save-small">Create</button>
  <button className="btn-cancel-small">Cancel</button>
</div>
```

---

## 8. Icon Usage

### 8.1 Standard Icons
Use these emoji icons consistently:

**Actions:**
- Edit/Rename: ✏️
- Delete: 🗑️
- Archive: 📦
- Unarchive: 📂
- Pin: 📌
- Export: 📥
- Import: 📤

**Item States:**
- Pinned: 📌
- Archived: 📦
- Checked/Complete: ✅
- Calendar/Date: 📅

**Application Icons:**
- Notes: 📝
- Lists: ✅
- Journal: 📔, ✍️
- Boards: 📋

### 8.2 Icon Button Accessibility
All icon-only buttons must have `title` attributes for accessibility:
```html
<button className="btn-icon" title="Edit folder">
  ✏️
</button>
```

---

## Implementation Checklist

When creating or updating an application, ensure:

- [ ] "New" button follows `+ New [ItemType]` pattern
- [ ] Export/Import buttons have emoji icons
- [ ] Archive functionality exists for containers and items
- [ ] "Show archived" checkbox is present
- [ ] All buttons of same type have consistent heights
- [ ] Icon buttons have title attributes
- [ ] Empty states use standard messages
- [ ] Form action buttons use "Create"/"Save"/"Cancel" labels

---

## Notes on Application-Specific Features

While consistency is key, some applications may have unique features:

- **Journal**: Daily mode, month grouping (application-specific)
- **Boards**: Drag-and-drop, columns (application-specific)
- **Lists**: Item checking, checked/unchecked filter (application-specific)
- **Notes**: Pinning, folder-note hierarchy (application-specific)

These features are acceptable as long as they follow the core UX principles outlined above.
