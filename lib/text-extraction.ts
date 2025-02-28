import type { DocumentData } from "./types"

interface ProcessOptions {
  documentType: string
  elementsToExtract: Array<{
    id: string
    name: string
    type: string
    required?: boolean
  }>
}

// Main function to extract text from a document
export async function extractDocumentText(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    const res = await fetch("/api/extract-text", {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Text extraction failed");
    }
    
    const data = await res.json();
    return data.extractedText || '';
  } catch (error) {
    console.error("Error extracting text:", error);
    throw error;
  }
}

// Fallback function to extract text and create document data
export async function extractTextFallback(file: File, options?: ProcessOptions): Promise<DocumentData> {
  try {
    const extractedText = await extractDocumentText(file);
    
    // Try to extract fields using regex patterns
    const extractedFields = extractFieldsFromText(extractedText, options);
    
    // Use the document type from options if provided, otherwise guess
    const documentType = options ? options.documentType : guessDocumentType(extractedText);
    
    return {
      documentType: documentType,
      confidence: 50, // Medium confidence for fallback extraction
      extractedText,
      extractedFields
    };
  } catch (error) {
    console.error("Fallback text extraction failed:", error);
    throw error;
  }
}

// Extract fields from text using regex patterns
function extractFieldsFromText(text: string, options?: ProcessOptions): any[] {
  const extractedFields: any[] = [];
  
  // Basic pattern for key-value pairs in text (e.g., "Name: John Doe")
  const fieldPattern = /([A-Za-z\s]+):\s*([^:\n]+)(?=\n|$)/g;
  let match;
  let fieldIndex = 0;
  
  while ((match = fieldPattern.exec(text)) !== null) {
    const [, label, value] = match;
    if (label && value) {
      extractedFields.push({
        id: `field-${fieldIndex++}`,
        label: label.trim(),
        value: value.trim(),
        dataType: guessDataType(value.trim()),
        confidence: 50, // Medium confidence for regex extraction
        boundingBox: undefined
      });
    }
  }
  
  // If options with elements to extract are provided, try to match them
  if (options?.elementsToExtract && options.elementsToExtract.length > 0) {
    options.elementsToExtract.forEach(element => {
      // Skip if we already found this field
      if (extractedFields.some(field => 
        field.label.toLowerCase() === element.name.toLowerCase())) {
        return;
      }
      
      // Try to find the element in the text
      const regex = new RegExp(`${element.name}[:\\s]+([^\\n]+)`, 'i');
      const match = text.match(regex);
      
      if (match && match[1]) {
        extractedFields.push({
          id: `field-${fieldIndex++}`,
          label: element.name,
          value: match[1].trim(),
          dataType: element.type || guessDataType(match[1].trim()),
          confidence: 40, // Lower confidence for this type of extraction
          boundingBox: undefined
        });
      } else if (element.required) {
        // Add placeholder for required fields not found
        extractedFields.push({
          id: `field-${fieldIndex++}`,
          label: element.name,
          value: "[Not Found]",
          dataType: element.type || "Text",
          confidence: 0,
          requiredButMissing: true
        });
      }
    });
  }
  
  return extractedFields;
}

// Helper function to guess document type from text content
function guessDocumentType(text: string): string {
  const textLower = text.toLowerCase();
  
  if (textLower.includes('invoice') || textLower.includes('bill to') || textLower.includes('amount due')) {
    return 'Invoice';
  } else if (textLower.includes('receipt') || textLower.includes('payment received')) {
    return 'Receipt';
  } else if (textLower.includes('id') && (textLower.includes('license') || textLower.includes('identification'))) {
    return 'ID Document';
  } else if (textLower.includes('passport')) {
    return 'Passport';
  } else if (textLower.includes('resume') || textLower.includes('cv') || textLower.includes('curriculum vitae')) {
    return 'Resume';
  } else if (textLower.includes('contract') || textLower.includes('agreement')) {
    return 'Contract';
  } else if (textLower.includes('bank') && textLower.includes('statement')) {
    return 'Bank Statement';
  } else if (textLower.includes('tax') && (textLower.includes('return') || textLower.includes('form'))) {
    return 'Tax Document';
  } else if (textLower.includes('medical') || textLower.includes('patient') || textLower.includes('diagnosis')) {
    return 'Medical Record';
  }
  
  return 'Generic Document';
}

// Helper function to guess data type from value
function guessDataType(value: string): string {
  // Remove common formatting characters for testing
  const cleanValue = value.replace(/[,.\s-]/g, '');
  
  // Email pattern
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) {
    return 'Email';
  }
  
  // Phone number pattern (simple)
  if (/^(\+\d{1,3})?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(value.replace(/\s/g, ''))) {
    return 'Phone';
  }
  
  // Date pattern (various formats)
  if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(value) || 
      /^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}$/.test(value) ||
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}$/i.test(value)) {
    return 'Date';
  }
  
  // Currency pattern
  if (/^[$€£¥][\s]?\d+([.,]\d{1,2})?$/.test(value) || /^\d+([.,]\d{1,2})?[\s]?[$€£¥]$/.test(value)) {
    return 'Currency';
  }
  
  // SSN pattern (US)
  if (/^\d{3}-\d{2}-\d{4}$/.test(value) || /^\d{9}$/.test(cleanValue)) {
    return 'SSN';
  }
  
  // Credit card pattern
  if (/^\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}$/.test(value) || /^\d{16}$/.test(cleanValue)) {
    return 'CreditCard';
  }
  
  // Address pattern (simple)
  if (/\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/.test(value)) {
    return 'Address';
  }
  
  // Name pattern (simple)
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(value)) {
    return 'Name';
  }
  
  // Number pattern
  if (/^\d+$/.test(cleanValue) || /^\d+[.,]\d+$/.test(value.replace(/\s/g, ''))) {
    return 'Number';
  }
  
  // Default to text
  return 'Text';
} 