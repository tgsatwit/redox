import { DocumentData, DataElementConfig, ClassificationResult } from "@/lib/types"

export interface AnyBoundingBox {
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface AwsBoundingBox {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

export interface RedactionElement {
  id: string;
  text: string;
  confidence: number;
  pageIndex: number;
  boundingBox: AnyBoundingBox | null;
}

export interface ExtendedRedactionElement extends Omit<RedactionElement, 'boundingBox'> {
  label?: string;
  type?: string;
  isConfigured?: boolean;
  missing?: boolean;
  category?: string;
  value?: string | null;
  boundingBox: AnyBoundingBox | null | undefined;
  action?: DataElementAction;
}

export type DataElementAction = 'Extract' | 'Redact' | 'ExtractAndRedact';

export interface ProcessOptions {
  documentType: string;
  subType?: string;
  elementsToExtract: Array<{
    id: string;
    name: string;
    type: string;
    required?: boolean;
  }>;
  useIdAnalysis?: boolean;
  onProgress?: (status: string, progress: number, total: number) => void;
}

export interface ProcessingOptions extends ProcessOptions {
  onProgress?: (status: string, progress: number, total: number) => void;
}

export interface ProcessingOptionsState {
  extractSpecificElements: boolean;
  redactElements: boolean;
  createSummary: boolean;
}

export interface DocumentProcessorState {
  file: File | null;
  imageUrl: string | null;
  documentData: DocumentData | null;
  redactedImageUrl: string | null;
  isUploading: boolean;
  isProcessing: boolean;
  activeTab: string;
  fieldsToRedact: Set<string>;
  uploadError: string | null;
  processError: string | null;
  extractedText: string | null;
  isExtractingText: boolean;
  isPdfJsLoading: boolean;
  pdfJsLoadError: string | null;
  pdfJsStatus: { loaded: boolean; message?: string };
  isProcessingPageByPage: boolean;
  processingStatus: string;
  processingProgress: number;
  extractedElements: RedactionElement[];
  selectedElements: string[];
  showAwsHelper: boolean;
  pdfViewerError: string | null;
  useAutoClassification: boolean;
  isClassifying: boolean;
  classificationResult: ClassificationResult | null;
  verificationOpen: boolean;
  manualSelections: Array<{
    id: string;
    label: string;
    boundingBox: {
      Left: number;
      Top: number;
      Width: number;
      Height: number;
    };
  }>;
  feedbackSubmitted: boolean;
  selectedSubTypeId: string | null;
  workflowStep: 'upload' | 'classify' | 'process' | 'results';
  useTextExtractionForClassification: boolean;
  isClassifyingWithGPT: boolean;
  gptClassificationResult: {
    documentType: string | null;
    subType: string | null;
    confidence: number;
    reasoning: string;
  } | null;
  processingOptions: ProcessingOptionsState;
}

export interface UseDocumentProcessorReturn {
  state: DocumentProcessorState;
  updateState: (updates: Partial<DocumentProcessorState>) => void;
  getConfiguredDataElements: () => DataElementConfig[];
  handleFileUpload: (file: File | null) => Promise<void>;
  handleProcessDocument: () => Promise<void>;
  handleRedaction: () => Promise<void>;
  toggleFieldRedaction: (fieldId: string) => void;
  handleDownload: () => void;
  resetWorkflow: () => void;
  processWithDocType: (docType: any) => Promise<void>;
  handleProcessPageByPage: () => Promise<void>;
  handleClassifyDocument: () => Promise<void>;
}

export interface ProcessingResult {
  success: boolean;
  error?: string;
  totalPages?: number;
  documentData: DocumentData;
  extractedFields?: Array<{
    id: string;
    value: string;
    confidence: number;
    boundingBox: AnyBoundingBox | null;
  }>;
} 