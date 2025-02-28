/**
 * Utility functions for handling PDF files
 */

import { ensurePdfJsLoaded } from '@/lib/pdf-preloader';
import { PDFDocument } from 'pdf-lib';

/**
 * Converts a PDF file to base64 string
 * @param file - The PDF file to convert
 * @returns Promise resolving to base64 string
 */
export const convertPdfToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        // The result is a data URL with format data:application/pdf;base64,[base64 data]
        const base64String = reader.result as string;
        
        // Extract just the base64 data part
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsDataURL(file);
  });
};

/**
 * Converts a base64 string back to a File object
 * @param base64Data - The base64 data string
 * @param fileName - The name to give the file
 * @param mimeType - The MIME type of the file
 * @returns File object
 */
export const convertBase64ToFile = (
  base64Data: string,
  fileName: string,
  mimeType: string
): File => {
  // Convert base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Create a Blob from the bytes
  const blob = new Blob([bytes], { type: mimeType });
  
  // Create a File from the Blob
  return new File([blob], fileName, { type: mimeType });
};

/**
 * Checks if a string is a valid base64 PDF data URL
 * @param dataUrl - The data URL to check
 * @returns boolean indicating if it's a valid PDF data URL
 */
export const isPdfDataUrl = (dataUrl: string): boolean => {
  return dataUrl.startsWith('data:application/pdf;base64,');
};

/**
 * Extracts base64 data from a data URL
 * @param dataUrl - The data URL containing base64 data
 * @returns The base64 data portion
 */
export const extractBase64FromDataUrl = (dataUrl: string): string => {
  return dataUrl.split(',')[1] || '';
};

/**
 * Convert a data URL to a File object
 */
export function dataURLtoFile(dataURL: string, filename: string): File {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new File([u8arr], filename, { type: mime });
}

/**
 * Validate if a string is a valid data URL
 */
