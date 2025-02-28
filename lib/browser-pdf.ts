/**
 * Browser-only PDF text extraction
 * This module provides a way to extract text from PDF documents using PDF.js
 * but is designed to only run in the browser environment.
 */

import { ensurePdfJsLoaded } from '@/lib/pdf-preloader';

// Define a type for status updates during processing
export type ProcessingStatus = {
  currentPage: number;
  totalPages: number;
  status: 'processing' | 'complete' | 'error';
  message?: string;
};

// We don't need to redeclare the window interface as it's already declared in pdf-preloader.ts

/**
 * Extract text from a PDF file using PDF.js in the browser
 * @param file The PDF file to extract text from
 * @param onProgress Optional callback for progress updates
 * @returns A promise that resolves to the extracted text
 */
export async function extractTextFromPDF(
  file: File,
  onProgress?: (status: ProcessingStatus) => void
): Promise<string> {
  // Check that we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('PDF text extraction can only be performed in a browser environment');
  }

  try {
    // Ensure PDF.js is loaded before proceeding
    const pdfJsStatus = await ensurePdfJsLoaded();
    if (!pdfJsStatus.success) {
      throw new Error(`PDF.js not properly initialized: ${pdfJsStatus.message}`);
    }
    
    onProgress?.({ currentPage: 0, totalPages: 0, status: 'processing', message: 'PDF.js loaded successfully' });
    
    // Use the global PDF.js instance
    if (typeof window === 'undefined' || !window.pdfjsLib) {
      throw new Error('PDF.js library not available');
    }
    
    const pdfjs = window.pdfjsLib;
    console.log('Using global PDF.js instance');
    
    // Create a URL for the PDF file
    const fileURL = URL.createObjectURL(file);
    
    // Load the PDF document
    onProgress?.({ currentPage: 0, totalPages: 0, status: 'processing', message: 'Loading document...' });
    
    // Use a safer loading approach
    const loadingTask = pdfjs.getDocument(fileURL);
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    onProgress?.({ 
      currentPage: 0, 
      totalPages: numPages, 
      status: 'processing',
      message: `Document loaded. Extracting text from ${numPages} pages...` 
    });
    
    // Extract text from each page
    let fullText = '';
    
    for (let i = 1; i <= numPages; i++) {
      onProgress?.({ 
        currentPage: i, 
        totalPages: numPages, 
        status: 'processing',
        message: `Extracting page ${i} of ${numPages}...` 
      });
      
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += `${pageText}\n\n--- Page ${i} ---\n\n`;
    }
    
    // Release the object URL since we no longer need it
    URL.revokeObjectURL(fileURL);
    
    onProgress?.({ 
      currentPage: numPages, 
      totalPages: numPages, 
      status: 'complete',
      message: 'Text extraction complete' 
    });
    
    return fullText.trim();
  } catch (error) {
    onProgress?.({ 
      currentPage: 0, 
      totalPages: 0, 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
    
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * A simpler version that uses the browser's built-in capabilities to extract text
 * This is a fallback for when PDF.js fails or isn't available
 */
export async function extractTextUsingBrowserPDF(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create an object URL for the file
    const objectUrl = URL.createObjectURL(file);
    
    // Create an iframe to load the PDF
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = objectUrl;
    
    // Add event listeners
    iframe.onload = () => {
      try {
        // Give the iframe time to render the PDF
        setTimeout(() => {
          try {
            // Attempt to extract text from the iframe
            const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDocument) {
              throw new Error('Could not access PDF document');
            }
            
            // Get all text from the rendered PDF
            const text = iframeDocument.body.textContent || '';
            
            // Clean up
            document.body.removeChild(iframe);
            URL.revokeObjectURL(objectUrl);
            
            resolve(text);
          } catch (error) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(objectUrl);
            reject(error);
          }
        }, 1000);
      } catch (error) {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    
    iframe.onerror = (error) => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    
    // Add the iframe to the document
    document.body.appendChild(iframe);
  });
}

/**
 * A third fallback that tries to use the global PDF.js instance directly
 * This can help avoid version mismatch issues between the imported module and global instance
 */
export async function extractTextUsingGlobalPDFJS(file: File): Promise<string> {
  // Check that we're in a browser environment with the global PDF.js library loaded
  if (typeof window === 'undefined' || !('pdfjsLib' in window)) {
    throw new Error('Global PDF.js library not available');
  }
  
  const pdfjsLib = (window as any).pdfjsLib;
  
  try {
    // Convert the file to an ArrayBuffer for processing
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF document using the global PDF.js instance
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    let fullText = '';
    
    // Extract text from each page
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += `${pageText}\n\n--- Page ${i} ---\n\n`;
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text using global PDF.js:', error);
    throw new Error(`Failed to extract text using global PDF.js: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 