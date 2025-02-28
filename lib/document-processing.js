/* Remove top-level imports */

export async function processDocument(file, options = {}) {
  // Check if the file is a supported type
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'];
  
  if (!supportedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Please upload a PDF or image file (JPEG, PNG, GIF, BMP, or WebP).`);
  }
  
  // For PDF files, use a different processing method
  if (file.type === 'application/pdf') {
    console.log('PDF detected, using PDF processing method...');
    return await processPDF(file, options);
  }
  
  // Process on client side only for now
  const isClient = typeof window !== 'undefined';
  if (!isClient) {
    throw new Error('Server-side processing is temporarily disabled. Please use client-side processing.');
  }
  
  return await processImageWithTesseract(file, options);
}

// Process PDF documents using a server-side API
async function processPDF(file, options = {}) {
  try {
    console.log('Starting PDF processing with file:', { 
      name: file.name, 
      size: file.size, 
      type: file.type 
    });
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    if (options.documentType) {
      formData.append('documentType', options.documentType);
    }
    
    if (options.elementsToExtract) {
      formData.append('elementsToExtract', JSON.stringify(options.elementsToExtract));
    }
    
    // Send to server for processing - use process-document endpoint first
    const response = await fetch('/api/process-document', {
      method: 'POST',
      body: formData
    });
    
    // Handle response
    const data = await response.json();
    
    // Check if the response indicates we need to use page-by-page processing
    if (response.status === 400 && data.requiresPageByPage) {
      console.log('Server indicated this document requires page-by-page processing', data);
      
      // If the caller provided an onPageByPageRequired callback, invoke it
      if (options.onPageByPageRequired && typeof options.onPageByPageRequired === 'function') {
        return options.onPageByPageRequired(data.message || 'This document requires page-by-page processing');
      }
      
      // Otherwise throw an error that will be caught by the caller
      throw new Error(data.message || 'This document requires page-by-page processing');
    }
    
    // For successful processing, return the data
    if (response.ok) {
      console.log('Document processed successfully', { 
        documentType: data.documentType,
        confidenceScore: data.confidence,
        extractedFieldCount: data.extractedFields?.length || 0
      });
      return data;
    }
    
    // Handle AWS specific errors with useful messages
    if (data.error) {
      // Special handling for AWS Textract errors
      if (data.error.includes('UnsupportedDocumentException') || 
          data.error.includes('not supported for direct processing')) {
        
        console.warn('Document not supported for direct processing - will try page-by-page approach');
        
        // If the caller provided an onPageByPageRequired callback, invoke it
        if (options.onPageByPageRequired && typeof options.onPageByPageRequired === 'function') {
          return options.onPageByPageRequired('This document requires page-by-page processing for best results');
        }
      }
      
      throw new Error(data.error);
    }
    
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
}

// Simple client-side OCR processing for images only
async function processImageWithTesseract(file, options = {}) {
  try {
    console.log('Starting OCR processing of image...');
    
    // Import Tesseract.js dynamically
    const { createWorker } = await import('tesseract.js');
    console.log('Tesseract.js loaded successfully');
    
    // Create a worker with logging disabled to avoid serialization issues
    // The DataCloneError happens because the default logger tries to pass functions
    // between threads which isn't allowed in structured cloning
    const worker = await createWorker({
      logger: null, // Disable the logger to avoid the DataCloneError
      errorHandler: e => console.error('Tesseract Error:', e)
    });
    console.log('Tesseract worker created');
    
    // Initialize with English language
    await worker.loadLanguage('eng');
    console.log('Language loaded');
    
    await worker.initialize('eng');
    console.log('Worker initialized');
    
    // Create a valid URL from the file
    const imageUrl = URL.createObjectURL(file);
    console.log('Image URL created:', imageUrl);
    
    // Recognize text
    console.log('Starting text recognition...');
    const { data } = await worker.recognize(imageUrl);
    console.log('Text recognition completed');
    
    // Clean up
    URL.revokeObjectURL(imageUrl);
    await worker.terminate();
    console.log('Worker terminated and resources cleaned up');
    
    return {
      documentType: options.documentType || 'Image Document',
      confidence: 70,
      extractedText: data.text,
      extractedFields: extractFieldsFromText(data.text, options)
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    throw new Error(`Failed to process image with OCR: ${error.message}`);
  }
}

// Extract fields from text using basic patterns
function extractFieldsFromText(text, options = {}) {
  if (!text) return [];
  
  const extractedFields = [];
  let fieldId = 0;
  
  // Basic field extraction for key-value pairs (e.g., "Name: John Smith")
  const kvRegex = /([A-Za-z\s]+):\s*([^:\n]+)(?=\n|$)/g;
  let match;
  
  while ((match = kvRegex.exec(text)) !== null) {
    extractedFields.push({
      id: `field-${fieldId++}`,
      label: match[1].trim(),
      value: match[2].trim(),
      confidence: 60,
      dataType: guessDataType(match[2].trim())
    });
  }
  
  return extractedFields;
}

// Guess data type based on value pattern
function guessDataType(value) {
  // Simple type detection logic
  if (/^\d+$/.test(value)) return 'Number';
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value)) return 'Date';
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return 'Email';
  return 'Text';
} 