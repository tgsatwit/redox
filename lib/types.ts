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
  subType?: string // Add support for sub-types
  confidence: number
  extractedText: string
  extractedFields: ExtractedField[]
  classificationResult?: ClassificationResult | null
  textractResponse?: any // Raw Textract response for debugging
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
  documentTypeId?: string // Reference to parent document type
  subTypeId?: string // Reference to sub-type if this element belongs to a sub-type
  aliases?: string[] // Alternative variable names that can be used in incoming payloads
}

// New interface for document sub-types
export interface DocumentSubTypeConfig {
  id: string
  name: string
  description?: string
  dataElements: DataElementConfig[]
  awsAnalysisType?: string
  isActive?: boolean
  documentTypeId: string // Reference to parent document type
}

export interface DocumentTypeConfig {
  id: string
  name: string
  description?: string
  dataElements: DataElementConfig[]
  subTypes?: DocumentSubTypeConfig[] // Changed from subtypes to subTypes for consistency
  isActive: boolean
  trainingDatasets?: TrainingDataset[]
  defaultModelId?: string
}

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  duration: number; // Duration in days
  createdAt: number;
  updatedAt: number;
}

export interface AppConfig {
  documentTypes: DocumentTypeConfig[];
  defaultRedactionSettings: {
    redactPII: boolean;
    redactFinancial: boolean;
  };
  retentionPolicies: RetentionPolicy[];
  promptCategories: PromptCategory[];
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

// Document classification types
export interface ClassificationResult {
  documentType: string
  confidence: number
  modelId?: string
  classifierId?: string
}

export interface ClassificationFeedback {
  id: string
  documentId: string
  originalClassification: ClassificationResult | null
  correctedDocumentType: string | null
  feedbackSource: 'auto' | 'manual' | 'review'
  timestamp: number
  hasBeenUsedForTraining: boolean
}

export interface TrainingExample {
  id: string
  documentType: string
  fileKey: string
  fileName: string
  fileSize: number
  mimeType: string
  dateAdded: number
  status: 'pending' | 'approved' | 'rejected' | 'used'
  sourceFeedbackId?: string
}

export interface TrainingDataset {
  id: string
  documentTypeId: string
  name: string
  description?: string
  examples: TrainingExample[]
  modelId?: string
  modelArn?: string
  modelStatus?: 'TRAINING' | 'TRAINED' | 'FAILED' | 'DELETING' | 'IN_ERROR'
  lastTrainedDate?: number
  version?: number
}

export type PromptRole = 'system' | 'user' | 'assistant';

export interface Prompt {
  id: string;
  name: string;
  description: string;
  role: PromptRole;
  content: string;
  isActive: boolean;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptCategory {
  id: string;
  name: string;
  description: string;
  prompts: Prompt[];
  model?: string; // The AI model to use (e.g., 'gpt-4-turbo', 'claude-3-opus')
  responseFormat?: {
    type: 'text' | 'json_object' | 'json';
    schema?: string; // Optional JSON schema for structured responses
  };
  temperature?: number; // Value between 0 and 2, default might be 1
}

