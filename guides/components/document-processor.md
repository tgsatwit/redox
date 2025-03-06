# DocumentProcessor Component

## Overview

The `DocumentProcessor` component is a comprehensive solution for handling document processing workflows with capabilities for file upload, text extraction, document classification, data extraction, redaction, and document summarization. It serves as the central orchestrator for document management operations.

## Core Functionality

The DocumentProcessor provides an end-to-end document processing pipeline with the following key features:

### 1. Document Upload and Handling

- **File Upload**: Supports uploading various document formats (PDF, images, etc.)
- **Format Validation**: Validates file formats and ensures they are supported
- **Document Viewing**: Integrates with DocumentViewer for rendering documents

### 2. Text Extraction

- **Multi-Method Extraction**: 
  - Client-side extraction for PDFs using PDF.js
  - Server-side extraction for images and other formats
  - AWS Textract integration for advanced text analysis
- **Page-by-Page Processing**: Can process multi-page documents page by page

### 3. Document Classification

- **AI-Powered Classification**:
  - Classification with AWS services (Textract, Comprehend)
  - GPT-based document classification (`handleClassifyWithGPT`)
  - Automatic type and subtype identification
- **Manual Classification**: Fallback for user-guided classification
- **Classification Feedback**: System for improving classification accuracy

### 4. Data Element Extraction

- **Pattern Recognition**: Detects common patterns in text (emails, phone numbers, etc.)
- **Enhanced Pattern Matching**: Uses contextual clues to identify document-specific fields
- **Element Configuration**: Maps extracted elements to predefined data configurations
- **AI-Assisted Matching**: Uses GPT to match extracted text to configured elements

### 5. Redaction Capabilities

- **Element Redaction**: Selectively redacts sensitive information
- **Redaction Actions**: Supports different actions (Extract, Redact, ExtractAndRedact, Ignore)
- **Visual Redaction**: Applies redaction to document images with UI feedback
- **PII Detection**: Identifies and flags personally identifiable information (PII)

### 6. Document Summarization

- **Automatic Summaries**: Creates document summaries based on extracted elements
- **Type-Specific Summaries**: Tailors summaries based on document type and subtype
- **Customizable Format**: Organizes summary with extracted key information

### 7. Document Management

- **Retention Policies**: Implements document retention with configurable policies
- **Save Options**: Separate policies for original and redacted documents
- **Download Options**: Download original or redacted documents

## Technical Architecture

### Data Models

The component utilizes several key data structures:

- `RedactionElement`: Represents text elements with bounding boxes for redaction
- `ExtendedRedactionElement`: Enhanced redaction elements with additional metadata
- `DocumentData`: Contains extracted text, fields, and document metadata
- `AnyBoundingBox`: Unified interface for handling different bounding box formats
- `ProcessingOptions`: Controls which processing steps are applied to documents

### Key Functions

1. **Workflow Management**:
   - `runSelectedProcesses`: Orchestrates multiple processing steps
   - `resetWorkflow`: Clears the current workflow state
   - `handleWorkflowSelect`: Selects predefined workflows
   - `proceedToProcessingOptions`: Transitions between workflow steps

2. **Document Processing**:
   - `handleFileUpload`: Manages the document upload process
   - `handleExtractText`: Extracts text from documents
   - `handleProcessDocument`: Processes documents with configured options
   - `handleProcessPageByPage`: Processes documents page by page
   - `processWithDocType`: Processes a document using a specific document type configuration

3. **Classification**:
   - `handleClassifyDocument`: Classifies documents using AWS services
   - `handleClassifyWithGPT`: Uses GPT for document classification
   - `handleVerification`: Handles user verification of classification results

4. **Element Extraction and Matching**:
   - `detectPatterns`: Identifies common patterns in text
   - `enhancedDetectPatterns`: Uses advanced pattern recognition
   - `matchExtractedWithConfigured`: Matches extracted elements with configurations
   - `matchElementsWithGPT`: Uses GPT to match elements
   - `tryMatchExtractedTextToElements`: Attempts to match extracted text to defined elements

5. **Redaction Handling**:
   - `handleRedaction`: Manages the redaction process
   - `handleApplyRedactions`: Applies redactions to the document
   - `toggleFieldRedaction`: Toggles redaction for specific fields

6. **Document Output**:
   - `createDocumentSummary`: Generates document summaries
   - `saveDocumentWithRetention`: Saves documents with retention policies
   - `handleDownload`: Manages document downloading

### UI Components

The component implements a multi-step UI with:

- **Tab-Based Interface**: Different tabs for original document, extracted data, redacted document, and summary
- **Step-by-Step Workflow**: Guides users through upload, classification, processing, and results
- **Processing Options**: UI for selecting which processes to apply
- **Element Selection**: Interface for selecting which elements to extract/redact
- **Feedback Mechanisms**: Visual feedback on processing status and results

## Integration Points

