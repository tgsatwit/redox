# Document Configuration Components

This directory contains modular components for the Document Configuration functionality, which was refactored from a single large component into smaller, more maintainable pieces.

## Component Structure

- **DocumentConfigManager**: The main parent component that integrates all child components.
- **DocumentTypeManager**: Handles document type selection and creation.
- **SubTypeManager**: Manages document subtypes for a selected document type.
- **DataElementManager**: Manages data elements for a document type or subtype.
- **DefaultElementsPanel**: Provides functionality for generating and applying default data elements.
- **SyncConfigurationPanel**: Handles configuration synchronization operations.

## Usage

Import components from this directory:

```jsx
import { 
  DocumentConfigManager,
  DocumentTypeManager,
  SubTypeManager,
  DataElementManager 
} from "@/components/config";
```

The main entry point is the `DocumentConfigManager` component, which can be used directly in pages:

```jsx
export default function ConfigPage() {
  return <DocumentConfigManager />;
}
```

## Props

Each component accepts specific props that control its behavior:

### DocumentConfigManager

This is the top-level component that contains all other components. It doesn't require any props.

### DocumentTypeManager

```typescript
interface DocumentTypeManagerProps {
  activeDocumentTypeId: string;
  documentTypes: DocumentTypeConfig[];
  onSelectDocType: (id: string) => void;
  isLoading: boolean;
}
```

### SubTypeManager

```typescript
interface SubTypeManagerProps {
  documentType: DocumentTypeConfig;
  activeSubTypeId: string | null;
  setActiveSubTypeId: (id: string | null) => void;
  isLoading: boolean;
}
```

### DataElementManager

```typescript
interface DataElementManagerProps {
  documentType: DocumentTypeConfig;
  subTypeId: string | null;
  isLoading: boolean;
}
```

The `DataElementManager` component allows users to create, edit, and delete data elements for a document type or subtype. Each data element can have the following properties:

- **name**: The primary name of the data element
- **type**: The data type (Text, Number, Date, etc.)
- **category**: The category of data (General, PII, Financial, etc.)
- **action**: What to do with this data (Extract, Redact, etc.)
- **description**: Optional description of the data element
- **required**: Whether this field is required
- **aliases**: Alternative variable names that can be used to match this data element with incoming payloads

The aliases feature allows you to define multiple names for the same data element, which is useful when:
- Different systems use different field names for the same data
- You want to support legacy field names while transitioning to new ones
- You need to handle variations in naming conventions across different document sources

### DefaultElementsPanel

```typescript
interface DefaultElementsPanelProps {
  documentType: DocumentTypeConfig;
  subTypeId: string | null;
  isLoading: boolean;
}
```

### SyncConfigurationPanel

```typescript
interface SyncConfigurationPanelProps {
  documentType: DocumentTypeConfig;
  isLoading: boolean;
}
``` 