import { ensurePdfJsLoaded } from '@/lib/pdf-preloader';
import { splitPdfIntoPages, combinePdfPages, mapTextractCoordinatesToPdf } from './pdf-utils';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { AnyBoundingBox, WordBlock } from './types';

/**
 * Represents a text element with bounding box for redaction
 */
export interface RedactionElement {
  id: string;
  text: string;
  boundingBox?: AnyBoundingBox;
  confidence: number;
  pageIndex: number;
  selected?: boolean;
  valueWordBlocks?: WordBlock[];
}

/**
 * Result of processing a single PDF page
 */
interface PageProcessingResult {
  pageIndex: number;
  extractedText: string;
  extractedFields: RedactionElement[];
  documentType: string;
  success: boolean;
  error?: string;
}

/**
 * PDF page with associated dimension information
 */
interface PdfPage {
  file: File;
  width: number;
  height: number;
}

/**
 * Process a multi-page PDF document page by page
 * @param pdfFile The PDF file to process
 * @param options Options for processing
 * @returns Object containing success status, error message if any, extracted text, and fields
 */
export async function processMultiPagePdf(
  pdfFile: File,
  options: {
    documentType: string;
    onProgress?: (status: string, progress: number, total: number) => void;
  }
): Promise<{
  success: boolean;
  error?: string;
  extractedText?: string;
  extractedFields?: RedactionElement[];
  pages?: { pageIndex: number; success: boolean; error?: string }[];
}> {
  try {
    const { documentType, onProgress } = options;
    
    // Notify about starting the process
    onProgress?.('Starting multi-page PDF processing...', 0, 1);
    console.log('Starting PDF processing:', { name: pdfFile.name, size: pdfFile.size, type: pdfFile.type });
    
    // Split the PDF into individual pages
    const pagesResult = await splitPdfIntoPages(pdfFile, {
      onProgress: (status, current, total) => {
        onProgress?.(`Splitting PDF: ${status}`, current, total);
      }
    });
    
    if (!pagesResult || pagesResult.pages.length === 0) {
      throw new Error('Failed to split PDF into pages');
    }
    
    console.log(`Successfully split PDF into ${pagesResult.pages.length} pages`, { 
      pageCount: pagesResult.pages.length,
      firstPageType: pagesResult.pages[0]?.type,
      dimensions: pagesResult.dimensions
    });
    
    onProgress?.(`Successfully split PDF into ${pagesResult.pages.length} pages`, 1, pagesResult.pages.length);
    
    // Create an array to store all extracted text and fields from each page
    let allExtractedText = '';
    const allExtractedFields: RedactionElement[] = [];
    const pageResults: { pageIndex: number; success: boolean; error?: string }[] = [];
    
    // Process each page as an image
    for (let i = 0; i < pagesResult.pages.length; i++) {
      const pageImage = pagesResult.pages[i];
      const pageIndex = i;
      
      onProgress?.(`Processing page ${pageIndex + 1} of ${pagesResult.pages.length}`, i, pagesResult.pages.length);
      console.log(`Processing page ${pageIndex + 1}`, { 
        pageIndex, 
        imageName: pageImage.name, 
        imageType: pageImage.type, 
        imageSize: pageImage.size 
      });
      
      try {
        // Ensure we're sending an image that AWS Textract can process
        if (!pageImage.type.startsWith('image/')) {
          console.warn(`Page ${pageIndex + 1} is not an image type: ${pageImage.type}, AWS Textract may reject it`);
        }
        
        // Create a FormData object for this page
        const formData = new FormData();
        formData.append('file', pageImage);
        formData.append('pageIndex', pageIndex.toString());
        formData.append('documentType', documentType);
        
        // Send to the API for processing
        onProgress?.(`Analyzing page ${pageIndex + 1} with AWS Textract...`, i, pagesResult.pages.length);
        
        console.log(`Sending page ${pageIndex + 1} to API for processing`, {
          endpoint: '/api/process-pdf-pages',
          pageIndex,
          documentType
        });
        
        const response = await fetch('/api/process-pdf-pages', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          let errorMessage = `API error (${response.status}: ${response.statusText})`;
          
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
            console.error(`Error processing page ${pageIndex + 1}:`, errorData);
          } catch (e) {
            // If we couldn't parse the response as JSON, try to get text
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
            console.error(`Error processing page ${pageIndex + 1}:`, errorText);
          }
          
          console.log(`API response status: ${response.status} ${response.statusText}`);
          onProgress?.(`Error on page ${pageIndex + 1}: ${errorMessage}`, i, pagesResult.pages.length);
          
          pageResults.push({ pageIndex, success: false, error: errorMessage });
          // Continue with the next page even if this one failed
          continue;
        }
        
        const pageData = await response.json();
        
        // Log the processing result for debugging
        console.log(`Successfully processed page ${pageIndex + 1}`, {
          extractedTextLength: pageData.extractedText?.length || 0,
          fieldsCount: pageData.extractedFields?.length || 0
        });
        
        // Add extracted text from this page
        if (pageData.extractedText) {
          allExtractedText += (allExtractedText ? '\n\n' : '') + `[Page ${pageIndex + 1}]\n` + pageData.extractedText;
        }
        
        // Add extracted fields from this page
        if (pageData.extractedFields && Array.isArray(pageData.extractedFields)) {
          // Ensure each field has the correct page index
          const fieldsWithPageIndex = pageData.extractedFields.map((field: RedactionElement) => ({
            ...field,
            pageIndex
          }));
          
          allExtractedFields.push(...fieldsWithPageIndex);
        }
        
        pageResults.push({ pageIndex, success: true });
        onProgress?.(`Page ${pageIndex + 1} processed successfully`, i + 1, pagesResult.pages.length);
      } catch (pageError) {
        const errorMessage = pageError instanceof Error ? pageError.message : String(pageError);
        console.error(`Error processing page ${pageIndex + 1}:`, pageError);
        onProgress?.(`Error on page ${pageIndex + 1}: ${errorMessage}`, i, pagesResult.pages.length);
        
        pageResults.push({ pageIndex, success: false, error: errorMessage });
        // Continue with the next page even if this one failed
        continue;
      }
    }
    
    // Check if any pages were successfully processed
    const successCount = pageResults.filter(r => r.success).length;
    
    if (successCount === 0 && pagesResult.pages.length > 0) {
      return {
        success: false,
        error: 'Failed to process any pages of the PDF',
        pages: pageResults
      };
    }
    
    // Final progress update
    onProgress?.(`Processing complete. Found ${allExtractedFields.length} elements across ${successCount} pages.`, 
      pagesResult.pages.length, pagesResult.pages.length);
    
    console.log('PDF processing complete', {
      totalPages: pagesResult.pages.length,
      successfulPages: successCount,
      totalElements: allExtractedFields.length,
      textLength: allExtractedText.length
    });
    
    return {
      success: true,
      extractedText: allExtractedText,
      extractedFields: allExtractedFields,
      pages: pageResults
    };
  } catch (error) {
    console.error('Error in processMultiPagePdf:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Apply redactions to a PDF document
 * @param pdfFile Original PDF file
 * @param elementsToRedact Array of elements to redact
 * @param options Redaction options
 * @returns A new PDF file with redactions applied
 */
export async function applyRedactionsToPdf(
  pdfFile: File,
  elementsToRedact: RedactionElement[],
  options: {
    redactionColor?: [number, number, number]; // RGB values between 0-1
    onProgress?: (status: string, progress: number, total: number) => void;
  } = {}
): Promise<File> {
  try {
    const { 
      redactionColor = [0, 0, 0], // Default to black
      onProgress 
    } = options;
    
    // Ensure PDF.js is loaded
    await ensurePdfJsLoaded();
    
    onProgress?.('Loading PDF document...', 0, 100);
    
    // Load the PDF document
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    
    // Group redactions by page
    const redactionsByPage: { [pageIndex: number]: RedactionElement[] } = {};
    
    elementsToRedact.forEach(element => {
      const pageIndex = element.pageIndex;
      if (!redactionsByPage[pageIndex]) {
        redactionsByPage[pageIndex] = [];
      }
      redactionsByPage[pageIndex].push(element);
    });
    
    // Apply redactions page by page
    const pageIndexes = Object.keys(redactionsByPage).map(Number);
    for (let i = 0; i < pageIndexes.length; i++) {
      const pageIndex = pageIndexes[i];
      const redactions = redactionsByPage[pageIndex];
      
      if (pageIndex >= pages.length) {
        console.warn(`Skipping redactions for page ${pageIndex + 1} as it does not exist in the document`);
        continue;
      }
      
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      
      onProgress?.(`Applying redactions to page ${pageIndex + 1}...`, Math.floor((i / pageIndexes.length) * 90) + 10, 100);
      
      // Apply each redaction on this page
      for (const redaction of redactions) {
        // Map Textract coordinates to PDF coordinates
        const { boundingBox, valueWordBlocks } = redaction;
        
        // If we have word-level bounding boxes, use them for more precise redaction
        if (valueWordBlocks && valueWordBlocks.length > 0) {
          // Redact each word individually
          for (const wordBlock of valueWordBlocks) {
            if (wordBlock.boundingBox) {
              let x, y, boxWidth, boxHeight;
              
              // Handle both bounding box formats
              if ('Width' in wordBlock.boundingBox) {
                // AWS Textract format
                x = wordBlock.boundingBox.Left * width;
                y = height - (wordBlock.boundingBox.Top * height) - (wordBlock.boundingBox.Height * height); // Flip Y-axis
                boxWidth = wordBlock.boundingBox.Width * width;
                boxHeight = wordBlock.boundingBox.Height * height;
              } else {
                // Regular format (x, y, width, height)
                x = wordBlock.boundingBox.x * width;
                y = height - (wordBlock.boundingBox.y * height) - (wordBlock.boundingBox.height * height); // Flip Y-axis
                boxWidth = wordBlock.boundingBox.width * width;
                boxHeight = wordBlock.boundingBox.height * height;
              }
              
              // Apply some padding for better coverage
              const padding = 2;
              x = Math.max(0, x - padding);
              y = Math.max(0, y - padding);
              boxWidth += padding * 2;
              boxHeight += padding * 2;
              
              // Draw a rectangle to cover the word
              page.drawRectangle({
                x,
                y,
                width: boxWidth,
                height: boxHeight,
                color: rgb(redactionColor[0], redactionColor[1], redactionColor[2]),
                opacity: 1,
                borderWidth: 0
              });
            }
          }
        } 
        // Fall back to the main bounding box if we don't have word-level details
        else if (boundingBox) {
          let x, y, boxWidth, boxHeight;
          
          // Handle both bounding box formats
          if ('Width' in boundingBox) {
            // AWS Textract format
            x = boundingBox.Left * width;
            y = height - (boundingBox.Top * height) - (boundingBox.Height * height); // Flip Y-axis
            boxWidth = boundingBox.Width * width;
            boxHeight = boundingBox.Height * height;
          } else {
            // Regular format (x, y, width, height)
            x = boundingBox.x * width;
            y = height - (boundingBox.y * height) - (boundingBox.height * height); // Flip Y-axis
            boxWidth = boundingBox.width * width;
            boxHeight = boundingBox.height * height;
          }
          
          // Draw a rectangle to cover the text
          page.drawRectangle({
            x,
            y,
            width: boxWidth,
            height: boxHeight,
            color: rgb(redactionColor[0], redactionColor[1], redactionColor[2]),
            opacity: 1,
            borderWidth: 0
          });
        }
      }
    }
    
    onProgress?.('Finalizing redacted document...', 95, 100);
    
    // Serialize the PDF document
    const pdfBytes = await pdfDoc.save();
    
    // Convert to a File object
    const redactedFile = new File(
      [pdfBytes], 
      `redacted-${pdfFile.name}`, 
      { type: 'application/pdf' }
    );
    
    onProgress?.('Redaction complete!', 100, 100);
    
    return redactedFile;
  } catch (error) {
    console.error('Error in applyRedactionsToPdf:', error);
    throw new Error(`Failed to apply redactions: ${error instanceof Error ? error.message : String(error)}`);
  }
} 