The DocumentProcessor integrates with:

- **AWS Services**: Textract, Comprehend, S3, DynamoDB
- **AI/ML Models**: GPT for classification and element matching
- **PDF Processing Libraries**: PDF.js for client-side extraction, pdf-lib for redaction
- **UI Components**: FileUploader, DocumentViewer, RetentionPolicyManager, etc.

## Error Handling

- **Comprehensive Error States**: Tracks and displays processing errors
- **Fallback Mechanisms**: Client-side processing when server-side fails
- **Input Validation**: Validates file formats and user inputs
- **Error Feedback**: Provides user-friendly error messages

## Performance Considerations

- **Optimized Processing**: Uses the most efficient processing path based on document type
- **Progressive Processing**: Processes documents in stages to manage resource usage
- **Client-Side Processing**: Leverages client-side capabilities when possible to reduce server load

## Usage Example

The DocumentProcessor is typically used as a standalone component that manages the entire document processing workflow:

```tsx
import { DocumentProcessor } from "@/components/document-processor";

export default function DocumentProcessingPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Document Processing</h1>
      <DocumentProcessor />
    </div>
  );
}
```

## Technical Dependencies

- **React Hooks**: Uses useState, useEffect, useRef, useMemo, useCallback
- **Next.js Features**: Server components, API routes
- **UI Components**: Leverages Shadcn UI components
- **PDF Libraries**: PDF.js, pdf-lib
- **AWS SDK**: For AWS service integration
- **State Management**: Local component state with context for configuration 

## API Routes

The DocumentProcessor component interacts with several backend API routes to perform its operations:

### Document Processing API Routes

1. **`/api/process-document`**
   - **Purpose**: Core API for document processing, text extraction, and analysis
   - **Method**: POST
   - **Payload**: FormData with file and optional processing options
   - **Returns**: Extracted text, fields, document type, confidence scores
   - **Features**: 
     - Falls back to client-side processing if server processing fails
     - Handles different document formats (PDF, images, etc.)
     - Integrates with AWS Textract for advanced document analysis

2. **`/api/redact-document`**
   - **Purpose**: Applies redactions to documents based on specified fields
   - **Method**: POST
   - **Payload**: File, fields to redact, document data
   - **Returns**: URL to redacted document image
   - **Processing**:
     - For images: Creates redaction overlay using SVG and Sharp
     - For PDFs: Applies redactions using PDF processing libraries
     - Stores redacted documents in S3 bucket

### Classification API Routes

1. **`/api/classify-document`**
   - **Purpose**: Classifies documents using AWS services
   - **Method**: POST
   - **Payload**: Document file
   - **Returns**: Document type, confidence score, model ID
   - **Integration**: Uses AWS Textract and custom classification models

2. **`/api/classify-with-gpt`**
   - **Purpose**: Uses GPT models to classify documents
   - **Method**: POST
   - **Payload**: Extracted text, available document types, filename
   - **Returns**: Document type, subtype, confidence, reasoning
   - **Features**: Provides detailed reasoning for classification decisions

3. **`/api/classification-feedback`**
   - **Purpose**: Submits feedback on classification results for model improvement
   - **Method**: POST
   - **Payload**: Document ID, original and corrected classifications
   - **Processing**: Stores feedback in DynamoDB for future model training
   - **Training**: Can be used to improve document classification models

### Data Element and Matching API Routes

1. **`/api/match-elements-with-gpt`**
   - **Purpose**: Uses AI to match extracted elements with configured data elements
   - **Method**: POST
   - **Payload**: Extracted elements, document type ID, subtype ID
   - **Returns**: Enhanced elements with matching information
   - **Processing**:
     - Creates optimized prompts for GPT models
     - Provides confidence scores and reasoning for matches
     - Associates extracted data with predefined configurations

2. **`/api/document-types/:id`**
   - **Purpose**: Retrieves document type configurations
   - **Method**: GET
   - **Returns**: Document type details including data elements and subtypes
   - **Usage**: Used to get configured data elements for extraction and matching

### Diagnostic and Testing API Routes

1. **`/api/test-image-processing`**
   - **Purpose**: Tests document processing capabilities on a single page
   - **Method**: POST
   - **Payload**: PDF page as image
   - **Returns**: Extracted text, block counts, success indicator
   - **Usage**: Used for debugging and validating processing capabilities

### Document Storage API Routes

1. **`/api/save-document`** (Currently Commented in Code)
   - **Purpose**: Saves documents with metadata and retention policies
   - **Method**: POST (When Implemented)
   - **Payload**: Document file and metadata including retention policy
   - **Storage**: Would integrate with S3 for storage and DynamoDB for metadata

2. **`/api/train-with-feedback`**
   - **Purpose**: Initiates model training using collected feedback
   - **Method**: POST
   - **Payload**: Document type, subtype, count of items to process
   - **Processing**: Marks feedback items as used and updates classification models 