export function isValidDataURL(dataUrl: string): boolean {
  const regex = /^\s*data:([a-z]+\/[a-z0-9-+.]+(;[a-z-]+=[a-z0-9-]+)?)?(;base64)?,([a-z0-9!$&',()*+;=\-._~:@\/?%\s]*)\s*$/i;
  return regex.test(dataUrl);
}

/**
 * Splits a PDF file into individual pages as image files
 * @param pdfFile The PDF file to split
 * @param options Options for progress tracking
 * @returns Promise resolving to an array of page image files and their dimensions
 */
export async function splitPdfIntoPages(
  pdfFile: File,
  options: {
    onProgress?: (status: string, current: number, total: number) => void;
  } = {}
): Promise<{
  pages: File[];
  dimensions: { width: number; height: number }[];
}> {
  try {
    const { onProgress } = options;
    
    // Ensure PDF.js is loaded
    await ensurePdfJsLoaded();
    
    // Get file data as array buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // Ensure pdfjsLib is available
    if (!window.pdfjsLib) {
      throw new Error('PDF.js library not found or not properly initialized');
    }
    
    // Load the PDF document
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    
    onProgress?.('PDF loaded successfully', 0, pageCount);
    
    // Prepare arrays for results
    const pageFiles: File[] = [];
    const dimensions: { width: number; height: number }[] = [];
    
    // Process each page
    for (let i = 1; i <= pageCount; i++) {
      onProgress?.(`Rendering page ${i} of ${pageCount}`, i - 1, pageCount);
      
      // Get the page
      const page = await pdf.getPage(i);
      
      // Get page dimensions
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
      dimensions.push({ width: viewport.width, height: viewport.height });
      
      // Create a canvas for rendering
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        throw new Error('Could not create canvas context');
      }
      
      // Set white background for the canvas
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      // Render the page content on the canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        enableWebGL: true,
      };
      
      await page.render(renderContext).promise;
      
      // Get image data from the canvas
      const imageType = 'image/png'; // PNG format for better quality
      const imageQuality = 1.0; // Maximum quality
      const imageData = canvas.toDataURL(imageType, imageQuality);
      
      // Convert data URL to Blob
      const byteString = atob(imageData.split(',')[1]);
      const mimeType = imageData.split(',')[0].split(':')[1].split(';')[0];
      
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let j = 0; j < byteString.length; j++) {
        ia[j] = byteString.charCodeAt(j);
      }
      
      const blob = new Blob([ab], { type: mimeType });
      
      // Create a File from the Blob
      const pageFile = new File([blob], `page-${i}.png`, { type: mimeType });
      pageFiles.push(pageFile);
      
      onProgress?.(`Page ${i} converted to image`, i, pageCount);
    }
    
    return { pages: pageFiles, dimensions };
  } catch (error) {
    console.error('Error splitting PDF into pages:', error);
    throw new Error(`Failed to split PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Combine PDF pages back into a single PDF
 * This is a placeholder - PDF-lib is required for actual implementation
 */
export async function combinePdfPages(
  pageFiles: File[],
  options?: {
    onProgress?: (status: string, current: number, total: number) => void;
  }
): Promise<File> {
  try {
    const { onProgress } = options || {};
    onProgress?.('Creating new PDF document', 0, pageFiles.length);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add each page to the document
    for (let i = 0; i < pageFiles.length; i++) {
      const pageFile = pageFiles[i];
      onProgress?.(`Adding page ${i + 1}`, i, pageFiles.length);
      
      // Convert file to array buffer
      const pageArrayBuffer = await pageFile.arrayBuffer();
      
      // We assume the pages are PDF files
      // For image files, different logic would be needed
      const pagePdf = await PDFDocument.load(pageArrayBuffer);
      const [firstPage] = await pdfDoc.copyPages(pagePdf, [0]);
      pdfDoc.addPage(firstPage);
    }
    
    onProgress?.('Finalizing document', pageFiles.length, pageFiles.length);
    
    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Create a new File from the PDF bytes
    const combinedPdf = new File(
      [pdfBytes],
      'combined-document.pdf',
      { type: 'application/pdf' }
    );
    
    return combinedPdf;
  } catch (error) {
    console.error('Error combining PDF pages:', error);
    throw new Error(`Failed to combine PDF pages: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Map Textract coordinates to PDF coordinates
 * @param textractBox Textract bounding box (normalized 0-1 coordinates)
 * @param pdfPageDimensions Actual dimensions of the PDF page
 * @returns Mapped coordinates for PDF
 */
export function mapTextractCoordinatesToPdf(
  textractBox: { Width: number; Height: number; Left: number; Top: number },
  pdfPageDimensions: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const { width, height } = pdfPageDimensions;
  
  // Textract coordinates are normalized (0-1) and have origin at top-left
  // PDF coordinates have origin at bottom-left, so we need to flip the y-axis
  return {
    x: textractBox.Left * width,
    y: height - (textractBox.Top * height) - (textractBox.Height * height), // Flip Y-axis
    width: textractBox.Width * width,
    height: textractBox.Height * height
  };
}

/**
 * Creates a normalized PDF blob with proper content type and headers
 * to ensure better browser compatibility
 */
export async function createCompatiblePdfBlob(file: File): Promise<Blob> {
  // First get the file's array buffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Create a Blob with proper content type and additional browser-friendly settings
  return new Blob([arrayBuffer], {
    type: 'application/pdf'
  });
}

/**
 * Creates a download link for a PDF file
 */
export function createPdfDownloadLink(url: string, filename = 'document.pdf'): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Creates a custom header HTML document that can be used to better display PDFs in iframes
 * by setting proper Content-Type and Content-Disposition headers
 */
export function createPdfViewerHtml(pdfUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PDF Viewer</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
        }
        #pdf-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f5f5f5;
        }
        embed, object, iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    </head>
    <body>
      <div id="pdf-container">
        <embed 
          src="${pdfUrl}"
          type="application/pdf"
          width="100%"
          height="100%"
        />
      </div>
      <script>
        // This script detects if the PDF loads successfully
        const embed = document.querySelector('embed');
        
        // Function to check if PDF loaded
        function checkPdfLoaded() {
          try {
            // If after a timeout the PDF hasn't loaded, switch to alternative renderer
            setTimeout(() => {
              if (!document.body.contains(embed)) {
                useAlternativeRenderer();
              }
              
              // Try to access embed content - if it fails, PDF might be blocked
              try {
                const testAccess = embed.clientHeight;
                if (!testAccess || testAccess < 10) {
                  useAlternativeRenderer();
                }
              } catch (e) {
                useAlternativeRenderer();
              }
            }, 1000);
          } catch (e) {
            useAlternativeRenderer();
          }
        }
        
        // Function to use alternative PDF renderer if embedded fails
        function useAlternativeRenderer() {
          const container = document.getElementById('pdf-container');
          if (container) {
            container.innerHTML = \`
              <object
                data="${pdfUrl}"
                type="application/pdf"
                width="100%" 
                height="100%"
              >
                <iframe 
                  src="${pdfUrl}"
                  width="100%"
                  height="100%"
                  style="border:none;"
                >
                  This browser does not support PDFs. Please download the PDF to view it.
                </iframe>
              </object>
            \`;
          }
        }
        
        // Start checking
        checkPdfLoaded();
        
        // Also notify parent window about load status
        window.addEventListener('load', function() {
          setTimeout(() => {
            try {
              // Attempt to measure the PDF content to check if it loaded
              if (embed && embed.clientHeight > 10) {
                window.parent.postMessage({ type: 'pdf-loaded', success: true }, '*');
              } else {
                window.parent.postMessage({ type: 'pdf-load-error', message: 'PDF did not render properly' }, '*');
              }
            } catch (e) {
              window.parent.postMessage({ type: 'pdf-load-error', message: e.message }, '*');
            }
          }, 500);
        });
      </script>
    </body>
    </html>
  `;
}

/**
 * Creates an HTML blob for displaying a PDF with more browser compatibility
 */
export function createHtmlPdfViewerBlob(pdfUrl: string): Blob {
  const html = createPdfViewerHtml(pdfUrl);
  return new Blob([html], { type: 'text/html' });
}

// Re-export the PDF.js loader utilities
export { ensurePdfJsLoaded, reloadPdfJs } from '@/lib/pdf-preloader'; 