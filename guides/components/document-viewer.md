# DocumentViewer Component

## Overview

The `DocumentViewer` component is a versatile document rendering component designed to display various document types (images, PDFs) with consistent handling of loading states, errors, and presentation. It serves as the primary visual interface for document display within the document processing workflow.

## Core Functionality

The DocumentViewer component provides the following key features:

### 1. Document Rendering

- **Image Rendering**: Displays uploaded or processed image documents
- **PDF Support**: Integrates with PDF.js for PDF document rendering
- **Responsive Display**: Renders documents with appropriate sizing and constraints
- **Empty State Handling**: Shows appropriate UI when no document is available

### 2. Loading and Error Management

- **Loading States**: Provides visual indicators during document loading
- **PDF Loading**: Handles PDF.js library loading and initialization
- **Error Handling**: Gracefully displays errors when documents fail to load
- **Error Callbacks**: Communicates errors back to parent components

### 3. Document Type Handling

- **Format Detection**: Adapts rendering based on document format (PDF vs. images)
- **Format-Specific Loading**: Uses appropriate loading mechanisms for different file types
- **Unified Interface**: Presents a consistent UI regardless of document type

## Technical Architecture

### Component Props

The DocumentViewer component accepts the following props via the `DocumentViewerProps` interface:

```tsx
interface DocumentViewerProps {
  imageUrl: string | null;         // URL or data URL of the document to display
  onError?: (error: string) => void; // Callback for general document errors
  fileType?: string;               // MIME type of the document (e.g., 'application/pdf')
  onPdfLoadError?: (error: string | null) => void; // Callback for PDF-specific errors
}
```

### Internal State Management

The component manages several internal states:

- `isLoading`: Tracks the document loading status
- `isPdfLoading`: Specifically tracks PDF.js library loading status

### Helper Functions and Interfaces

1. **ManualSelection Interface**:
   ```tsx
   interface ManualSelection {
     id: string;
     label: string;
     boundingBox: {
       Left: number;
       Top: number;
       Width: number;
       Height: number;
     };
   }
   ```

2. **renderBoundingBoxStyle Function**:
   - Converts bounding box coordinates to CSS styles
   - Handles different bounding box formats (AWS Textract vs. standard)
   - Returns appropriate positioning for overlay elements

### Document Loading Flow

1. When a document URL is provided, the component:
   - Sets loading state
   - For PDFs, loads the PDF.js library via `ensurePdfJsLoaded()`
   - Renders appropriate loading indicators
   - Handles any loading errors

2. When loading completes:
   - Clears loading state
   - Renders the document
   - Sets up error handlers for rendering issues

## Usage Example

The DocumentViewer component is typically used within tabs or document display regions:

```tsx
import { DocumentViewer } from "@/components/document-viewer";

// Within a parent component
<DocumentViewer
  imageUrl={documentUrl}
  fileType={file?.type}
  onError={handleDocumentError}
  onPdfLoadError={handlePdfError}
/>
```

## Integration Points

The DocumentViewer integrates with:

- **PDF.js**: For PDF document rendering via the `pdf-preloader` utility
- **DocumentProcessor**: Receives document URLs and provides error feedback
- **UI Components**: Leverages Shadcn UI components for loading states and presentation
- **PDF Utils**: Utilizes utility functions for PDF handling

## PDF.js Integration

The component leverages a dedicated PDF preloader system that:

- Loads PDF.js from CDN dynamically when needed
- Ensures consistent PDF.js versioning (v3.11.174)
- Configures PDF.js worker correctly
- Provides fallback mechanisms for PDF loading failures
- Manages PDF.js lifecycle to prevent memory leaks

## Error Handling

The component implements robust error handling:

- **Image Loading Errors**: Captured via onError event handler
- **PDF.js Loading Errors**: Managed through the PDF preloader utility
- **Error Propagation**: Communicates errors to parent components via callbacks
- **Visual Error States**: Shows appropriate UI for error conditions

## UI Design

The component provides a clean, adaptive UI with:

- **Loading Indicators**: Overlaid Loader2 spinner during document loading
- **Responsive Image Sizing**: `max-w-full` and `h-auto` for proper scaling
- **Error States**: Appropriate messaging for various error conditions
- **Empty States**: Placeholder when no document is loaded

## Best Practices Implemented

1. **Performance Optimizations**:
   - Dynamic loading of PDF.js only when needed
   - Proper cleanup and resource management
   - Efficient loading state management

2. **Accessibility**:
   - Proper alt text for document images
   - Visual loading indicators
   - Semantic HTML structure

3. **Error Resilience**:
   - Graceful handling of loading failures
   - Clear error communication
   - Fallback content for error states

4. **Type Safety**:
   - Strong TypeScript typing for props and state
   - Safe handling of optional properties
   - Proper type narrowing for conditional rendering

## Technical Dependencies

- **React**: Functional component with hooks (useState, useEffect)
- **Shadcn UI**: Card and other UI components
- **Lucide React**: Loader2 and other icons
- **PDF.js**: External library for PDF rendering
- **Utility Functions**: pdf-preloader.ts for PDF.js loading management 