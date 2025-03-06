# DataExtractor Component

## Overview

The `DataExtractor` component is a specialized UI component designed to display extracted data elements from processed documents in a tabular format. It serves as a crucial part of the document processing workflow, allowing users to view and select extracted elements for further operations like redaction or data extraction.

## Core Functionality

The DataExtractor component provides a clean, structured view of extracted data elements with the following key features:

### 1. Data Presentation

- **Tabular Display**: Presents extracted elements in a well-organized table with columns for selection, field name, value, and confidence score
- **Empty State Handling**: Shows a user-friendly message when no data is available
- **Field Categorization**: Visually identifies special categories like PII (Personally Identifiable Information) with badges

### 2. Selection Mechanism

- **Checkbox Selection**: Provides checkboxes for selecting individual data elements
- **Selection Callback**: Communicates selection changes back to parent components
- **Interactive Field Labels**: Makes entire row labels clickable for better usability

### 3. Visual Indicators

- **Action Indicators**: Color-coded badges indicate the configured action for each element (Redact, Extract, ExtractAndRedact)
- **Confidence Display**: Shows confidence scores as percentages to indicate extraction reliability
- **Field Status Visualization**: Distinguishes between found and missing fields

## Technical Architecture

### Component Props

The DataExtractor component accepts the following props via the `DataExtractorProps` interface:

```tsx
interface DataExtractorProps {
  data: DocumentData | null;         // Document data containing metadata
  elements: RedactionElement[];      // Array of extracted elements to display
  selectedElements: string[];        // IDs of currently selected elements
  onElementSelect: (fieldId: string) => void; // Callback for selection changes
}
```

### Data Models

The component works with these key data structures:

- `DocumentData`: Contains metadata about the processed document
- `RedactionElement`: Basic element with text, confidence, and bounding box
- `ExtendedRedactionElement`: Enhanced element with additional metadata like label, type, and action

### Key Features

1. **Type Handling**:
   - Gracefully handles both basic `RedactionElement` and extended `ExtendedRedactionElement` types
   - Uses type casting to access extended properties when available

2. **Conditional Rendering**:
   - Shows appropriate UI based on data availability
   - Renders different badge variants based on action types

3. **Confidence Formatting**:
   - Converts raw confidence scores (0-1) to percentages
   - Handles missing confidence scores gracefully

## Usage

The DataExtractor component is typically used as a child component within the DocumentProcessor workflow:

```tsx
import { DataExtractor } from "@/components/data-extractor";

// Within parent component
<DataExtractor
  data={documentData}
  elements={extractedElements}
  selectedElements={selectedElementIds}
  onElementSelect={handleElementSelect}
/>
```

## Integration Points

The DataExtractor integrates with:

- **DocumentProcessor**: Receives extracted elements and selection state
- **UI Components**: Leverages Shadcn UI components (Table, Checkbox, Badge)
- **Redaction System**: Facilitates element selection for redaction operations

## UI Design

The component implements a clean, functional UI with:

- **Shadcn UI Integration**: Uses Shadcn's Table and form components
- **Responsive Design**: Works across different screen sizes
- **Visual Hierarchy**: Emphasizes important information through typography and badges
- **Interactive Elements**: Enhances usability with clickable labels and clear selection mechanisms

## Best Practices Implemented

1. **Accessibility**:
   - Associates checkboxes with labels for better accessibility
   - Uses semantic HTML table structure

2. **Performance**:
   - Minimal state management (stateless component)
   - Efficient rendering of potentially large element lists

3. **Error Handling**:
   - Handles missing or incomplete data gracefully
   - Provides fallback content for empty states

4. **Type Safety**:
   - Uses TypeScript interfaces for prop validation
   - Handles type casting safely for extended properties

## Technical Dependencies

- **React**: Functional component architecture
- **Shadcn UI**: Table, TableHeader, TableBody, TableRow, TableCell
- **UI Components**: Checkbox, Badge
- **TypeScript**: Type definitions and interfaces 