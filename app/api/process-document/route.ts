import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import {
  TextractClient,
  AnalyzeDocumentCommand,
  FeatureType,
} from "@aws-sdk/client-textract"
import { createId } from "@paralleldrive/cuid2"

const s3Client = new S3Client({
  region: process.env.APP_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
  }
})

const textractClient = new TextractClient({
  region: process.env.APP_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
  }
})

// Define interfaces for our data structures
interface WordBlock {
  id: string;
  text: string;
  boundingBox: any | null;
  polygon: any | null;
  confidence: number;
}

interface ExtractedField {
  id: string;
  label: string;
  value: string;
  confidence: number;
  dataType: string;
  boundingBox?: any | null;
  keyBoundingBox?: any | null;
  valueWordBlocks?: WordBlock[];
  page?: number;
  elementType?: string;
  category?: string;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const documentType = formData.get("documentType") as string || "generic"
    const elementsToExtractStr = formData.get("elementsToExtract") as string
    
    let elementsToExtract = []
    if (elementsToExtractStr) {
      try {
        elementsToExtract = JSON.parse(elementsToExtractStr)
      } catch (e) {
        console.error("Error parsing elementsToExtract:", e)
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Check file type
    const validTypes = [
      "application/pdf",
      "image/jpeg", 
      "image/jpg",
      "image/png", 
      "image/tiff"
    ]
    
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a PDF or image.` },
        { status: 400 }
      )
    }

    // If this is a PDF file, we should handle it differently to avoid AWS Textract compatibility issues
    if (file.type === "application/pdf") {
      // For PDFs, we'll upload it to S3 but add a specific metadata flag 
      // This doesn't affect Textract processing, but helps with document viewer
      const fileBuffer = await file.arrayBuffer()
      const fileBytes = new Uint8Array(fileBuffer)

      // Generate a unique ID for the file
      const fileId = createId()
      const key = `uploads/${fileId}-${file.name}`

      // Upload to S3 with content-disposition metadata for better browser compatibility
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.APP_S3_BUCKET,
          Key: key,
          Body: fileBytes,
          ContentType: file.type,
          ContentDisposition: 'inline', // This helps with PDF rendering in browsers
          Metadata: {
            'document-type': documentType,
            'processing-method': 'page-by-page' // Indicator for how this PDF should be processed
          }
        })
      )

      // For PDFs, return a response that indicates client should use page-by-page processing
      // The client-side code already has logic to handle this
      return NextResponse.json({
        documentType,
        requiresPageByPage: true,
        message: "This PDF document requires page-by-page processing for best results.",
        s3Key: key
      })
    }

    // For non-PDF files (images), continue with direct Textract processing as before
    // Get file buffer
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)

    // Generate a unique ID for the file
    const fileId = createId()
    const key = `uploads/${fileId}-${file.name}`

    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET,
        Key: key,
        Body: fileBytes,
        ContentType: file.type,
      })
    )

    // Define Textract features to use
    const features: FeatureType[] = ["FORMS", "TABLES"]

    // Process with AWS Textract
    const textractResponse = await textractClient.send(
      new AnalyzeDocumentCommand({
        Document: {
          S3Object: {
            Bucket: process.env.APP_S3_BUCKET,
            Name: key,
          },
        },
        FeatureTypes: features,
      })
    )

    // Process extraction based on configured elements
    const extractedText = extractTextFromBlocks(textractResponse.Blocks || [])
    
    // Extract form fields
    let extractedFields = []
    
    // If we have specific elements to extract
    if (elementsToExtract && elementsToExtract.length > 0) {
      console.log(`Extracting ${elementsToExtract.length} configured fields for document type: ${documentType}`)
      extractedFields = extractConfiguredFields(
        textractResponse.Blocks || [],
        elementsToExtract
      )
    } else {
      // Fallback to extracting all fields
      extractedFields = extractAllFields(textractResponse.Blocks || [])
    }

    // Return processed data
    return NextResponse.json({
      documentType,
      confidence: calculateAverageConfidence(textractResponse.Blocks || []),
      extractedText,
      extractedFields,
      textractResponse: textractResponse
    })
  } catch (error) {
    console.error("Error processing document:", error)
    
    // Return appropriate error based on error type
    if (error instanceof Error) {
      // Check for specific AWS errors
      if (error.name === "InvalidImageFormatException") {
        return NextResponse.json(
          { error: "Invalid image format. Please upload a valid document." },
          { status: 400 }
        )
      } else if (error.name === "DocumentTooLargeException") {
        return NextResponse.json(
          { error: "Document is too large. Please upload a smaller document (less than 10MB)." },
          { status: 400 }
        )
      } else if (error.name === "UnsupportedDocumentException") {
        return NextResponse.json(
          { 
            error: "This document type is not supported for direct processing.", 
            requiresPageByPage: true,
            message: "Please use the page-by-page processing option for this document."
          },
          { status: 400 }
        )
      } else if (error.name === "AccessDeniedException") {
        return NextResponse.json(
          { error: "Access denied to AWS services. Please check your credentials." },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    )
  }
}

// Extract text from all blocks
function extractTextFromBlocks(blocks: any[]): string {
  return blocks
    .filter((block) => block.BlockType === "LINE")
    .map((block) => block.Text)
    .join("\n")
}

// Calculate average confidence
function calculateAverageConfidence(blocks: any[]): number {
  if (!blocks.length) return 0
  
  const confidenceSum = blocks.reduce((sum, block) => {
    return sum + (block.Confidence || 0)
  }, 0)
  
  return Math.round(confidenceSum / blocks.length)
}

// Extract all form fields without configuration
function extractAllFields(blocks: any[]): ExtractedField[] {
  const keyValueMap = new Map<string, ExtractedField>()
  const keyMap = new Map()
  const valueMap = new Map()

  // First, identify all KEY and VALUE blocks
  blocks.forEach((block) => {
    if (block.BlockType === "KEY_VALUE_SET") {
      if (block.EntityTypes.includes("KEY")) {
        keyMap.set(block.Id, block)
      } else if (block.EntityTypes.includes("VALUE")) {
        valueMap.set(block.Id, block)
      }
    }
  })

  // Then, associate keys with values
  blocks.forEach((block) => {
    if (block.BlockType === "KEY_VALUE_SET" && block.EntityTypes.includes("KEY")) {
      const key = block
      const keyText = extractTextFromRelations(key, blocks, "CHILD")
      
      // Find all associated values
      if (key.Relationships) {
        key.Relationships.forEach((rel: any) => {
          if (rel.Type === "VALUE") {
            const valueIds = rel.Ids
            const valueBlocks = valueIds.map((id: string) => valueMap.get(id)).filter(Boolean)
            
            const value = valueBlocks[0] // Take the first value block
            if (value) {
              const valueText = extractTextFromRelations(value, blocks, "CHILD")
              
              // Only include if both key and value have text
              if (keyText && valueText) {
                // Get bounding boxes for redaction
                const keyBoundingBox = key.Geometry?.BoundingBox || null;
                const valueBoundingBox = value.Geometry?.BoundingBox || null;
                
                // Get all WORD blocks that are children of this value for more precise redaction
                const valueWordBlocks: WordBlock[] = [];
                if (value.Relationships) {
                  const childRelations = value.Relationships.filter((r: any) => r.Type === "CHILD");
                  childRelations.forEach((childRel: any) => {
                    childRel.Ids.forEach((childId: string) => {
                      const childBlock = blocks.find(b => b.Id === childId);
                      if (childBlock && childBlock.BlockType === "WORD") {
                        valueWordBlocks.push({
                          id: childBlock.Id,
                          text: childBlock.Text,
                          boundingBox: childBlock.Geometry?.BoundingBox || null,
                          polygon: childBlock.Geometry?.Polygon || null,
                          confidence: childBlock.Confidence
                        });
                      }
                    });
                  });
                }
                
                keyValueMap.set(keyText, {
                  id: key.Id,
                  label: keyText,
                  value: valueText,
                  confidence: key.Confidence,
                  dataType: inferDataType(valueText),
                  boundingBox: valueBoundingBox, // Use the value's bounding box for redaction
                  keyBoundingBox: keyBoundingBox, // The key's bounding box
                  valueWordBlocks: valueWordBlocks, // Individual word blocks for precise redaction
                  page: getPageFromBlock(value) // Get page number for multi-page documents
                })
              }
            }
          }
        })
      }
    }
  })

  // Convert map to array and return
  return Array.from(keyValueMap.values())
}

// Extract fields based on configuration
function extractConfiguredFields(blocks: any[], elementsToExtract: any[]): ExtractedField[] {
  const allFields = extractAllFields(blocks)
  const configuredFields: ExtractedField[] = []

  // No specific elements to extract, return all
  if (!elementsToExtract || elementsToExtract.length === 0) {
    return allFields
  }

  // For each element to extract, find the closest match in all fields
  elementsToExtract.forEach((element) => {
    // If the element has a specific pattern, use it
    if (element.pattern) {
      const regexPattern = new RegExp(element.pattern, "i")
      
      // Find fields that match by label or by value
      const matchingFields = allFields.filter(field => 
        regexPattern.test(field.label) || 
        regexPattern.test(field.value)
      )
      
      if (matchingFields.length > 0) {
        // Sort by confidence, highest first
        matchingFields.sort((a, b) => b.confidence - a.confidence)
        
        // Add all matches with their element type for categorization
        matchingFields.forEach(field => {
          configuredFields.push({
            ...field,
            elementType: element.type || "CUSTOM",
            category: element.category || "GENERAL"
          })
        })
      }
    } else {
      // No pattern, match by label similarity
      const targetLabel = element.name.toLowerCase()
      
      // Find fields with similar labels
      const similarFields = allFields.filter(field => {
        const fieldLabel = field.label.toLowerCase()
        return fieldLabel.includes(targetLabel) || 
               targetLabel.includes(fieldLabel) ||
               levenshteinDistance(fieldLabel, targetLabel) <= 3
      })
      
      if (similarFields.length > 0) {
        // Sort by confidence, highest first
        similarFields.sort((a, b) => b.confidence - a.confidence)
        
        // Add all matches with their element type for categorization
        similarFields.forEach(field => {
          configuredFields.push({
            ...field,
            elementType: element.type || "CUSTOM",
            category: element.category || "GENERAL"
          })
        })
      }
    }
  })

  return configuredFields
}

// Get regex pattern for specific data types
function getPatternForType(type: string): RegExp {
  switch (type) {
    case "Email":
      return /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
    case "Phone":
      return /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
    case "SSN":
      return /\b\d{3}[-]?\d{2}[-]?\d{4}\b/
    case "CreditCard":
      return /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/
    case "Date":
      return /\b(0?[1-9]|1[0-2])[\/.-](0?[1-9]|[12]\d|3[01])[\/.-](\d{4}|\d{2})\b/
    case "Currency":
      return /\b[$€£¥]?\s?\d+([.,]\d{1,2})?\b/
    default:
      return /./  // Match anything
  }
}

// Extract text from related blocks
function extractTextFromRelations(block: any, blocks: any[], relationType: string): string {
  if (!block.Relationships) {
    return ""
  }

  const textList: string[] = []
  block.Relationships.forEach((relationship: any) => {
    if (relationship.Type === relationType) {
      relationship.Ids.forEach((id: string) => {
        const relatedBlock = blocks.find((b) => b.Id === id)
        if (relatedBlock && relatedBlock.Text) {
          textList.push(relatedBlock.Text)
        }
      })
    }
  })

  return textList.join(" ")
}

// Infer data type from value
function inferDataType(value: string): string {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  const phonePattern = /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
  const datePattern = /\b(0?[1-9]|1[0-2])[\/.-](0?[1-9]|[12]\d|3[01])[\/.-](\d{4}|\d{2})\b/
  const ssnPattern = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/
  const creditCardPattern = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/
  const currencyPattern = /\b[$€£¥]?\s?\d+([.,]\d{1,2})?\b/
  const addressPattern = /\b\d+\s+([A-Za-z]+\s+){1,3}(St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane)\b/i
  const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/

  if (emailPattern.test(value)) return "Email"
  if (phonePattern.test(value)) return "Phone"
  if (ssnPattern.test(value)) return "SSN"
  if (creditCardPattern.test(value)) return "CreditCard"
  if (currencyPattern.test(value)) return "Currency"
  if (datePattern.test(value)) return "Date"
  if (addressPattern.test(value)) return "Address"
  if (namePattern.test(value)) return "Name"
  
  // If it's mostly digits, call it a number
  if (/^\d+$/.test(value.replace(/[,.\s]/g, ''))) return "Number"
  
  // Default to text
  return "Text"
}

// Helper function to get page number from a block
function getPageFromBlock(block: any): number {
  if (block && block.Page) {
    return block.Page;
  }
  return 1; // Default to page 1
}

// Helper function for string similarity
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
} 