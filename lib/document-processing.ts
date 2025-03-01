import type { DocumentData, ExtractedField, DataElementConfig, ClassificationResult } from "./types"
import { extractTextFallback } from "./text-extraction"

interface ProcessOptions {
  documentType: string
  subType?: string
  elementsToExtract: Array<{
    id: string
    name: string
    type: string
    required?: boolean
  }>
  useIdAnalysis?: boolean
}

// New function to classify a document
export async function classifyDocument(file: File): Promise<ClassificationResult> {
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    console.log("Calling the document classification endpoint...");
    const res = await fetch("/api/classify-document", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("Classification API error response:", errorData);
      throw new Error(errorData.error || "Document classification failed");
    }

    const data = await res.json();
    console.log("Classification API success response:", data);
    
    return {
      documentType: data.documentType,
      confidence: data.confidence,
      modelId: data.modelId,
      classifierId: data.classifierId
    };
  } catch (error) {
    console.error("Document classification error:", error);
    throw error;
  }
}

// Function to submit classification feedback
export async function submitClassificationFeedback(
  documentId: string,
  originalClassification: ClassificationResult | null,
  correctedDocumentType: string | null,
  feedbackSource: 'auto' | 'manual' | 'review' = 'manual',
  documentSubType: string | null = null
): Promise<void> {
  try {
    console.log("Submitting classification feedback...");
    const res = await fetch("/api/classification-feedback", {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        originalClassification,
        correctedDocumentType,
        documentSubType,
        feedbackSource,
        timestamp: Date.now()
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("Feedback API error response:", errorData);
      throw new Error(errorData.error || "Failed to submit classification feedback");
    }

    console.log("Feedback submitted successfully");
  } catch (error) {
    console.error("Error submitting classification feedback:", error);
    throw error;
  }
}

// Modified to optionally use classification first
export async function processDocument(
  file: File, 
  options?: ProcessOptions,
  useClassification: boolean = false
): Promise<DocumentData> {
  let classificationResult: ClassificationResult | null = null;
  
  // If we should use classification and no document type is provided
  if (useClassification && (!options || !options.documentType)) {
    try {
      // Attempt to classify the document
      classificationResult = await classifyDocument(file);
      
      // Create or update options with the classified document type
      if (!options) {
        options = {
          documentType: classificationResult.documentType,
          elementsToExtract: []  // Will use default elements
        };
      } else {
        options = {
          ...options,
          documentType: classificationResult.documentType
        };
      }
      
      // Auto-feedback for high confidence classifications
      if (classificationResult.confidence > 0.9) {
        await submitClassificationFeedback(
          file.name, // Using filename as a simple document ID
          classificationResult,
          null, // No correction needed
          'auto'
        );
      }
    } catch (error) {
      console.error("Classification failed, proceeding with manual document type:", error);
      // Continue with whatever options we have
    }
  }
  
  // Check if this is an ID document and should use ID analysis
  if (options?.documentType === 'ID Document' || options?.useIdAnalysis) {
    try {
      // Use the specialized ID analysis endpoint for ID documents
      return await processIdDocument(file, options);
    } catch (idError) {
      console.error("ID document processing failed, falling back to standard processing:", idError);
      // Continue with standard document processing
    }
  }
  
  // Original document processing logic for non-ID documents
  const formData = new FormData();
  formData.append("file", file);

  if (options) {
    formData.append("documentType", options.documentType);
    formData.append("elementsToExtract", JSON.stringify(options.elementsToExtract));
  }

  try {
    console.log("Calling the document processing endpoint...");
    const res = await fetch("/api/process-document", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("API error response:", errorData);
      
      // If we get an UnsupportedDocumentException, try the text extraction fallback
      if (errorData.error && (
          errorData.error.includes("UnsupportedDocumentException") || 
          errorData.error.includes("This document type is not supported")
        )) {
        console.log("Document not supported by Textract, trying text extraction fallback...");
        return await extractTextFallback(file, options);
      }
      
      throw new Error(errorData.error || "Document processing failed");
    }

    const data = await res.json();
    console.log("API success response:", data);
    
    return {
      documentType: data.documentType || (options ? options.documentType : "Unknown"),
      confidence: data.confidence || 0,
      extractedText: data.extractedText || "",
      extractedFields: data.extractedFields || [],
      classificationResult
    };
  } catch (error) {
    console.error("Document processing error:", error);
    
    // Try the text extraction fallback
    try {
      console.log("Trying text extraction fallback...");
      return await extractTextFallback(file, options);
    } catch (fallbackError) {
      console.error("Fallback extraction failed:", fallbackError);
      
      // If all else fails and we're in development, use mock data
      if (process.env.NODE_ENV === 'development') {
        console.log("Using mock data in development mode");
        // If options are provided, use them to create a more realistic mock
        if (options) {
          return createMockDocumentDataWithConfig(options);
        }
        return createMockDocumentData();
      }
      
      throw error;
    }
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

export async function redactDocument(
  file: File,
  fieldsToRedact: string[],
  documentData: DocumentData
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("fieldsToRedact", JSON.stringify(fieldsToRedact));
  formData.append("documentData", JSON.stringify(documentData));

  try {
    const response = await fetch("/api/redact-document", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.redactedImageUrl;
  } catch (error) {
    console.error("Error redacting document:", error);
    throw error;
  }
}

// Helper function to create mock document data for testing/development
function createMockDocumentData() {
  const mockTypes = {
    invoice: {
      documentType: "Invoice",
      confidence: 95,
      extractedText: "INVOICE\nCompany: Acme Co.\nDate: 2023-05-15\nInvoice #: INV-12345\nAmount: $1,250.00\nBilled To: John Smith",
      extractedFields: [
        {
          id: "field-0",
          label: "Company",
          value: "Acme Co.",
          dataType: "General",
          confidence: 95,
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 }
        },
        {
          id: "field-1",
          label: "Date",
          value: "2023-05-15",
          dataType: "Date",
          confidence: 96,
          boundingBox: { x: 0.1, y: 0.25, width: 0.3, height: 0.05 }
        },
        {
          id: "field-2",
          label: "Invoice #",
          value: "INV-12345",
          dataType: "Text",
          confidence: 94,
          boundingBox: { x: 0.1, y: 0.3, width: 0.3, height: 0.05 }
        },
        {
          id: "field-3",
          label: "Amount",
          value: "$1,250.00",
          dataType: "Currency",
          confidence: 97,
          boundingBox: { x: 0.1, y: 0.35, width: 0.3, height: 0.05 }
        },
        {
          id: "field-4",
          label: "Billed To",
          value: "John Smith",
          dataType: "Name",
          confidence: 93,
          boundingBox: { x: 0.1, y: 0.4, width: 0.3, height: 0.05 }
        }
      ]
    },
    receipt: {
      documentType: "Receipt",
      confidence: 92,
      extractedText: "RECEIPT\nMerchant: Retail Store\nDate: 2023-06-10\nTotal: $85.42\nItems: 3\nPayment Method: Credit Card",
      extractedFields: [
        {
          id: "field-0",
          label: "Merchant",
          value: "Retail Store",
          dataType: "General",
          confidence: 93,
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 }
        },
        {
          id: "field-1",
          label: "Date",
          value: "2023-06-10",
          dataType: "Date",
          confidence: 94,
          boundingBox: { x: 0.1, y: 0.25, width: 0.3, height: 0.05 }
        },
        {
          id: "field-2",
          label: "Total",
          value: "$85.42",
          dataType: "Currency",
          confidence: 95,
          boundingBox: { x: 0.1, y: 0.3, width: 0.3, height: 0.05 }
        },
        {
          id: "field-3",
          label: "Items",
          value: "3",
          dataType: "Number",
          confidence: 91,
          boundingBox: { x: 0.1, y: 0.35, width: 0.3, height: 0.05 }
        },
        {
          id: "field-4",
          label: "Payment Method",
          value: "Credit Card",
          dataType: "General",
          confidence: 90,
          boundingBox: { x: 0.1, y: 0.4, width: 0.3, height: 0.05 }
        }
      ]
    },
    "id-document": {
      documentType: "ID Document",
      confidence: 93,
      extractedText: "DRIVER LICENSE\nName: Jane Doe\nDOB: 1985-10-20\nID#: DL1234567\nAddress: 123 Main St\nExpires: 2025-10-20",
      extractedFields: [
        {
          id: "field-0",
          label: "Name",
          value: "Jane Doe",
          dataType: "Name",
          confidence: 96,
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 }
        },
        {
          id: "field-1",
          label: "DOB",
          value: "1985-10-20",
          dataType: "Date",
          confidence: 94,
          boundingBox: { x: 0.1, y: 0.25, width: 0.3, height: 0.05 }
        },
        {
          id: "field-2",
          label: "ID#",
          value: "DL1234567",
          dataType: "Text",
          confidence: 95,
          boundingBox: { x: 0.1, y: 0.3, width: 0.3, height: 0.05 }
        },
        {
          id: "field-3",
          label: "Address",
          value: "123 Main St",
          dataType: "Address",
          confidence: 93,
          boundingBox: { x: 0.1, y: 0.35, width: 0.3, height: 0.05 }
        },
        {
          id: "field-4",
          label: "Expires",
          value: "2025-10-20",
          dataType: "Date",
          confidence: 92,
          boundingBox: { x: 0.1, y: 0.4, width: 0.3, height: 0.05 }
        }
      ]
    }
  };
  
  // Return a random mock type, defaulting to invoice
  const mockTypeKeys = Object.keys(mockTypes);
  const randomType = mockTypeKeys[Math.floor(Math.random() * mockTypeKeys.length)];
  
  return mockTypes[randomType as keyof typeof mockTypes];
}

// Helper function to get text from a block and its children
function getTextFromBlock(block: any, allBlocks: any[]): string {
  if (block.Text) {
    return block.Text;
  }
  
  // If the block doesn't have text directly, look for WORD children
  if (block.Relationships) {
    const childIds = block.Relationships
      .filter((rel: any) => rel.Type === 'CHILD')
      .flatMap((rel: any) => rel.Ids);
    
    if (childIds.length > 0) {
      return childIds
        .map((childId: string) => {
          const childBlock = allBlocks.find((b: any) => b.Id === childId);
          return childBlock?.Text || '';
        })
        .filter((text: string) => text.length > 0)
        .join(' ');
    }
  }
  
  return '';
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

// Helper function to calculate average confidence
function calculateAverageConfidence(blocks: any[]): number {
  if (!blocks || !blocks.length) return 0;
  const sum = blocks.reduce((acc, block) => acc + (block.Confidence || 0), 0);
  return Math.round(sum / blocks.length);
}

// New function to map extracted fields to configured elements
function mapExtractedFieldsToConfig(
  extractedFields: any[], 
  configuredElements: Array<{id: string, name: string, type: string, required?: boolean}>
): any[] {
  const result: any[] = [];
  
  // For each configured element
  configuredElements.forEach((configElement) => {
    // Try to find a match in the extracted fields
    let matches = extractedFields.filter((field) => {
      const fieldLabel = field.label.toLowerCase();
      const elementName = configElement.name.toLowerCase();
      
      // Check for exact match or if field label contains element name or vice versa
      return fieldLabel === elementName || 
             fieldLabel.includes(elementName) || 
             elementName.includes(fieldLabel);
    });
    
    // If we found matches, use them with the configured element name
    if (matches.length > 0) {
      matches.forEach((match) => {
        result.push({
          ...match,
          label: configElement.name, // Use the configured name
          dataType: configElement.type || match.dataType,
          originalLabel: match.label // Keep original label for reference
        });
      });
    } 
    // If the field is required but not found, add a placeholder
    else if (configElement.required) {
      result.push({
        id: `notfound-${configElement.id}`,
        label: configElement.name,
        value: "[Not Found]",
        dataType: configElement.type || "Text",
        confidence: 0,
        requiredButMissing: true
      });
    }
  });
  
  // Add any remaining extracted fields that didn't match configuration
  extractedFields.forEach((field) => {
    const alreadyIncluded = result.some(r => 
      r.id === field.id || 
      (r.originalLabel && r.originalLabel === field.label)
    );
    
    if (!alreadyIncluded) {
      result.push(field);
    }
  });
  
  return result;
}

// Enhanced mock data function that considers configuration
function createMockDocumentDataWithConfig(options: ProcessOptions): DocumentData {
  // Create a base mock data
  const baseMock = createMockDocumentData();
  
  // Map the extracted fields to the configured elements
  const mappedFields = mapExtractedFieldsToConfig(
    baseMock.extractedFields, 
    options.elementsToExtract
  );
  
  return {
    ...baseMock,
    documentType: options.documentType,
    extractedFields: mappedFields
  };
}

// New function to handle ID document processing
async function processIdDocument(file: File, options?: ProcessOptions): Promise<DocumentData> {
  console.log("Processing ID document with specialized analysis...");
  
  const formData = new FormData();
  formData.append("file", file);
  
  if (options?.subType) {
    formData.append("subType", options.subType);
  }
  
  try {
    console.log("Calling the analyze-id endpoint...");
    const res = await fetch("/api/analyze-id", {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error("ID analysis API error response:", errorData);
      throw new Error(errorData.error || "ID document analysis failed");
    }
    
    const data = await res.json();
    console.log("ID analysis API success response:", data);
    
    // Map the ID-specific fields to our standard format
    const mappedFields = options?.elementsToExtract && options.elementsToExtract.length > 0 
      ? mapExtractedFieldsToConfig(data.extractedFields, options.elementsToExtract)
      : data.extractedFields;
    
    return {
      documentType: options?.documentType || 'ID Document',
      confidence: data.confidence || 0,
      extractedText: '', // ID analysis doesn't provide raw text
      extractedFields: mappedFields || [],
      subType: data.subType, // Include the detected sub-type
    };
  } catch (error) {
    console.error("ID document analysis error:", error);
    throw error;
  }
}
