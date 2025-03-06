import { DocumentData } from "@/lib/types";
import { RedactionElement } from "./index";

export interface FileUploaderProps {
  onFileUpload: (file: File | null) => Promise<void>;
  error?: string | null;
  acceptedTypes?: string[];
  isProcessing?: boolean;
  file?: File | null;
  onWorkflowSelect?: (workflowId: string, isOneOff: boolean) => void;
  availableWorkflows?: Array<{ id: string; name: string }>;
}

export interface DocumentViewerProps {
  imageUrl: string | null;
  onError?: (error: string) => void;
  fileType?: string;
  onPdfLoadError?: (error: string | null) => void;
}

export interface DataExtractorProps {
  data: DocumentData | null;
  elements: RedactionElement[];
  selectedElements: string[];
  onElementSelect: (fieldId: string) => void;
} 