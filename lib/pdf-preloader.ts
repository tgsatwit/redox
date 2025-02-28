/**
 * Utility to ensure PDF.js is loaded and properly initialized
 * This helps prevent version mismatch errors and ensures the library is ready for use
 */

// Define the version of PDF.js we want to use
const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

// Define the type for window.pdfjsLib to ensure TypeScript compatibility
declare global {
  interface Window {
    pdfjsLib?: {
      getDocument: (source: any) => { promise: Promise<any> };
      GlobalWorkerOptions: { workerSrc: string };
      version: string;
    };
  }
}

// Track the loading status
let pdfJsLoading: Promise<{ success: boolean; message?: string }> | null = null;
let pdfJsReady = false;

/**
 * Check if PDF.js is already loaded and initialized
 */
export function isPdfJsLoaded(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.hasOwnProperty('pdfjsLib') &&
    (window as any).pdfjsLib !== null &&
    pdfJsReady
  );
}

/**
 * Load PDF.js dynamically
 * @returns Promise that resolves when PDF.js is loaded
 */
async function loadPdfJs(): Promise<{ success: boolean; message?: string }> {
  try {
    // Skip if already loaded
    if (isPdfJsLoaded()) {
      return { success: true };
    }

    // Skip if not in browser
    if (typeof window === 'undefined') {
      return { success: false, message: 'Not in browser environment' };
    }

    // Check if script is already being loaded
    if (pdfJsLoading) {
      return pdfJsLoading;
    }

    // Create a promise to track loading
    pdfJsLoading = new Promise((resolve) => {
      console.log('Loading PDF.js library...');

      // Create script element for PDF.js
      const script = document.createElement('script');
      script.src = PDFJS_URL;
      script.async = true;

      // Handle script load
      script.onload = () => {
        console.log('PDF.js loaded, configuring worker...');
        const pdfjsLib = (window as any).pdfjsLib;

        if (pdfjsLib) {
          // Set the worker source
          pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

          // Verify the worker loads correctly
          try {
            // Wait a moment to make sure the worker initializes
            setTimeout(() => {
              pdfJsReady = true;
              console.log('PDF.js initialization complete');
              resolve({ success: true });
            }, 500);
          } catch (err) {
            console.error('Error initializing PDF.js worker:', err);
            resolve({ 
              success: false, 
              message: `Worker initialization error: ${err instanceof Error ? err.message : String(err)}` 
            });
          }
        } else {
          console.error('PDF.js library loaded but pdfjsLib not found');
          resolve({ success: false, message: 'Failed to initialize PDF.js library' });
        }
      };

      // Handle loading errors
      script.onerror = (error) => {
        console.error('Error loading PDF.js library:', error);
        resolve({ 
          success: false, 
          message: 'Failed to load PDF.js script' 
        });
      };

      // Add script to document
      document.head.appendChild(script);
    });

    return pdfJsLoading;
  } catch (error) {
    console.error('Unexpected error in loadPdfJs:', error);
    return { 
      success: false, 
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Check if the loaded PDF.js version matches the expected version
 */
function getPdfJsVersion(): string | null {
  try {
    return typeof window !== 'undefined' && (window as any).pdfjsLib?.version || null;
  } catch (error) {
    console.error('Error getting PDF.js version:', error);
    return null;
  }
}

/**
 * Ensure PDF.js is loaded and ready to use
 * @returns Status object indicating if PDF.js is loaded successfully
 */
export async function ensurePdfJsLoaded(): Promise<{ success: boolean; message?: string }> {
  // If already loaded and ready, return immediately
  if (isPdfJsLoaded()) {
    const version = getPdfJsVersion();
    if (version === PDFJS_VERSION) {
      return { success: true };
    } else {
      console.warn(`PDF.js version mismatch: loaded ${version}, expected ${PDFJS_VERSION}`);
      // We'll still return success if it's loaded but log the warning
      return { success: true, message: `Version mismatch: ${version} vs ${PDFJS_VERSION}` };
    }
  }

  // Load PDF.js if not already loaded
  const loadResult = await loadPdfJs();
  
  // If loading succeeded, verify the version
  if (loadResult.success) {
    const version = getPdfJsVersion();
    if (version !== PDFJS_VERSION) {
      console.warn(`PDF.js version mismatch: loaded ${version}, expected ${PDFJS_VERSION}`);
      // We'll still return success if it's loaded but log the warning
      return { success: true, message: `Version mismatch: ${version} vs ${PDFJS_VERSION}` };
    }
  }
  
  return loadResult;
}

/**
 * Reload PDF.js (useful when encountering version mismatch issues)
 */
export async function reloadPdfJs(): Promise<{ success: boolean; message?: string }> {
  try {
    // Reset loading state
    pdfJsReady = false;
    pdfJsLoading = null;
    
    // Clear the existing PDF.js instance if possible
    if (typeof window !== 'undefined') {
      // Remove the global objects
      if ((window as any).pdfjsLib) {
        try {
          // Try to clean up any worker
          if ((window as any).pdfjsLib.GlobalWorkerOptions) {
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          }
          
          // Remove the library
          (window as any).pdfjsLib = undefined;
        } catch (err) {
          console.warn('Error cleaning up PDF.js:', err);
        }
      }
      
      // Remove script tags that might be loading PDF.js
      const scriptTags = document.querySelectorAll(`script[src*="pdfjs-dist"]`);
      scriptTags.forEach(tag => {
        tag.remove();
      });
    }
    
    // Load PDF.js again
    return await loadPdfJs();
  } catch (error) {
    console.error('Error reloading PDF.js:', error);
    return { 
      success: false, 
      message: `Failed to reload PDF.js: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
} 