# PDF Redaction Workflow

This implementation provides a synchronous PDF redaction workflow that processes PDFs page by page using AWS Textract. The approach follows these steps:

1. Split the PDF into individual pages as images
2. Process each page synchronously with AWS Textract
3. Overlay redaction rectangles on the original PDF
4. Combine the redacted pages back into a single PDF

## Implementation Details

### Core Components

1. **PDF Page Splitter (`lib/pdf-utils.ts`)**
   - Splits a PDF into individual pages as PNG images
   - Preserves page dimensions for accurate coordinate mapping

2. **PDF Preloader (`lib/pdf-preloader.ts`)**
   - Ensures PDF.js is properly loaded before use
   - Handles version mismatches and reloading when needed

3. **Page-by-Page API Endpoint (`app/api/process-pdf-pages/route.ts`)**
   - Synchronously processes individual PDF pages with AWS Textract
   - Returns text and bounding box coordinates for each page

4. **Redaction Logic (`lib/pdf-redaction.ts`)**
   - Processes multi-page PDFs by coordinating the page-by-page workflow
   - Applies redactions to the original PDF using pdf-lib
   - Maps Textract coordinates to PDF coordinate space

5. **UI Components (`components/document-processor.tsx`)**
   - Provides UI for initiating the page-by-page processing
   - Displays progress updates during processing
   - Shows extracted text elements for selection and redaction

### Features

- **Page-by-Page Processing**: Handles multi-page PDFs by processing each page individually
- **Progress Tracking**: Provides real-time progress updates during processing
- **Interactive Redaction**: Allows users to select specific text elements for redaction
- **PDF Manipulation**: Uses pdf-lib to apply redactions directly to the PDF
- **Error Handling**: Robust error handling throughout the process
- **Performance**: Optimized to handle large documents efficiently

## Required Dependencies

- **pdf-lib**: For PDF manipulation and redaction
- **PDF.js**: For client-side PDF rendering and processing
- **AWS SDK**: For interacting with AWS Textract

## Usage

1. Upload a PDF document
2. Click "Process PDF Page by Page"
3. Wait for the processing to complete (progress will be displayed)
4. Select text elements to redact from the list
5. Click "Apply Redactions" to generate and download the redacted PDF

## Technical Notes

- The workflow uses AWS Textract's synchronous API, which is limited to PDFs with 1-5 pages
- For larger documents, we split them into individual pages and process each page separately
- Textract provides normalized coordinates (0-1), which are mapped to actual PDF coordinates
- Redactions are applied as black rectangles overlaid on the text (preserving the original PDF structure)
- The approach maintains PDF quality and preserves all non-redacted content

## Security Considerations

- PDF redaction is performed using overlay rectangles, not by removing content
- For highly sensitive documents, consider a server-side redaction approach
- AWS credentials are required for Textract access (handled through environment variables) 