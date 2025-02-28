export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

// AWS Textract style bounding box (using different property names)
export interface AwsBoundingBox {
  Width: number
  Height: number
  Left: number
  Top: number
}

// Define a type that allows either format of bounding box
export type AnyBoundingBox = BoundingBox | AwsBoundingBox

// Word-level block information for precise redaction
export interface WordBlock {
  id: string
  text: string
  boundingBox: AnyBoundingBox | null
  polygon?: any
  confidence: number
}

export interface ExtractedField {
  id: string
  label: string
  value: string
  dataType: string
  confidence: number
  boundingBox?: AnyBoundingBox | null
  keyBoundingBox?: AnyBoundingBox | null
  valueWordBlocks?: WordBlock[]
  page?: number
  elementType?: string
  category?: string
  originalLabel?: string // Original label before mapping to configured elements
  requiredButMissing?: boolean // Flag for required fields that weren't found
}

export interface DocumentData {
  documentType: string
  confidence: number
  extractedText: string
  extractedFields: ExtractedField[]
}

// Document configuration types
export type DataElementType = 'Text' | 'Number' | 'Date' | 'Currency' | 'Email' | 'Phone' | 'Address' | 'Name' | 'SSN' | 'CreditCard' | 'Custom'

export type DataElementCategory = 'General' | 'PII' | 'Financial' | 'Medical' | 'Legal'

export type DataElementAction = 'Extract' | 'Redact' | 'ExtractAndRedact' | 'Ignore'

export interface DataElementConfig {
  id: string
  name: string
  type: DataElementType
  category: DataElementCategory
  action: DataElementAction
  pattern?: string // For custom regex patterns
  description?: string
  required?: boolean
  isDefault?: boolean // If this is a default field for the document type
}

export interface DocumentTypeConfig {
  id: string
  name: string
  description?: string
  dataElements: DataElementConfig[]
  isActive: boolean
}

export interface AppConfig {
  documentTypes: DocumentTypeConfig[]
  defaultRedactionSettings: {
    redactPII: boolean
    redactFinancial: boolean
  }
}

// For the PDF redaction functionality
export interface RedactionElement {
  id: string
  text: string
  confidence: number
  pageIndex: number
  boundingBox?: AnyBoundingBox
  valueWordBlocks?: WordBlock[]
}

