"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { FileUploader } from "./file-uploader"
import { DocumentViewer } from "./document-viewer"
import { DataExtractor } from "./data-extractor"
import { RedactionControls } from "./redaction-controls"
import { AwsCredentialsHelper } from './aws-credentials-helper'

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast, toast } from "@/components/ui/use-toast"

// Icons
import { 
  Plus, 
  Pencil, 
  Trash2, 
  AlertTriangle, 
  Save, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Copy, 
  Loader2, 
  FileText, 
  Settings, 
  AlignLeft, 
  Scissors, 
  FileSearch, 
  Wrench, 
  Eraser, 
  RefreshCw, 
  FileUp, 
  CheckIcon 
} from "lucide-react"

// Services & Utils
import { useConfigStoreDB } from "@/lib/config-store-db"
import { processDocument, classifyDocument, submitClassificationFeedback } from "@/lib/document-processing"
import { redactDocument } from "@/lib/redaction"
import { convertPdfToBase64 } from "../lib/pdf-utils"
import { ensurePdfJsLoaded, reloadPdfJs } from "@/lib/pdf-preloader"
import { processMultiPagePdf, RedactionElement, applyRedactionsToPdf } from '@/lib/pdf-redaction'

// Types
import type { 
  DocumentData, 
  DocumentTypeConfig, 
  DocumentSubTypeConfig, 
  DataElementType, 
  DataElementCategory, 
  DataElementAction,
  DataElementConfig,
  ClassificationResult 
} from "@/lib/types"

// Add after the document-processor imports 

// Add after ExtendedRedactionElement interface (line ~105)

// Direct mapping table between Textract field names and configured element names
const FIELD_MAPPING_TABLE: Record<string, string[]> = {
  // Name fields with underscore format
  "FIRST_NAME": ["First Name", "Given Name", "Prénom"],
  "GIVEN_NAME": ["First Name", "Given Name", "Prénom"],
  "LAST_NAME": ["Last Name", "Family Name", "Surname", "Nom"],
  "FAMILY_NAME": ["Last Name", "Family Name", "Surname", "Nom"],
  "MIDDLE_NAME": ["Middle Name"],
  "FULL_NAME": ["Full Name", "Name", "Complete Name"],
  
  // Date of Birth variations
  "DATE_OF_BIRTH": ["Date of Birth", "DOB", "Birth Date"],
  "DOB": ["Date of Birth", "DOB", "Birth Date"],
  "BIRTH_DATE": ["Date of Birth", "DOB", "Birth Date"],
  "BIRTHDATE": ["Date of Birth", "DOB", "Birth Date"],
  
  // Document Numbers
  "DOCUMENT_NUMBER": ["Passport Number", "Document Number", "Document ID"],
  "PASSPORT_NUMBER": ["Passport Number", "Document Number"],
  "ID_NUMBER": ["Passport Number", "Document Number", "ID Number"],
  
  // Date fields
  "DATE_OF_ISSUE": ["Date of Issue", "Issue Date"],
  "ISSUE_DATE": ["Date of Issue", "Issue Date"],
  "DATE_OF_EXPIRY": ["Expiration Date", "Expiry Date"],
  "EXPIRY_DATE": ["Expiration Date", "Expiry Date"],
  "EXPIRATION_DATE": ["Expiration Date", "Expiry Date"],
  
  // Other fields
  "NATIONALITY": ["Nationality", "Citizenship"],
  "PLACE_OF_BIRTH": ["Place of Birth", "Birth Place"],
  "MRZ_CODE": ["MRZ Code", "Machine Readable Zone"],
  "ID_TYPE": ["ID Type", "Document Type"]
};

// Add after getConfiguredDataElements function

/**
 * Find a matching configured element for an extracted field using the mapping table
 */
const findMatchingElement = (extractedLabel: string, configuredElements: DataElementConfig[]): DataElementConfig | null => {
  if (!extractedLabel || !configuredElements?.length) {
    return null;
  }

  console.log(`Looking for match for label: ${extractedLabel}`);
  
  // Direct exact matches for underscore format fields - highest priority
  // This is a special case for fields like FIRST_NAME, LAST_NAME, etc.
  const directHumanReadableMap: Record<string, string> = {
    'FIRST_NAME': 'First Name',
    'LAST_NAME': 'Last Name',
    'MIDDLE_NAME': 'Middle Name',
    'FULL_NAME': 'Full Name',
    'DATE_OF_BIRTH': 'Date of Birth',
    'DATE_OF_ISSUE': 'Date of Issue',
    'DATE_OF_EXPIRY': 'Expiration Date',
    'EXPIRATION_DATE': 'Expiration Date',
    'DOCUMENT_NUMBER': 'Document Number',
    'PASSPORT_NUMBER': 'Passport Number',
    'MRZ_CODE': 'MRZ Code',
    'PLACE_OF_BIRTH': 'Place of Birth'
  };
  
  // First priority: direct mapping from underscore format to human readable
  if (directHumanReadableMap[extractedLabel]) {
    const humanReadableName = directHumanReadableMap[extractedLabel];
    const matchingElement = configuredElements.find(
      element => element.name.toLowerCase() === humanReadableName.toLowerCase()
    );
    
    if (matchingElement) {
      console.log(`✅ Found direct underscore format match: "${extractedLabel}" → "${matchingElement.name}"`);
      return matchingElement;
    }
  }

  // Normalize the extracted label
  const normalizedLabel = extractedLabel
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
  
  // Second priority: entry in our mapping table
  if (FIELD_MAPPING_TABLE[normalizedLabel]) {
    const potentialMatches = FIELD_MAPPING_TABLE[normalizedLabel];
    
    for (const potentialMatch of potentialMatches) {
      const matchingElement = configuredElements.find(
        element => element.name.toLowerCase() === potentialMatch.toLowerCase()
      );
      
      if (matchingElement) {
        console.log(`✅ Found mapping table match: "${normalizedLabel}" → "${matchingElement.name}"`);
        return matchingElement;
      }
    }
  }
  
  // Third priority: try normalizing the configured element names and compare
  const matchByNormalization = configuredElements.find(element => {
    const normalizedConfigName = element.name
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');
    
    return normalizedConfigName === normalizedLabel;
  });
  
  if (matchByNormalization) {
    console.log(`✅ Found normalized name match: "${normalizedLabel}" → "${matchByNormalization.name}"`);
    return matchByNormalization;
  }
  
  // Last priority: fuzzy match by substring inclusion
  for (const element of configuredElements) {
    const normalizedConfigName = element.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const normalizedExtractedNoUnderscores = normalizedLabel.replace(/_/g, '');
    
    if (normalizedConfigName.includes(normalizedExtractedNoUnderscores) || 
        normalizedExtractedNoUnderscores.includes(normalizedConfigName)) {
      console.log(`✅ Found fuzzy substring match: "${normalizedLabel}" → "${element.name}"`);
      return element;
    }
  }
  
  console.log(`❌ No match found for: "${extractedLabel}"`);
  return null;
};

// Define missing types
interface AnyBoundingBox {
  // Both formats may be present, so include all possible properties
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface AwsBoundingBox {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

// Helper functions
// Extended RedactionElement type to include properties we need
interface ExtendedRedactionElement extends Omit<RedactionElement, 'boundingBox'> {
  label?: string;
  type?: string;
  isConfigured?: boolean;
  missing?: boolean;
  category?: string;
  value?: string | null;
  boundingBox: AnyBoundingBox | null | undefined;
  action?: DataElementAction; // Add action property to store the configured action
}

// Helper function to check if a bounding box is AWS style (with Left, Top, etc.)
const isAwsBoundingBox = (box: AnyBoundingBox): box is AwsBoundingBox => {
  return 'Left' in box && 'Top' in box && 'Width' in box && 'Height' in box;
};

// Helper function to get position values from any bounding box format
const getBoundingBoxValues = (box: AnyBoundingBox) => {
  if (isAwsBoundingBox(box)) {
    return {
      left: box.Left,
      top: box.Top,
      width: box.Width,
      height: box.Height
    };
  } else {
    return {
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height
    };
  }
};

// Helper function to get the category of an extracted element based on the document type config
const getElementCategory = (element: ExtendedRedactionElement, activeDocType: DocumentTypeConfig | null): string => {
  if (!activeDocType) return 'General';
  
  // Try to match by type or label
  const matchingElement = activeDocType.dataElements.find(
    (config: DataElementConfig) => 
      config.name.toLowerCase() === element.label?.toLowerCase() ||
      config.type.toLowerCase() === element.type?.toLowerCase()
  );
  
  return matchingElement?.category || 'General';
};

// Convert base64 to File
const convertBase64ToFile = (base64Data: string, filename: string, mimeType: string): File => {
  const byteCharacters = atob(base64Data);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  const blob = new Blob(byteArrays, { type: mimeType });
  return new File([blob], filename, { type: mimeType });
};

export function DocumentProcessor() {
  const router = useRouter()
  const { config, activeDocumentTypeId, setActiveDocumentType } = useConfigStoreDB()
  const [file, setFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [documentData, setDocumentData] = useState<DocumentData | null>(null)
  const [redactedImageUrl, setRedactedImageUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState("original")
  const [fieldsToRedact, setFieldsToRedact] = useState<Set<string>>(new Set())
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [isExtractingText, setIsExtractingText] = useState(false)
  const [isPdfJsLoading, setIsPdfJsLoading] = useState(false)
  const [pdfJsLoadError, setPdfJsLoadError] = useState<string | null>(null)
  const [pdfJsStatus, setPdfJsStatus] = useState<{loaded: boolean, message?: string}>({ loaded: false })
  const [isProcessingPageByPage, setIsProcessingPageByPage] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [processingProgress, setProcessingProgress] = useState(0)
  const [extractedElements, setExtractedElements] = useState<RedactionElement[]>([])
  const [selectedElements, setSelectedElements] = useState<string[]>([])
  const [showAwsHelper, setShowAwsHelper] = useState(false)
  const [pdfViewerError, setPdfViewerError] = useState<string | null>(null)
  const [useAutoClassification, setUseAutoClassification] = useState(true)
  const [isClassifying, setIsClassifying] = useState(false)
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [scanForTFN, setScanForTFN] = useState(true)
  const [manualSelections, setManualSelections] = useState<Array<{
    id: string;
    label: string;
    boundingBox: {
      Left: number;
      Top: number;
      Width: number;
      Height: number;
    };
  }>>([])
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const { toast } = useToast()
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string | null>(null)
  
  // New state variables for the enhanced workflow
  const [workflowStep, setWorkflowStep] = useState<'upload' | 'classify' | 'process' | 'results'>('upload')
  const [useTextExtractionForClassification, setUseTextExtractionForClassification] = useState(true)
  const [isClassifyingWithGPT, setIsClassifyingWithGPT] = useState(false)
  const [gptClassificationResult, setGptClassificationResult] = useState<{
    documentType: string | null,
    subType: string | null,
    confidence: number,
    reasoning: string
  } | null>(null)

  // Add after selectedSubTypeId state declaration:
  // Function to get a list of configured data elements based on the current document type/sub-type
  const getConfiguredDataElements = () => {
    if (!activeDocumentTypeId) return [];
    
    const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
    if (!docType) return [];
    
    // If a sub-type is selected, use its data elements
    if (selectedSubTypeId) {
      const subType = docType.subTypes?.find(st => st.id === selectedSubTypeId);
      if (subType) {
        return subType.dataElements;
      }
    }
    
    // Otherwise, use the document type's data elements
    return docType.dataElements;
  };
  
  // Function to check if an extracted field matches a configured data element
  const matchesConfiguredElement = (fieldName: string, configuredElements: DataElementConfig[]) => {
    return configuredElements.some(element => 
      element.name.toLowerCase() === fieldName.toLowerCase() ||
      fieldName.toLowerCase().includes(element.name.toLowerCase())
    );
  };
  
  // Function to filter data elements based on action type
  const filterDataElementsByAction = (elements: DataElementConfig[], actions: DataElementAction[]) => {
    return elements.filter(element => actions.includes(element.action));
  };

  // Preload PDF.js when the component mounts
  useEffect(() => {
    const loadPdfJs = async () => {
      setIsPdfJsLoading(true);
      setPdfJsLoadError(null);
      
      try {
        const result = await ensurePdfJsLoaded();
        setPdfJsStatus({ 
          loaded: result.success, 
          message: result.message 
        });
        
        if (!result.success) {
          setPdfJsLoadError(result.message || "Failed to load PDF.js");
          console.error("PDF.js initialization failed:", result.message);
        } else {
          console.log("PDF.js initialized successfully:", result.message);
        }
      } catch (error) {
        setPdfJsLoadError(error instanceof Error ? error.message : "Unknown error loading PDF.js");
        console.error("Error initializing PDF.js:", error);
      } finally {
        setIsPdfJsLoading(false);
      }
    };
    
    loadPdfJs();
  }, []);

  // Set active tab to original when a new document is uploaded
  useEffect(() => {
    if (imageUrl) {
      setActiveTab("original")
    }
  }, [imageUrl])

  // When the document type changes, reset the selected sub-type
  useEffect(() => {
    setSelectedSubTypeId(null);
  }, [activeDocumentTypeId]);

  // Modified handleFileUpload to transition to the classification step
  const handleFileUpload = async (uploadedFile: File | null) => {
    // Reset all states
    setProcessError(null);
    setUploadError(null);
    setFile(uploadedFile);
    setImageUrl(null);
    setDocumentData(null);
    setRedactedImageUrl(null);
    setExtractedText(null);
    setExtractedElements([]);
    setSelectedElements([]);
    setActiveTab("original");
    setPdfViewerError(null);
    setClassificationResult(null);
    setFeedbackSubmitted(false);
    setGptClassificationResult(null);
    
    if (!uploadedFile) {
      return;
    }

    try {
      setIsUploading(true);

      // Create object URL for display
      const objectUrl = URL.createObjectURL(uploadedFile);
      setImageUrl(objectUrl);
      
      // Move to classification step after successful upload
      setWorkflowStep('classify');
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadError(`Error uploading file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Function to handle classification with GPT-4o
  const handleClassifyWithGPT = async () => {
    if (!file) return;
    
    setIsClassifyingWithGPT(true);
    
    try {
      let textToAnalyze = extractedText;
      let didExtractText = false;
      
      // Extract text if not already available
      if (!textToAnalyze) {
        toast({
          title: "Extracting text",
          description: "Extracting document text before classification",
          variant: "default"
        });
        
        // For PDF files, try client-side extraction
        if (file.type === "application/pdf") {
          try {
            textToAnalyze = await clientSidePdfExtraction(file);
            // Store the extracted text in state for future use
            setExtractedText(textToAnalyze);
            didExtractText = true;
          } catch (error) {
            console.error("Error extracting PDF text:", error);
            setProcessError("Text extraction failed: " + (error instanceof Error ? error.message : "Unknown error"));
          }
        } else {
          // For non-PDF files, use server-side extraction
          const formData = new FormData();
          formData.append("file", file);
          
          const response = await fetch("/api/process-document", {
            method: "POST",
            body: formData
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.extractedText) {
              textToAnalyze = data.extractedText;
              // Store the extracted text in state for future use
              setExtractedText(textToAnalyze);
              didExtractText = true;
              
              // If we get any extracted fields from the API response, add them too
              if (data.extractedFields && data.extractedFields.length > 0) {
                const elements = data.extractedFields.map((field: any) => ({
                  id: field.id || `field-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                  label: field.label,
                  text: field.value || '',
                  type: field.dataType,
                  value: field.value,
                  confidence: field.confidence,
                  boundingBox: field.boundingBox,
                  pageIndex: field.page || 0,
                  isConfigured: true,
                  category: field.category || 'General'
                } as ExtendedRedactionElement));
                
                setExtractedElements(prev => {
                  // Filter out any elements with the same labels
                  const existingLabels = new Set(elements.map((el: ExtendedRedactionElement) => el.label?.toLowerCase()));
                  const filteredPrev = prev.filter(p => {
                    const typedElement = p as ExtendedRedactionElement;
                    return !typedElement.label || !existingLabels.has(typedElement.label.toLowerCase());
                  });
                  
                  return [...filteredPrev, ...elements] as RedactionElement[];
                });
              }
            }
          }
        }
      }
      
      // If we still don't have text to analyze, show an error and return
      if (!textToAnalyze) {
        toast({
          title: "Text extraction failed",
          description: "Unable to extract text for GPT classification",
          variant: "destructive"
        });
        setIsClassifyingWithGPT(false);
        return;
      }
      
      // If we just extracted text, try to match it with data elements
      if (didExtractText) {
        // Enhanced pattern matching for data elements
        const enhancedPatternElements = enhancedDetectPatterns(textToAnalyze);
        
        if (enhancedPatternElements.length > 0) {
          setExtractedElements(prev => {
            // Filter out any elements with the same labels
            const existingLabels = new Set(enhancedPatternElements.map(el => el.label?.toLowerCase()));
            const filteredPrev = prev.filter(p => {
              const typedElement = p as ExtendedRedactionElement;
              return !typedElement.label || !existingLabels.has(typedElement.label.toLowerCase());
            });
            
            return [...filteredPrev, ...enhancedPatternElements] as RedactionElement[];
          });
          
          toast({
            title: "Data elements detected",
            description: `Found ${enhancedPatternElements.length} data elements from text extraction`,
            variant: "default"
          });
        }
      }
      
      // Now proceed with GPT classification using the text
      // Prepare data about available document types and subtypes
      const availableTypes = config.documentTypes
        .filter(dt => dt.isActive)
        .map(dt => ({
          id: dt.id,
          name: dt.name,
          description: dt.description || '',
          subTypes: dt.subTypes
            ?.filter(st => st.isActive)
            .map(st => ({
              id: st.id,
              name: st.name,
              description: st.description || ''
            })) || []
        }));
      
      // Call API to classify with GPT
      const response = await fetch('/api/classify-with-gpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToAnalyze,
          availableTypes: availableTypes,
          fileName: file?.name
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Classification failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      setGptClassificationResult(result);
      
      // If a document type was identified, set it
      if (result.documentType) {
        const matchingDocType = config.documentTypes.find(
          dt => dt.name.toLowerCase() === result.documentType.toLowerCase()
        );
        
        if (matchingDocType) {
          setActiveDocumentType(matchingDocType.id);
          
          // If a sub-type was identified, set it too
          if (result.subType) {
            const matchingSubType = matchingDocType.subTypes?.find(
              st => st.name.toLowerCase() === result.subType?.toLowerCase()
            );
            
            if (matchingSubType) {
              setSelectedSubTypeId(matchingSubType.id);
            }
          }
          
          // Try to match extracted text with configured data elements now that we have a document type
          if (textToAnalyze) {
            tryMatchExtractedTextToElements(textToAnalyze);
          }
        }
      }
      
      toast({
        title: result.documentType 
          ? `Classified as: ${result.documentType}` 
          : "Classification inconclusive",
        description: result.subType 
          ? `Sub-type: ${result.subType}` 
          : "Please select document type manually",
        variant: result.documentType ? "default" : "default"
      });
      
    } catch (error) {
      console.error("GPT classification error:", error);
      toast({
        title: "Classification failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsClassifyingWithGPT(false);
    }
  };
  
  // Define the ProcessingOptions interface
  interface ProcessingOptions {
    redactElements: boolean;
    createSummary: boolean;
    identifyDataElements: boolean;
    saveDocument: {
      original: boolean;
      redacted: boolean;
    };
  }

  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    redactElements: false,
    createSummary: false,
    identifyDataElements: true,
    saveDocument: {
      original: false,
      redacted: false
    }
  });

  // Function to handle the selection of processing options
  const handleProcessOptionChange = (option: 'redactElements' | 'createSummary' | 'identifyDataElements') => {
    setProcessingOptions({
      ...processingOptions,
      [option]: !processingOptions[option]
    });
  };

  // Function to handle save document option changes
  const handleSaveDocumentChange = (type: 'original' | 'redacted') => {
    setProcessingOptions(prev => ({
      ...prev,
      saveDocument: {
        ...prev.saveDocument,
        [type]: !prev.saveDocument[type]
      }
    }));
  };

  // Function to handle retention policy changes
  const handleRetentionPolicyChange = (type: 'original' | 'redacted', value: string) => {
    setSelectedRetentionPolicies(prev => ({
      ...prev,
      [type]: value
    }));
  };
  
  // Function to run all selected processes
  const runSelectedProcesses = async () => {
    setIsProcessing(true);
    setProcessError(null);
    
    try {
      console.log('Starting processing workflow');
      console.log('Using field mapping table with', Object.keys(FIELD_MAPPING_TABLE).length, 'field mappings');
      
      // Always ensure text extraction is done first if not already available
      if (!extractedText) {
        toast({
          title: "Extracting text",
          description: "Text extraction is required for data element matching",
        });
        await handleExtractText();
      }
      
      const processes = [];
      
      // Extract specific elements
      if (processingOptions.identifyDataElements) {
        console.log('Starting element extraction...');
        processes.push(handleProcessDocument());
      }
      
      // Wait for all selected processes to complete
      await Promise.all(processes);
      console.log('All selected processes completed');
      
      // After processing, if redaction is selected and we have elements, apply redactions
      if (processingOptions.redactElements && extractedElements.length > 0) {
        console.log('Starting automatic redaction...');
        
        // Apply redactions
        if (fieldsToRedact.size > 0) {
          console.log(`Applying redactions to ${fieldsToRedact.size} fields`);
          await handleApplyRedactions();
        } else {
          console.log('No fields selected for redaction');
        }
      }
      
      // After other processes are complete, handle the new options
      if (processingOptions.createSummary) {
        console.log('Creating document summary...');
        await createDocumentSummary();
      }
      
      // Handle document saving with retention policies
      if (processingOptions.saveDocument.original || processingOptions.saveDocument.redacted) {
        console.log('Saving document(s) with retention policies...');
        await saveDocumentWithRetention();
      }
    } catch (error) {
      console.error('Error in processing workflow:', error);
      setProcessError(error instanceof Error ? error.message : 'An unknown error occurred');
      toast({
        title: "Processing Error",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Modify handleClassifyDocument to move to next step
  const handleClassifyDocument = async () => {
    if (!file) return;
    
    // Set loading state
    setIsClassifying(true);
    setFeedbackSubmitted(false);
    
    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      
      // Call API endpoint
      const response = await fetch('/api/classify-document', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
        throw new Error(errorData.error || `Failed to classify document: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update state with classification results
      const result = {
        documentType: data.documentType || "Unknown",
        confidence: data.confidence || 0.5,
        modelId: data.modelId,
        classifierId: data.classifierId
      };
      
      setClassificationResult(result);
      
      // If classification is successful and confidence is high, auto-select document type
      if (data.documentType && data.documentType !== "Unknown" && data.confidence > 0.8) {
        const matchingDocType = config.documentTypes.find(
          dt => dt.name.toLowerCase() === data.documentType.toLowerCase()
        );
        
        if (matchingDocType) {
          setActiveDocumentType(matchingDocType.id);
        }
        
        // Move to processing options step
        setWorkflowStep('process');
      }
      
      // Show success toast
      toast({
        title: data.documentType && data.documentType !== "Unknown" 
          ? `Classified as: ${data.documentType}` 
          : "Classification inconclusive",
        description: data.documentType && data.documentType !== "Unknown" 
          ? `Confidence: ${(data.confidence * 100).toFixed(0)}%` 
          : "Please select document type manually",
        variant: data.documentType && data.documentType !== "Unknown" ? "default" : "default"
      });
      
    } catch (error) {
      console.error('Error classifying document:', error);
      toast({
        title: "Classification failed",
        description: (error as Error).message || "An error occurred while classifying the document.",
        variant: "destructive"
      });
    } finally {
      setIsClassifying(false);
    }
  };
  
  // Function to proceed from classification to processing options
  const proceedToProcessingOptions = () => {
    // Verify that a document type is selected
    if (!activeDocumentTypeId) {
      toast({
        title: "Document type required",
        description: "Please select a document type before proceeding",
        variant: "destructive"
      });
      return;
    }
    
    // Submit classification feedback if a result exists
    if (classificationResult && !feedbackSubmitted) {
      submitClassificationFeedbackWithSubType();
    }
    
    // Move to processing options step
    setWorkflowStep('process');
  };
  
  // Function to reset the workflow
  const resetWorkflow = () => {
    setFile(null);
    setImageUrl(null);
    setDocumentData(null);
    setRedactedImageUrl(null);
    setExtractedText(null);
    setExtractedElements([]);
    setSelectedElements([]);
    setClassificationResult(null);
    setGptClassificationResult(null);
    setFeedbackSubmitted(false);
    setProcessError(null);
    setUploadError(null);
    setWorkflowStep('upload');
  };

  // Handle manually reloading PDF.js after clearing cache
  const handleReloadPdfJs = async () => {
    setIsProcessing(true);
    setPdfJsLoadError(null);
    setProcessError("Reloading PDF.js libraries...");
    
    try {
      // Force reload PDF.js
      const result = await reloadPdfJs();
      
      if (result.success) {
        setPdfJsStatus({ loaded: true, message: result.message });
        setProcessError("PDF.js successfully reloaded. Try processing your document again.");
      } else {
        setProcessError(`Failed to reload PDF.js: ${result.message || "Unknown error"}`);
        setPdfJsLoadError(result.message || null);
      }
    } catch (error) {
      console.error("Error reloading PDF.js:", error);
      setProcessError("Failed to reload PDF.js. Please refresh the page manually.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessDocument = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please upload a document first.",
        variant: "destructive"
      });
      return;
    }
    
    // Clear previous errors and states
    setIsProcessing(true);
    setProcessError(null);
    setShowAwsHelper(false);
    
    try {
      // First try to detect if this is a multipage PDF
      if (file.type === 'application/pdf') {
        try {
          const pageCount = await getPdfPageCount(file);
          if (pageCount > 1) {
            console.log(`Multipage PDF detected (${pageCount} pages), switching to page-by-page processing`);
            handleProcessPageByPage();
            return;
          }
        } catch (e) {
          console.warn('Error checking PDF page count:', e);
          // Continue with normal processing
        }
      }

      // If auto-classification is enabled and no document type is selected
      if (useAutoClassification && !activeDocumentTypeId) {
        try {
          setIsClassifying(true);
          setProcessingStatus('Classifying document...');
          setProcessingProgress(20);
          
          // Attempt to classify the document
          const result = await classifyDocument(file);
          setClassificationResult(result);
          
          // Find the document type in our configuration
          const matchingDocType = config.documentTypes.find(
            dt => dt.name.toLowerCase() === result.documentType.toLowerCase()
          );
          
          if (matchingDocType) {
            // If high confidence (>80%), auto-select
            if (result.confidence > 0.8) {
              setActiveDocumentType(matchingDocType.id);
              
              // Submit feedback for high confidence classification
              await submitClassificationFeedback(
                file.name, // Using filename as document ID
                result,
                null, // No correction needed
                'auto'
              );
              
              // Try to auto-select a sub-type based on the document name if sub-types exist
              if (matchingDocType.subTypes && matchingDocType.subTypes.length > 0) {
                // Try to match a sub-type name in the filename or document type
                const fileName = file.name.toLowerCase();
                const potentialSubType = matchingDocType.subTypes.find(subType => 
                  fileName.includes(subType.name.toLowerCase()) ||
                  result.documentType.toLowerCase().includes(subType.name.toLowerCase())
                );
                
                if (potentialSubType) {
                  console.log(`Auto-selected sub-type: ${potentialSubType.name}`);
                  setSelectedSubTypeId(potentialSubType.id);
                }
              }
              
              // Continue with processing
              await processWithDocType(matchingDocType);
            } else {
              // Lower confidence - request verification
              setVerificationOpen(true);
              setIsProcessing(false);
              return;
            }
          } else {
            // Document type not found in our configuration
            toast({
              title: "Unknown document type",
              description: `The document was classified as "${result.documentType}" which is not configured in the system.`,
              variant: "destructive"
            });
            
            // Keep processing state active but show the document type selector
            setIsClassifying(false);
            setIsProcessing(false);
          }
        } catch (error) {
          console.error("Classification error:", error);
          toast({
            title: "Classification failed",
            description: "Could not automatically classify document. Please select the document type manually.",
            variant: "destructive"
          });
          setIsClassifying(false);
          setIsProcessing(false);
          return;
        }
      } else if (activeDocumentTypeId) {
        // If document type is already selected, use it
        const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
        if (docType) {
          await processWithDocType(docType);
        } else {
          throw new Error("Selected document type not found");
        }
      } else {
        // No document type selected and auto-classification disabled
        toast({
          title: "No document type selected",
          description: "Please select a document type before processing.",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }
    } catch (error) {
      console.error('Error processing document:', error);
      setProcessError(`Error: ${(error as Error).message}`);
      setIsProcessing(false);
    }
  };
  
  // Function to process document with a specific document type
  const processWithDocType = async (docType: DocumentTypeConfig) => {
    try {
      setProcessingStatus('Processing document...');
      setProcessingProgress(50);
      
      // Find the selected sub-type if any
      const selectedSubType = selectedSubTypeId 
        ? docType.subTypes?.find(subType => subType.id === selectedSubTypeId)
        : docType.subTypes?.find(subType => subType.isActive);
      
      // Process the document using our processDocument function from lib/document-processing
      const data = await processDocument(
        file!,
        {
          documentType: docType.name,
          subType: selectedSubType?.name, // Include subType if available
          elementsToExtract: selectedSubType ? 
            // If a sub-type is selected, use its data elements
            selectedSubType.dataElements.map(e => ({
              id: e.id,
              name: e.name,
              type: e.type,
              required: e.required
            })) :
            // Otherwise use the main document type's data elements
            docType.dataElements.map(e => ({
              id: e.id,
              name: e.name,
              type: e.type,
              required: e.required
            })),
          // Check if this is an ID document and the sub-type uses ID analysis
          useIdAnalysis: selectedSubType?.awsAnalysisType === 'TEXTRACT_ANALYZE_ID'
        },
        false // Don't use classification again since we already did it
      );
      
      // Handle the processed data
      setDocumentData(data);
      setActiveTab("extracted");
      
      // Get the configured data elements
      const configuredElements = getConfiguredDataElements();
      const extractableElements = filterDataElementsByAction(
        configuredElements, 
        ['Extract', 'ExtractAndRedact']
      );
      
      // Convert fields to elements for redaction if needed
      if (data.extractedFields && data.extractedFields.length > 0) {
        // Check for missing configured elements
        const extractedFieldNames = new Set(data.extractedFields.map(field => field.label.toLowerCase()));
        
        // Add all found fields as elements
        const elements = data.extractedFields.map(field => {
          // Try to find matching configured element
          const matchingConfigElement = configuredElements.find(config => 
            config.name.toLowerCase() === field.label.toLowerCase() ||
            field.label.toLowerCase().includes(config.name.toLowerCase())
          );
          
          return {
            id: field.id,
            label: field.label,
            text: field.value || '',
            type: field.dataType,
            value: field.value,
            confidence: field.confidence,
            boundingBox: field.boundingBox,
            pageIndex: 0,
            isConfigured: matchesConfiguredElement(field.label, configuredElements),
            category: matchingConfigElement?.category || 'General',
            action: matchingConfigElement?.action // Add the action from the configuration
          } as ExtendedRedactionElement;
        });
        
        // Add placeholders for configured elements that weren't found
        const missingElements = extractableElements
          .filter(element => !Array.from(extractedFieldNames).some(
            fieldName => fieldName === element.name.toLowerCase() || 
            fieldName.includes(element.name.toLowerCase()))
          )
          .map(element => ({
            id: `missing-${element.id}`,
            label: element.name,
            text: 'Not found in document',
            type: element.type,
            value: null,
            confidence: 0,
            boundingBox: null as (AnyBoundingBox | null),
            pageIndex: 0,
            isConfigured: true,
            missing: true,
            category: element.category,
            action: element.action // Add the action from the configuration
          } as ExtendedRedactionElement));
        
        const allElements = [...elements, ...missingElements] as unknown as RedactionElement[];
        setExtractedElements(allElements);
        
        // If identifyDataElements option is selected, use GPT for more accurate matching
        if (processingOptions.identifyDataElements) {
          try {
            // Call the GPT matching API
            const enhancedElements = await matchElementsWithGPT(elements, configuredElements);
            if (enhancedElements) {
              // Replace the elements with the enhanced ones, keeping the missing elements
              setExtractedElements([...enhancedElements, ...missingElements] as unknown as RedactionElement[]);
              
              toast({
                title: "Enhanced matching complete",
                description: `Used AI to improve element matching accuracy`,
                variant: "default"
              });
            }
          } catch (matchError) {
            console.error('Error in GPT element matching:', matchError);
            // Continue with regular elements if GPT matching fails
          }
        }
        
        // Auto-select elements that should be redacted based on configuration
        const redactableElementIds = new Set(
          elements
            .filter(element => {
              // Check if it has a redact action from configuration
              return element.action === 'Redact' || element.action === 'ExtractAndRedact';
            })
            .map(element => element.id)
        );
        
        setSelectedElements(Array.from(redactableElementIds));
      }
      
      toast({
        title: "Document processed successfully",
        description: `Extracted ${data.extractedFields?.length || 0} fields${data.subType ? ` (${data.subType})` : ''}`,
        variant: "default"
      });
      
      setIsProcessing(false);
      setIsClassifying(false);
      setProcessingProgress(100);
    } catch (error) {
      console.error('Error in document processing:', error);
      setProcessError(`Error: ${(error as Error).message}`);
      setIsProcessing(false);
      setIsClassifying(false);
    }
  };

  // Handle classification verification
  const handleVerification = async (verified: boolean, correctedTypeId?: string) => {
    if (!file || !classificationResult) return;
    
    try {
      setIsProcessing(true);
      
      // Get the correct document type
      let docTypeId = verified ? 
        // Find the matching doc type ID if verified
        config.documentTypes.find(dt => dt.name.toLowerCase() === classificationResult.documentType.toLowerCase())?.id : 
        // Use the corrected type if not verified
        correctedTypeId;
        
      if (!docTypeId) {
        throw new Error("Could not determine document type");
      }
      
      // Update active document type
      setActiveDocumentType(docTypeId);
      
      // Get the docType object
      const docType = config.documentTypes.find(dt => dt.id === docTypeId);
      if (!docType) {
        throw new Error("Document type not found");
      }
      
      // Submit feedback
      await submitClassificationFeedback(
        file.name, // Using filename as document ID
        classificationResult,
        verified ? null : docType.name,
        'manual',
        selectedSubTypeId ? activeDocType?.subTypes?.find(st => st.id === selectedSubTypeId)?.name || null : null
      );
      
      // Process the document
      await processWithDocType(docType);
    } catch (error) {
      console.error("Verification error:", error);
      setProcessError(`Error: ${(error as Error).message}`);
      setIsProcessing(false);
    } finally {
      setVerificationOpen(false);
    }
  };

  const handleRedaction = async () => {
    if (!file || !documentData) return;
    
    setIsProcessing(true);
    
    try {
      let fileToRedact = file;
      
      // If it's a PDF and we have a base64 version, convert it to a File object
      if (file.type === "application/pdf" && imageUrl && imageUrl.startsWith('data:application/pdf;base64,')) {
        const base64Data = imageUrl.split(',')[1];
        fileToRedact = convertBase64ToFile(base64Data, file.name, 'application/pdf');
      }
      
      const redactedUrl = await redactDocument(
        fileToRedact,
        Array.from(fieldsToRedact),
        documentData
      );
      
      setRedactedImageUrl(redactedUrl);
      setActiveTab("redacted");
    } catch (error) {
      console.error("Error redacting document:", error);
      setProcessError(error instanceof Error ? error.message : "Failed to redact the document.");
    } finally {
      setIsProcessing(false);
    }
  }

  const handleDownload = () => {
    if (!redactedImageUrl) return

    const link = document.createElement("a")
    link.href = redactedImageUrl
    link.download = `redacted-${file?.name || "document"}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleFieldRedaction = (fieldId: string) => {
    const newFieldsToRedact = new Set(fieldsToRedact)
    if (newFieldsToRedact.has(fieldId)) {
      newFieldsToRedact.delete(fieldId)
    } else {
      newFieldsToRedact.add(fieldId)
    }
    setFieldsToRedact(newFieldsToRedact)
  }

  // Determine if the file format is supported for processing
  const isFileFormatSupported = (): boolean => {
    if (!file) return false
    
    const supportedFormats = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff'
    ]
    return supportedFormats.includes(file.type)
  }
  
  // Get active document type
  const activeDocType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId)
  
  // Get available document types (only active ones)
  const availableDocTypes = config.documentTypes.filter(dt => dt.isActive)

  // Function to handle client-side PDF extraction
  const clientSidePdfExtraction = async (file: File): Promise<string> => {
    setIsPdfJsLoading(true)
    setPdfJsLoadError(null)
    
    try {
      // Check if we're in the browser
      if (typeof window === 'undefined') {
        throw new Error('PDF extraction can only be performed in the browser')
      }

      // Use dynamic import to ensure this only loads in the browser
      const { extractTextFromPDF, extractTextUsingBrowserPDF } = await import('@/lib/browser-pdf')
      
      try {
        // First try the PDF.js approach
        setProcessError('Extracting text using PDF.js...')
        const text = await extractTextFromPDF(file, (status) => {
          // Update UI with progress
          if (status.status === 'processing') {
            setProcessError(`${status.message || `Processing page ${status.currentPage} of ${status.totalPages}`}`)
          }
        })
        return text
      } catch (pdfJsError) {
        console.error('PDF.js extraction failed, trying browser fallback:', pdfJsError)
        
        // If PDF.js fails, try the browser-native approach
        setProcessError('Trying alternative extraction method...')
        return await extractTextUsingBrowserPDF(file)
      }
    } catch (error) {
      console.error("Error in client-side PDF extraction:", error)
      setPdfJsLoadError(error instanceof Error ? error.message : "Failed to load PDF.js")
      throw new Error(`Client-side PDF extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsPdfJsLoading(false)
    }
  }

  // Modified function to extract text from the document
  const handleExtractText = async () => {
    if (!file) return;
    
    setIsExtractingText(true);
    setProcessError(null);
    setExtractedText(null);
    
    try {
      console.log("Extracting text from file:", file.name, file.type);
      
      // For PDF files, try client-side extraction only
      if (file.type === "application/pdf") {
        try {
          console.log("Attempting client-side PDF extraction");
          const extractedTextContent = await clientSidePdfExtraction(file);
          setExtractedText(extractedTextContent);
          
          // Try to match extracted text with configured data elements
          if (extractedTextContent && activeDocumentTypeId) {
            tryMatchExtractedTextToElements(extractedTextContent);
          }
          
          setActiveTab("text");
          setIsExtractingText(false);
          return;
        } catch (clientError) {
          console.error("Client-side extraction failed:", clientError);
          setProcessError("Client-side PDF extraction failed: " + (clientError instanceof Error ? clientError.message : "Unknown error"));
          setExtractedText("Error: Client-side PDF extraction failed. Please try a different document or format.");
          setActiveTab("text");
          setIsExtractingText(false);
          return; // Do not fallback to server extraction for PDF files
        }
      }
      
      // For non-PDF files, try server-side extraction
      const formData = new FormData();
      formData.append("file", file);
      
      // Use the process-document endpoint which we know exists and works
      let response = await fetch("/api/process-document", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Text extraction API error:", errorData);
        throw new Error(errorData.error || "Failed to extract text");
      }
      
      const data = await response.json();
      console.log("Text extraction result:", data);
      
      if (data.error) {
        setProcessError(data.error);
        setExtractedText(data.extractedText || "Failed to extract text due to an error.");
      } else {
        setProcessError(null);
        // Use the extractedText from the process-document response
        setExtractedText(data.extractedText || "No text could be extracted from this document.");
        
        // Try to match extracted text with configured data elements
        if (data.extractedText && activeDocumentTypeId) {
          tryMatchExtractedTextToElements(data.extractedText);
        }
      }
      
      setActiveTab("text");
    } catch (error) {
      console.error("Error extracting text:", error);
      setProcessError(`Failed to extract text: ${error instanceof Error ? error.message : "Unknown error"}`);
      setExtractedText("Error: Failed to extract text from document. Please try a different document or format.");
      setActiveTab("text");
    } finally {
      setIsExtractingText(false);
    }
  }

  // New function to try matching extracted text to configured data elements
  const tryMatchExtractedTextToElements = (text: string) => {
    // Get configured data elements for the current document type/sub-type
    const configuredElements = getConfiguredDataElements();
    if (!configuredElements.length) return;
    
    // Build a list of elements to match
    const elementsToMatch = configuredElements.map(element => ({
      id: element.id,
      name: element.name,
      type: element.type,
      category: element.category,
      action: element.action,
      value: null,
      confidence: 0
    }));
    
    // Common patterns for different data types
    const patterns: Record<string, RegExp> = {
      // Document numbers
      'Passport Number': /[A-Z][0-9]{7,8}/,
      'Document Number': /(?:Document\s+(?:No|Number)[.:]\s*|No[.:]?\s*)([A-Z0-9]{5,})/i,
      
      // Names
      'Full Name': /(?:Name|Nom)[.:]\s*([A-Z\s]+)/i,
      
      // Dates
      'Date of Birth': /(?:Date\s+of\s+[Bb]irth|Birth\s+Date|DOB)[.:]\s*(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
      'Expiration Date': /(?:Date\s+of\s+[Ee]xpiry|Expiry\s+Date|Expiration)[.:]\s*(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
      
      // Locations
      'Place of Birth': /(?:Place\s+of\s+[Bb]irth|Birth\s+Place)[.:]\s*([A-Z][A-Za-z\s]+)/i,
      
      // General identifiers
      'ID Number': /ID(?:\s+Number)?[.:]\s*([A-Z0-9]{5,})/i,
    };
    
    // Match patterns to text
    const matchedElements: ExtendedRedactionElement[] = [];
    
    // Try to match each configured element
    elementsToMatch.forEach(element => {
      // Try to find a matching pattern
      const patternKey = Object.keys(patterns).find(key => 
        key.toLowerCase() === element.name.toLowerCase() || 
        element.name.toLowerCase().includes(key.toLowerCase())
      );
      
      if (patternKey) {
        const pattern = patterns[patternKey];
        const match = text.match(pattern);
        
        if (match && match[1]) {
          matchedElements.push({
            id: `matched-${element.id}-${Date.now()}`,
            label: element.name,
            text: match[1].trim(),
            type: element.type,
            value: match[1].trim(),
            confidence: 0.7, // Medium confidence for pattern matches
            boundingBox: null,
            pageIndex: 0,
            isConfigured: true,
            category: element.category,
            action: element.action // Add the action from the configuration
          });
        }
      } else {
        // Try simple direct matching - look for the element name followed by text
        const simplePattern = new RegExp(`${element.name}[.:]*\\s*([^\\n\\r.]{2,30})`, 'i');
        const match = text.match(simplePattern);
        
        if (match && match[1]) {
          matchedElements.push({
            id: `matched-${element.id}-${Date.now()}`,
            label: element.name,
            text: match[1].trim(),
            type: element.type,
            value: match[1].trim(),
            confidence: 0.5, // Lower confidence for simple matches
            boundingBox: null,
            pageIndex: 0,
            isConfigured: true,
            category: element.category,
            action: element.action // Add the action from the configuration
          });
        }
      }
    });
    
    // Add any elements found
    if (matchedElements.length > 0) {
      setExtractedElements(prev => {
        // Filter out any previously matched elements with the same labels
        const existingLabels = new Set(matchedElements.map(el => el.label?.toLowerCase()));
        const filteredPrev = prev.filter(p => {
          const typedElement = p as ExtendedRedactionElement;
          return !typedElement.label || !existingLabels.has(typedElement.label.toLowerCase());
        });
        
        return [...filteredPrev, ...matchedElements] as RedactionElement[];
      });
      
      toast({
        title: "Data elements detected",
        description: `Found ${matchedElements.length} data elements from text extraction`,
        variant: "default"
      });
    }
  };

  // Add a new function to handle page-by-page processing
  const handleProcessPageByPage = async () => {
    if (!file || !activeDocType) return;
    
    try {
      setIsProcessingPageByPage(true);
      setProcessingStatus('Starting page-by-page processing...');
      setProcessingProgress(0);
      setProcessError(null);
      setShowAwsHelper(false);
      
      // Process the PDF page by page
      const result = await processMultiPagePdf(file, {
        documentType: activeDocType.name,
        onProgress: (status, progress, total) => {
          setProcessingStatus(status);
          setProcessingProgress(Math.floor((progress / total) * 100));
        }
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to process document');
      }
      
      // Update state with the extracted text and elements
      setExtractedText(result.extractedText || '');
      setExtractedElements(result.extractedFields || []);
      
      // Run pattern detection on the extracted text
      if (result.extractedText) {
        const patternElements = detectPatterns(result.extractedText);
        if (patternElements.length > 0) {
          // Add pattern-detected elements
          setExtractedElements(prev => [...prev, ...patternElements]);
          
          toast({
            title: "Pattern Detection",
            description: `Found ${patternElements.length} additional elements using pattern matching`,
            variant: "default"
          });
        }
      }
      
      // Update processing state
      setProcessingStatus('Processing complete!');
      setProcessingProgress(100);
    } catch (error) {
      console.error('Error in page-by-page processing:', error);
      
      // Check if this is an AWS configuration error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Missing required AWS configuration')) {
        setProcessError('AWS credentials are not properly configured. Please check your .env.local file.');
        setShowAwsHelper(true);
      } else {
        setProcessError(errorMessage);
        setShowAwsHelper(false);
      }
      
      // Reset progress
      setProcessingProgress(0);
    } finally {
      setTimeout(() => {
        setIsProcessingPageByPage(false);
      }, 1000); // Keep status visible briefly
    }
  };

  const toggleElementSelection = (elementId: string) => {
    const newSelectedElements = selectedElements.includes(elementId) ? selectedElements.filter(id => id !== elementId) : [...selectedElements, elementId];
    setSelectedElements(newSelectedElements);
  };

  const handleApplyRedactions = async () => {
    if (!file) {
      toast({
        title: "Error",
        description: "No file available for redaction.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Use the original file for redaction
      const fileToRedact = file;
      
      // Log the bounding boxes of elements to be redacted for debugging
      console.log("Elements to be redacted:");
      const elementsToRedact = extractedElements.filter(el => selectedElements.includes(el.id));
      elementsToRedact.forEach(el => {
        console.log(`Element ID: ${el.id}, Label: ${(el as any).label || 'No label'}, Bounding Box:`, el.boundingBox);
        
        if (!el.boundingBox) {
          console.warn(`⚠️ Element ${el.id} has no bounding box! Redaction may not work correctly.`);
        }
      });
      
      // Create the document data structure expected by redactDocument
      const documentDataForRedaction = {
        documentType: activeDocType?.name || 'Unknown',
        confidence: 100,
        extractedText: extractedText || '',
        extractedFields: extractedElements.map(element => {
          const boundingBox = element.boundingBox;
          
          // Log each element's bounding box to help debug
          if (selectedElements.includes(element.id)) {
            console.log(`Sending element for redaction - ID: ${element.id}, Bounding Box:`, boundingBox);
          }
          
          return {
            id: element.id,
            label: (element as any).label || 'Text',
            value: element.text,
            dataType: (element as any).type || 'Text',
            confidence: element.confidence,
            boundingBox: boundingBox, // Ensure we're passing the boundingBox correctly
            page: element.pageIndex
          };
        })
      };
      
      // Call the redaction function
      const redactedUrl = await redactDocument(
        fileToRedact,
        Array.from(selectedElements),
        documentDataForRedaction
      );
      
      // Update state with the redacted image URL
      setRedactedImageUrl(redactedUrl);
      setActiveTab("redacted");
      
      toast({
        title: "Redaction complete",
        description: "The document has been redacted successfully.",
        variant: "default"
      });
    } catch (error) {
      console.error("Error redacting document:", error);
      setProcessError(error instanceof Error ? error.message : "Failed to redact the document.");
      
      toast({
        title: "Redaction failed",
        description: error instanceof Error ? error.message : "Failed to redact the document.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a test function to verify the PDF page splitting and Textract processing
  const handleTestPageSplitting = async () => {
    if (!file || file.type !== "application/pdf") {
      setProcessError("Please upload a PDF file first");
      return;
    }
    
    try {
      setIsProcessing(true);
      setProcessError("Starting test: splitting PDF into pages...");
      
      // Split the PDF into pages
      const { splitPdfIntoPages } = await import('@/lib/pdf-utils');
      const pagesResult = await splitPdfIntoPages(file, {
        onProgress: (status, current, total) => {
          setProcessError(`${status} (${current}/${total})`);
        }
      });
      
      if (!pagesResult || pagesResult.pages.length === 0) {
        throw new Error("Failed to split PDF into pages");
      }
      
      setProcessError(`Successfully split PDF into ${pagesResult.pages.length} pages. Testing first page with Textract...`);
      
      // Take the first page and test with our test endpoint
      const firstPage = pagesResult.pages[0];
      const formData = new FormData();
      formData.append('file', firstPage);
      
      // Call our test endpoint
      const response = await fetch('/api/test-image-processing', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setProcessError(`Test successful! Extracted ${result.blockCount} text blocks from the first page.`);
        setExtractedText(`Test results from first page:\n\n${result.extractedText}`);
        setActiveTab("text");
      } else {
        throw new Error(result.error || "Unknown error in test");
      }
    } catch (error) {
      console.error("Test error:", error);
      setProcessError(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a comprehensive diagnostic test function
  const handleDiagnosticTest = async () => {
    if (!file || file.type !== "application/pdf") {
      setProcessError("Please upload a PDF file first");
      return;
    }
    
    try {
      setIsProcessing(true);
      setProcessError("Starting diagnostic tests...");
      
      // Create form data with the PDF file
      const formData = new FormData();
      formData.append('file', file);
      
      // Call our diagnostic test endpoint
      const response = await fetch('/api/test-pdf-processing', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      
      // Format results for display
      const formattedResults = `
# PDF Diagnostic Test Results

## PDF Information
${JSON.stringify(result.pdfInfo, null, 2)}

## Direct Textract Result
${JSON.stringify(result.directTextractResult, null, 2)}

## Page Image Processing Result
${JSON.stringify(result.pageImageResult, null, 2)}

## Recommendations
${result.recommendations?.join('\n') || 'No recommendations provided'}
      `;
      
      setExtractedText(formattedResults);
      setActiveTab("text");
      setProcessError("Diagnostic tests completed. See results in the text tab.");
    } catch (error) {
      console.error("Diagnostic test error:", error);
      setProcessError(`Diagnostic test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to handle PDF viewer errors
  const handlePdfViewerError = (error: string | null) => {
    setPdfViewerError(error)
  }

  // Updated feedback submission function that includes sub-type information
  const submitClassificationFeedbackWithSubType = async () => {
    if (!file || !activeDocumentTypeId) return;
    
    try {
      // Show processing state
      toast({
        title: "Submitting feedback...",
        description: "Please wait while we process your feedback.",
        variant: "default"
      });
      
      const selectedDocType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
      if (!selectedDocType) {
        throw new Error("Selected document type not found");
      }
      
      // Get the selected sub-type name if any
      const selectedSubTypeName = selectedSubTypeId && activeDocType?.subTypes 
        ? activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.name || null
        : null;
      
      // Log what we're about to send for easier debugging
      console.log("Submitting classification feedback:", {
        documentId: file?.name || 'unknown-document',
        originalClassification: classificationResult,
        correctedDocumentType: selectedDocType.name,
        documentSubType: selectedSubTypeName,
        feedbackSource: 'manual'
      });
      
      await submitClassificationFeedback(
        file?.name || 'unknown-document',
        classificationResult,
        selectedDocType.name,
        'manual',
        selectedSubTypeName
      );
      
      setFeedbackSubmitted(true);
      
      toast({
        title: "Feedback submitted",
        description: `This will help improve classification for future documents.`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Feedback submission failed",
        description: (error as Error).message || "An error occurred while submitting feedback.",
        variant: "destructive"
      });
    }
  };

  // Helper function to get PDF page count
  const getPdfPageCount = async (pdfFile: File): Promise<number> => {
    try {
      // First load the PDF.js library
      const pdfJsLoaded = await ensurePdfJsLoaded();
      
      if (!pdfJsLoaded.success || typeof window === 'undefined' || !window.pdfjsLib) {
        console.warn('PDF.js not loaded properly, assuming single page PDF');
        return 1;
      }
      
      // Get array buffer from file
      const arrayBuffer = await pdfFile.arrayBuffer();
      
      // Load the PDF document
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // Return page count
      return pdf.numPages;
    } catch (error) {
      console.error('Error getting PDF page count:', error);
      return 1; // Default to 1 page on error
    }
  };

  // Function to detect patterns in extracted text
  const detectPatterns = (text: string) => {
    if (!text) return [];
    
    const patterns = [
      {
        type: 'Passport Number',
        regex: /[A-Z][0-9]{7,8}/g, // Common passport number format
        confidence: 0.9
      },
      {
        type: 'MRZ Code',
        regex: /P[<][A-Z]{3}[A-Z0-9<]{39,}/g, // Machine Readable Zone first line
        confidence: 0.95
      },
      {
        type: 'MRZ Code Line 2',
        regex: /[A-Z0-9<]{44}/g, // Machine Readable Zone second line
        confidence: 0.95
      }
    ];
    
    const detectedElements: Array<RedactionElement & { label?: string; type?: string; category?: string }> = [];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern.regex);
      if (matches) {
        matches.forEach((match, idx) => {
          // Find position in text
          const index = text.indexOf(match);
          if (index !== -1) {
            // Add a default bounding box for pattern-detected elements
            // Position them in a vertical stack in the top-right corner
            // with slight offsets based on index to make them visible
            detectedElements.push({
              id: `pattern-${pattern.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              text: match,
              label: pattern.type, // Extended property
              type: pattern.type, // Use the specific pattern type instead of generic "Pattern"
              category: "PII", // Mark pattern-detected elements as PII by default
              confidence: pattern.confidence,
              pageIndex: 0,
              // Add default bounding box for pattern-detected elements
              boundingBox: {
                Left: 0.7, // Position in right side
                Top: 0.1 + (idx * 0.05), // Stack vertically with offset
                Width: 0.25,
                Height: 0.04
              }
            });
          }
        });
      }
    });
    
    return detectedElements;
  };

  // Enhanced pattern detection function with better data element extraction
  const enhancedDetectPatterns = (text: string): ExtendedRedactionElement[] => {
    if (!text) return [];
    
    // Define patterns with categories and types
    const patterns = [
      // Document IDs
      {
        type: 'Document Number',
        regex: /(?:Document\s+(?:No|Number)[.:]\s*|No[.:]?\s*)([A-Z0-9]{5,})/i,
        confidence: 0.85,
        category: 'PII'
      },
      {
        type: 'Passport Number',
        regex: /(?:Passport\s+(?:No|Number)[.:]\s*|No[.:]?\s*)([A-Z][0-9]{7,8})/i,
        confidence: 0.9,
        category: 'PII'
      },
      
      // Personal information
      {
        type: 'Full Name',
        regex: /(?:Name|Nom)[.:]\s*([A-Z][a-zA-Z\s\-']{2,})/i,
        confidence: 0.8,
        category: 'PII'
      },
      {
        type: 'Date of Birth',
        regex: /(?:Date\s+of\s+[Bb]irth|Birth\s+Date|DOB)[.:]\s*(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
        confidence: 0.85,
        category: 'PII'
      },
      {
        type: 'Expiration Date',
        regex: /(?:Date\s+of\s+[Ee]xpiry|Expiry\s+Date|Expiration|Valid\s+Until)[.:]\s*(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
        confidence: 0.85,
        category: 'General'
      },
      {
        type: 'Place of Birth',
        regex: /(?:Place\s+of\s+[Bb]irth|Birth\s+Place)[.:]\s*([A-Z][A-Za-z\s,\.]+)/i,
        confidence: 0.8,
        category: 'PII'
      },
      
      // Contact information
      {
        type: 'Email',
        regex: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/,
        confidence: 0.95,
        category: 'PII'
      },
      {
        type: 'Phone Number',
        regex: /(?:Phone|Tel|Telephone)[.:]\s*(\+?[\d\s\-()]{7,})/i,
        confidence: 0.85,
        category: 'PII'
      },
      {
        type: 'Address',
        regex: /(?:Address|Addr)[.:]\s*([A-Z0-9][A-Za-z0-9\s,\.'#-]{5,})/i,
        confidence: 0.75,
        category: 'PII'
      },
      
      // Financial information
      {
        type: 'Account Number',
        regex: /(?:Account\s+(?:No|Number)|Acct[.:])[.\s:]*([0-9]{6,})/i,
        confidence: 0.85,
        category: 'PII'
      },
      
      // Machine readable zones
      {
        type: 'MRZ Code',
        regex: /P[<][A-Z]{3}[A-Z0-9<]{39,}/g,
        confidence: 0.95,
        category: 'PII'
      },
      {
        type: 'MRZ Code Line 2',
        regex: /[0-9]{6,}[<][0-9][A-Z]{3}[<]{25,}/g,
        confidence: 0.95,
        category: 'PII'
      }
    ];
    
    const detectedElements: ExtendedRedactionElement[] = [];
    const textLines = text.split('\n');
    
    // Process each pattern
    patterns.forEach(pattern => {
      let match;
      let regex = new RegExp(pattern.regex);
      
      // Try to match in full text first
      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[1] || match[0];
        const startIndex = match.index;
        const endIndex = startIndex + matchedText.length;
        
        // Find the line where the match occurs
        let lineNumber = 0;
        let currentPos = 0;
        for (let i = 0; i < textLines.length; i++) {
          const lineLength = textLines[i].length + 1; // +1 for newline
          if (startIndex >= currentPos && startIndex < currentPos + lineLength) {
            lineNumber = i;
            break;
          }
          currentPos += lineLength;
        }
        
        // Create a bounding box estimation based on the line position
        const totalLines = textLines.length;
        const boundingBox = {
          Left: 0.1, // Position in left side
          Top: lineNumber / totalLines, // Vertical position based on line number
          Width: 0.6, // Width proportional to page
          Height: 1 / totalLines // Height based on the line height
        };
        
        detectedElements.push({
          id: `pattern-${pattern.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          text: matchedText,
          label: pattern.type,
          type: pattern.type,
          category: pattern.category,
          confidence: pattern.confidence,
          pageIndex: 0,
          boundingBox: boundingBox,
          value: matchedText
        });
        
        // Move to the next match
        regex.lastIndex = endIndex;
      }
    });
    
    // If we have active document type, try to match elements specifically for that type
    if (activeDocumentTypeId) {
      const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
      if (docType) {
        // Try to find document-type specific elements
        docType.dataElements.forEach(element => {
          // Create a simple regex for this element name
          const elementRegex = new RegExp(`${element.name}[.:]*\\s*([^\\n\\r.]{2,30})`, 'i');
          const match = text.match(elementRegex);
          
          if (match && match[1] && !detectedElements.some(de => de.label === element.name)) {
            // Add this element if not already detected
            detectedElements.push({
              id: `matched-${element.id}-${Date.now()}`,
              label: element.name,
              text: match[1].trim(),
              type: element.type,
              value: match[1].trim(),
              confidence: 0.7,
              boundingBox: {
                Left: 0.1,
                Top: 0.1 + (detectedElements.length * 0.05),
                Width: 0.6,
                Height: 0.04
              },
              pageIndex: 0,
              isConfigured: true,
              category: element.category
            });
          }
        });
      }
    }
    
    return detectedElements;
  };

  // New function to match extracted elements with configured elements
  const matchExtractedWithConfigured = async (initialElements?: ExtendedRedactionElement[]) => {
    console.log('Starting matchExtractedWithConfigured');
    try {
      // Get the configured data elements for current document type/subtype
      const configuredElements = getConfiguredDataElements();
      if (!configuredElements.length) {
        console.log('No configured elements found');
        return;
      }
      
      console.log(`Found ${configuredElements.length} configured elements`);
      
      // Use provided elements or current extracted elements
      // Cast extracted elements to ExtendedRedactionElement to ensure type safety
      const workingElements: ExtendedRedactionElement[] = (initialElements || 
        extractedElements.map(el => ({
          ...el,
          // Ensure all required properties for ExtendedRedactionElement exist
          label: (el as any).label || null,
          category: (el as any).category || null,
          boundingBox: el.boundingBox || null,
          text: el.text || "",
          confidence: el.confidence || 0,
          pageIndex: el.pageIndex || 0
        } as ExtendedRedactionElement))
      );
      
      if (!workingElements || workingElements.length === 0) {
        console.log('No elements to match');
        return;
      }
      
      console.log(`Working with ${workingElements.length} elements to match`);
      
      // Create a new array to hold the matched elements
      const matchedElements: ExtendedRedactionElement[] = [];
      const unmatchedExtractedElements: ExtendedRedactionElement[] = [];
      
      // Clone the configured elements to track which ones were matched
      const unmatched = [...configuredElements];
      
      // Debug the bounding boxes in the original elements
      workingElements.forEach(el => {
        console.log(`Element "${(el as ExtendedRedactionElement).label || el.id}" bounding box:`, el.boundingBox);
      });
      
      // First try to match using the extracted element label as-is (underscore format)
      console.log("FIRST PASS: Direct matching with element labels");
      for (const element of workingElements) {
        if (!(element as ExtendedRedactionElement).label) {
          console.log('Element missing label, skipping for direct match', element);
          continue;
        }
        
        // Try to find a direct match in the configured elements
        const directMatch = configuredElements.find(config => {
          // Normalize both names for comparison
          const normalizedConfig = config.name
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '');
          
          const normalizedLabel = (element as ExtendedRedactionElement).label!
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '');
            
          return normalizedConfig === normalizedLabel;
        });
        
        if (directMatch) {
          console.log(`Direct match found for "${(element as ExtendedRedactionElement).label}" → "${directMatch.name}"`);
          const matchingIndex = unmatched.findIndex(e => e.id === directMatch.id);
          if (matchingIndex !== -1) {
            unmatched.splice(matchingIndex, 1);
          }
          
          // Create a new matched element
          const matchedElement: ExtendedRedactionElement = {
            id: element.id,
            text: element.text,
            confidence: element.confidence,
            pageIndex: element.pageIndex,
            value: element.text,
            label: directMatch.name,
            isConfigured: true,
            action: directMatch.action as DataElementAction,
            category: directMatch.category || (element as ExtendedRedactionElement).category || 'Unknown',
            // Explicitly preserve the bounding box
            boundingBox: element.boundingBox,
          };
          
          matchedElements.push(matchedElement);
        }
      }
      
      // Second pass - use the mapping table for remaining elements
      console.log("SECOND PASS: Using mapping table for remaining elements");
      const remainingElements = workingElements.filter(el => 
        !matchedElements.some(matched => matched.label === (el as ExtendedRedactionElement).label)
      );
      
      for (const element of remainingElements) {
        if (!(element as ExtendedRedactionElement).label) {
          console.log('Element missing label, skipping', element);
          unmatchedExtractedElements.push(element as ExtendedRedactionElement);
          continue;
        }
        
        // Try to find a match using our mapping function
        const label = (element as ExtendedRedactionElement).label;
        // Ensure label is a string before passing to findMatchingElement
        const matchingConfig = label ? findMatchingElement(label, configuredElements) : null;
        
        if (matchingConfig) {
          // Found a match
          const matchingIndex = unmatched.findIndex(e => e.id === matchingConfig.id);
          if (matchingIndex !== -1) {
            unmatched.splice(matchingIndex, 1);
          }
          
          // Create a new matched element
          const matchedElement: ExtendedRedactionElement = {
            id: element.id,
            text: element.text,
            confidence: element.confidence,
            pageIndex: element.pageIndex,
            value: element.text,
            label: matchingConfig.name,
            isConfigured: true,
            action: matchingConfig.action as DataElementAction,
            category: matchingConfig.category || (element as ExtendedRedactionElement).category || 'Unknown',
            // Explicitly preserve the bounding box
            boundingBox: element.boundingBox, 
          };
          
          console.log(`Matched "${(element as ExtendedRedactionElement).label}" → "${matchingConfig.name}" with bounding box:`, matchedElement.boundingBox);
          
          matchedElements.push(matchedElement);
        } else {
          // No match found
          unmatchedExtractedElements.push(element as ExtendedRedactionElement);
        }
      }
      
      console.log(`Matched ${matchedElements.length} elements`);
      console.log(`Have ${unmatchedExtractedElements.length} unmatched extracted elements`);
      console.log(`Have ${unmatched.length} unmatched configured elements`);
      
      // Create placeholder elements for all unmatched configured elements
      const unmatchedPlaceholders = unmatched.map(config => {
        return {
          id: config.id,
          category: config.category || 'Unknown',
          name: config.name,
          text: "", // Required property
          confidence: 0, // Required property
          pageIndex: 0, // Required property
          isConfigured: true,
          missing: true,
          action: config.action as DataElementAction,
          boundingBox: null,
          label: config.name // Add label property
        } as ExtendedRedactionElement;
      });
      
      // Combine matches, unmatched extracted elements, and placeholders for unmatched configured elements
      const resultElements = [
        ...matchedElements,
        ...unmatchedExtractedElements,
        ...unmatchedPlaceholders
      ];
      
      // Log bounding boxes for matched elements for verification
      console.log("BOUNDING BOX CHECK - Matched elements:");
      matchedElements.forEach(el => {
        console.log(`${el.label || el.id} bounding box:`, el.boundingBox);
      });
      
      // Update state with all elements
      setExtractedElements(resultElements as RedactionElement[]);
      
      // Log the matching results for debugging
      console.log('Matching complete. Final element count:', resultElements.length);
      
      toast({
        title: "Element matching complete",
        description: `${matchedElements.length} elements matched. ${unmatchedPlaceholders.length} configured elements without matches.`,
        variant: "default",
      });
      
      return resultElements;
    } catch (error) {
      console.error('Error in matchExtractedWithConfigured:', error);
      toast({
        title: "Error matching elements",
        description: `Error: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
      return null;
    }
  };

  // Add the UI to display the document summary in the results tab
  // Find the TabsContent with value="extracted" and add a new section for the summary:

  // Add state to store the document summary
  const [documentSummary, setDocumentSummary] = useState<string | null>(null);

  // Then add the createDocumentSummary function near the other document processing functions
  const createDocumentSummary = async () => {
    if (!extractedText || !activeDocType) {
      toast({
        title: "Cannot create summary",
        description: "Extracted text and document type are required for summary creation",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Prepare the summary request data
      const summaryData = {
        documentType: activeDocType.name,
        extractedText: extractedText,
        extractedElements: extractedElements,
        documentSubType: selectedSubTypeId ? 
          (activeDocType.subTypes?.find(st => st.id === selectedSubTypeId)?.name || null) : null
      };
      
      // We would typically make an API call here to generate a summary
      // For now, we'll simulate it with a timeout
      
      // In a real implementation, you would call an API like:
      // const response = await fetch('/api/create-document-summary', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(summaryData)
      // });
      
      console.log("Creating document summary with data:", summaryData);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For demo purposes, create a simple summary from the extracted elements
      const formattedElements = extractedElements
        .filter(el => (el as ExtendedRedactionElement).value || el.text)
        .map(el => {
          const elementName = (el as ExtendedRedactionElement).label || el.id;
          const elementValue = (el as ExtendedRedactionElement).value || el.text || 'N/A';
          return `${elementName}: ${elementValue}`;
        });
      
      const summary = `
        Document Summary
        ----------------
        Document Type: ${activeDocType.name}
        ${selectedSubTypeId && activeDocType.subTypes 
          ? `Document Sub-Type: ${activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.name || ''}` 
          : ''}
        Date Processed: ${new Date().toISOString().split('T')[0]}

        Extracted Information:
        ${formattedElements.join('\n')}

        ${extractedText ? `Text Extract (first 200 chars): 
        ${extractedText.substring(0, 200)}...` : ''}
      `.trim();
      
      console.log("Generated summary:", summary);
      
      // Update state with the summary
      setDocumentSummary(summary);
      
      toast({
        title: "Summary created",
        description: "Document summary has been generated successfully",
        variant: "default"
      });
      
    } catch (error) {
      console.error("Error creating document summary:", error);
      toast({
        title: "Summary creation failed",
        description: error instanceof Error ? error.message : "Failed to create document summary",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Add the saveDocumentWithRetention function
  const saveDocumentWithRetention = async () => {
    if (!file) {
      toast({
        title: "Cannot save document",
        description: "No document file is available",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Save original document if selected
      if (processingOptions.saveDocument.original && selectedRetentionPolicies.original) {
        const originalRetentionPolicy = config.retentionPolicies.find(p => p.id === selectedRetentionPolicies.original);
        if (!originalRetentionPolicy) {
          throw new Error("Selected retention policy for original document not found");
        }
        
        const originalMetadata = {
          documentType: activeDocType?.name || 'Unknown',
          documentSubType: selectedSubTypeId && activeDocType ? 
            (activeDocType.subTypes?.find(st => st.id === selectedSubTypeId)?.name || null) : null,
          retentionPolicy: {
            id: originalRetentionPolicy.id,
            name: originalRetentionPolicy.name,
            duration: originalRetentionPolicy.duration
          },
          processedDate: new Date().toISOString(),
          extractedElements: extractedElements,
          isRedacted: false
        };
        
        console.log(`Saving original document with retention policy: ${originalRetentionPolicy.name}`);
        console.log("Original document metadata:", originalMetadata);
        
        // In a real implementation, you would upload the file and metadata:
        // const formData = new FormData();
        // formData.append('file', file);
        // formData.append('metadata', JSON.stringify(originalMetadata));
        // const response = await fetch('/api/save-document', {
        //   method: 'POST',
        //   body: formData
        // });
      }
      
      // Save redacted document if selected and available
      if (processingOptions.saveDocument.redacted && selectedRetentionPolicies.redacted && redactedImageUrl) {
        const redactedRetentionPolicy = config.retentionPolicies.find(p => p.id === selectedRetentionPolicies.redacted);
        if (!redactedRetentionPolicy) {
          throw new Error("Selected retention policy for redacted document not found");
        }
        
        const redactedMetadata = {
          documentType: activeDocType?.name || 'Unknown',
          documentSubType: selectedSubTypeId && activeDocType ? 
            (activeDocType.subTypes?.find(st => st.id === selectedSubTypeId)?.name || null) : null,
          retentionPolicy: {
            id: redactedRetentionPolicy.id,
            name: redactedRetentionPolicy.name,
            duration: redactedRetentionPolicy.duration
          },
          processedDate: new Date().toISOString(),
          extractedElements: extractedElements,
          isRedacted: true
        };
        
        console.log(`Saving redacted document with retention policy: ${redactedRetentionPolicy.name}`);
        console.log("Redacted document metadata:", redactedMetadata);
        
        // In a real implementation, you would upload the file and metadata:
        // const formData = new FormData();
        // formData.append('file', redactedFile);
        // formData.append('metadata', JSON.stringify(redactedMetadata));
        // const response = await fetch('/api/save-document', {
        //   method: 'POST',
        //   body: formData
        // });
      }
      
      toast({
        title: "Document saved",
        description: "Document(s) have been saved with selected retention policies",
        variant: "default"
      });
      
    } catch (error) {
      console.error("Error saving document:", error);
      toast({
        title: "Document save failed",
        description: error instanceof Error ? error.message : "Failed to save document",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Add after other state variables declarations, around line 350
  const [allElements, setAllElements] = useState<ExtendedRedactionElement[]>([])
  const [activeDocumentSubType, setActiveDocumentSubType] = useState<DocumentSubTypeConfig | null>(null)
  const [selectedRetentionPolicies, setSelectedRetentionPolicies] = useState<{
    original: string;
    redacted: string;
  }>({
    original: "",
    redacted: ""
  });

  // New function to match elements using our GPT API
  const matchElementsWithGPT = async (
    extractedElements: ExtendedRedactionElement[],
    configuredElements: DataElementConfig[]
  ): Promise<ExtendedRedactionElement[] | null> => {
    try {
      console.log('Starting GPT element matching with', extractedElements.length, 'elements');
      
      // Prepare the request to the GPT matching API
      const response = await fetch('/api/match-elements-with-gpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extractedElements: extractedElements,
          documentTypeId: activeDocumentTypeId,
          documentSubTypeId: selectedSubTypeId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `GPT matching failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('GPT matching complete:', result.stats);
      
      if (result.elements && Array.isArray(result.elements)) {
        return result.elements as ExtendedRedactionElement[];
      }
      return null;
    } catch (error) {
      console.error('Error in GPT element matching:', error);
      toast({
        title: "GPT matching failed",
        description: error instanceof Error ? error.message : "An error occurred during AI matching",
        variant: "destructive"
      });
      return null;
    }
  };

  return (
    <>
      {/* Main heading and workflow indicators */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Process Documents</h2>
          
          {/* Step indicator */}
          <div className="flex items-center space-x-2">
            <Badge variant={workflowStep === 'upload' ? "default" : "outline"}>Upload</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={workflowStep === 'classify' ? "default" : "outline"}>Classify</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={workflowStep === 'process' ? "default" : "outline"}>Process</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={workflowStep === 'results' ? "default" : "outline"}>Results</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Workflow Steps */}
        <div className="space-y-6">
          <Card className="p-4 min-h-[600px]">
            <div className="space-y-4">
              {/* Step 1: Upload */}
              {workflowStep === 'upload' && (
                <FileUploader onFileUpload={handleFileUpload} isProcessing={isUploading} file={file} />
              )}
              
              {/* Step 2: Classification */}
              {workflowStep === 'classify' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Document Classification</h3>
                    <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  
                  {/* File information at the top */}
                  {file && (
                    <div className="p-3 bg-muted/40 rounded-md">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {file.type || 'Unknown format'} • {(file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <Badge variant={isFileFormatSupported() ? "default" : "destructive"}>
                          {isFileFormatSupported() ? "Supported Format" : "Unsupported Format"}
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {/* Classification options section */}
                  <div className="border rounded-md p-4">
                    <h4 className="font-medium mb-4">Classify Document</h4>
                    
                    {/* Auto-classification switch */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b">
                      <div>
                        <p className="font-medium">Auto-classify documents</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically detect document type using AWS Comprehend
                        </p>
                      </div>
                      <Switch 
                        id="auto-classify" 
                        checked={useAutoClassification}
                        onCheckedChange={(checked) => setUseAutoClassification(checked)}
                      />
                    </div>
                    
                    {/* Text extraction classification option */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b">
                      <div>
                        <p className="font-medium">Use text extraction</p>
                        <p className="text-sm text-muted-foreground">
                          Extract text and use GPT if AWS Comprehend fails
                        </p>
                      </div>
                      <Switch 
                        id="text-extract-classify" 
                        checked={useTextExtractionForClassification}
                        onCheckedChange={(checked) => setUseTextExtractionForClassification(checked)}
                      />
                    </div>

                    {/* TFN Scanning option */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b">
                      <div>
                        <p className="font-medium">Scan for TFN</p>
                        <p className="text-sm text-muted-foreground">
                          Detect and handle Tax File Numbers in the document
                        </p>
                      </div>
                      <Switch 
                        id="scan-tfn" 
                        checked={scanForTFN}
                        onCheckedChange={(checked) => setScanForTFN(checked)}
                      />
                    </div>
                    
                    {/* Classification result display */}
                    {classificationResult && (
                      <div className="mb-4 p-3 border rounded-md bg-blue-50 text-blue-700">
                        <div className="flex justify-between">
                          <h4 className="font-medium">AWS Classification Result:</h4>
                          <Badge variant={classificationResult.confidence > 0.7 ? "default" : "secondary"}>
                            {(classificationResult.confidence * 100).toFixed(0)}% Confidence
                          </Badge>
                        </div>
                        <p className="mt-1">Document Type: <span className="font-semibold">{classificationResult.documentType}</span></p>
                      </div>
                    )}
                    
                    {/* GPT classification result display */}
                    {gptClassificationResult && (
                      <div className="mb-4 p-3 border rounded-md bg-purple-50 text-purple-700">
                        <div className="flex justify-between">
                          <h4 className="font-medium">GPT Classification Result:</h4>
                          <Badge variant={gptClassificationResult.confidence > 0.7 ? "default" : "secondary"}>
                            {(gptClassificationResult.confidence * 100).toFixed(0)}% Confidence
                          </Badge>
                        </div>
                        <p className="mt-1">Document Type: <span className="font-semibold">{gptClassificationResult.documentType || 'Unknown'}</span></p>
                        {gptClassificationResult.subType && (
                          <p className="mt-1">Sub-Type: <span className="font-semibold">{gptClassificationResult.subType}</span></p>
                        )}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs">View reasoning</summary>
                          <p className="mt-1 text-xs">{gptClassificationResult.reasoning}</p>
                        </details>
                      </div>
                    )}

                    {/* Override auto-classification checkbox */}
                    {(classificationResult || gptClassificationResult) && (
                      <div className="flex items-center space-x-2 mb-4">
                        <Checkbox 
                          id="override-classification"
                          checked={!useAutoClassification}
                          onCheckedChange={(checked) => {
                            setUseAutoClassification(!checked);
                          }}
                        />
                        <label 
                          htmlFor="override-classification" 
                          className="text-sm font-medium cursor-pointer"
                        >
                          Override classification with manual selection
                        </label>
                      </div>
                    )}
                  
                    {/* Manual document type selection - only shown when auto-classify is off */}
                    {!useAutoClassification && (
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">
                            Document Type
                          </label>
                          <Select
                            value={activeDocumentTypeId || ''}
                            onValueChange={(value) => {
                              setActiveDocumentType(value);
                              // Reset sub-type when document type changes
                              setSelectedSubTypeId(null);
                              // Reset feedback status when selection changes
                              setFeedbackSubmitted(false);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDocTypes.length === 0 ? (
                                <SelectItem value="none" disabled>
                                  No document types available
                                </SelectItem>
                              ) : (
                                availableDocTypes.map((docType) => (
                                  <SelectItem key={docType.id} value={docType.id}>
                                    {docType.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {activeDocType && activeDocType.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {activeDocType.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Sub-Type Selection - Only shown when a document type is selected and it has sub-types */}
                        {activeDocumentTypeId && activeDocType?.subTypes && activeDocType.subTypes.length > 0 && (
                          <div>
                            <label className="text-sm font-medium mb-1 block">
                              Document Sub-Type
                            </label>
                            <Select
                              value={selectedSubTypeId || 'none'}
                              onValueChange={(value) => {
                                setSelectedSubTypeId(value === 'none' ? null : value);
                                // Reset feedback status when selection changes
                                setFeedbackSubmitted(false);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select sub-type (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  No specific sub-type
                                </SelectItem>
                                {activeDocType.subTypes
                                  .filter(subType => subType.isActive)
                                  .map((subType) => (
                                    <SelectItem key={subType.id} value={subType.id}>
                                      {subType.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {selectedSubTypeId && activeDocType?.subTypes && (
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant="outline">
                                  Analysis: {activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.awsAnalysisType || 'TEXTRACT_ANALYZE_DOCUMENT'}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.description}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Submit Feedback button - only show when manual selection is made */}
                        {activeDocumentTypeId && (classificationResult || gptClassificationResult) && (
                          <div className="mt-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={submitClassificationFeedbackWithSubType}
                              disabled={feedbackSubmitted}
                              className="w-full"
                            >
                              {feedbackSubmitted ? (
                                <>
                                  <CheckIcon className="h-4 w-4 mr-1" />
                                  <span>Feedback Submitted</span>
                                </>
                              ) : (
                                <>
                                  <CheckIcon className="h-4 w-4 mr-1" />
                                  <span>Submit Feedback (Train Model)</span>
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={handleClassifyDocument}
                      disabled={isClassifying || !file}
                      className="flex-1"
                    >
                      {isClassifying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Classifying...
                        </>
                      ) : (
                        <>
                          <FileSearch className="h-4 w-4 mr-2" />
                          Classify with AWS
                        </>
                      )}
                    </Button>
                    
                    {useTextExtractionForClassification && (
                      <Button 
                        onClick={handleClassifyWithGPT}
                        disabled={isClassifyingWithGPT || !file}
                        variant="outline"
                        className="flex-1"
                      >
                        {isClassifyingWithGPT ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing with GPT...
                          </>
                        ) : (
                          <>
                            <AlignLeft className="h-4 w-4 mr-2" />
                            Classify with GPT
                          </>
                        )}
                      </Button>
                    )}
                  
                    
                    <Button 
                      onClick={proceedToProcessingOptions}
                      disabled={!activeDocumentTypeId}
                      variant={extractedText ? "default" : "secondary"}
                      className="flex-1"
                    >
                      <ChevronRight className="h-4 w-4 mr-2" />
                      Next
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Step 3: Processing Options */}
              {workflowStep === 'process' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Processing Options</h3>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setWorkflowStep('classify')}>
                        <ChevronDown className="h-4 w-4 mr-2" rotate={270} />
                        Back
                      </Button>
                      <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                  
                  <div className="p-4 border rounded-md bg-blue-50 text-blue-700">
                    <p className="font-medium">Selected document type: {activeDocType?.name}</p>
                    {selectedSubTypeId && activeDocType?.subTypes && (
                      <p className="mt-1">
                        Sub-type: {activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.name}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="extract-elements">Identify Data Elements</Label>
                        <Label htmlFor="extract-elements">Extract Specific Elements</Label>
                        <p className="text-xs text-muted-foreground">Identify and extract data elements</p>
                      </div>
                      <Switch 
                        checked={processingOptions.extractSpecificElements}
                        onCheckedChange={() => handleProcessOptionChange('extractSpecificElements')}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="redact-elements">Redact Elements</Label>
                        <p className="text-xs text-muted-foreground">Redact sensitive information</p>
                      </div>
                      <Switch 
                        checked={processingOptions.redactElements}
                        onCheckedChange={() => handleProcessOptionChange('redactElements')}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="create-summary">Create Summary</Label>
                        <p className="text-xs text-muted-foreground">Generate a document summary</p>
                      </div>
                      <Switch 
                        checked={processingOptions.createSummary}
                        onCheckedChange={() => handleProcessOptionChange('createSummary')}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="identify-data-elements">Identify Data Elements</Label>
                        <p className="text-xs text-muted-foreground">Identify and extract data elements</p>
                      </div>
                      <Switch 
                        checked={processingOptions.identifyDataElements}
                        onCheckedChange={() => handleProcessOptionChange('identifyDataElements')}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="save-original">Save Original Document</Label>
                        <p className="text-xs text-muted-foreground">Save the original document with retention policy</p>
                      </div>
                      <Switch 
                        checked={processingOptions.saveDocument.original}
                        onCheckedChange={() => handleSaveDocumentChange('original')}
                      />
                    </div>

                    {processingOptions.saveDocument.original && (
                      <div className="mt-2 pl-2 border-l-2 border-muted">
                        <p className="text-sm font-medium mb-1">Original Document Retention Policy:</p>
                        <Select
                          value={selectedRetentionPolicies.original}
                          onValueChange={(value) => handleRetentionPolicyChange('original', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Retention Policy" />
                          </SelectTrigger>
                          <SelectContent>
                            {config.retentionPolicies.map((policy) => (
                              <SelectItem key={policy.id} value={policy.id}>
                                {policy.name} ({policy.duration} days)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="save-redacted">Save Redacted Document</Label>
                        <p className="text-xs text-muted-foreground">Save the redacted document with retention policy</p>
                      </div>
                      <Switch 
                        checked={processingOptions.saveDocument.redacted}
                        onCheckedChange={() => handleSaveDocumentChange('redacted')}
                      />
                    </div>

                    {processingOptions.saveDocument.redacted && (
                      <div className="mt-2 pl-2 border-l-2 border-muted">
                        <p className="text-sm font-medium mb-1">Redacted Document Retention Policy:</p>
                        <Select
                          value={selectedRetentionPolicies.redacted}
                          onValueChange={(value) => handleRetentionPolicyChange('redacted', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Retention Policy" />
                          </SelectTrigger>
                          <SelectContent>
                            {config.retentionPolicies.map((policy) => (
                              <SelectItem key={policy.id} value={policy.id}>
                                {policy.name} ({policy.duration} days)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={runSelectedProcesses}
                      disabled={isProcessing || (!processingOptions.identifyDataElements && !processingOptions.redactElements && !processingOptions.createSummary)}
                      className="flex-1"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Wrench className="h-4 w-4 mr-2" />
                          Run Selected Processes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
          
          {/* Data Elements Card - Shows extracted data elements */}
          {file && extractedElements.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Data Elements</h3>
                <div className="flex items-center gap-2">
                  {activeDocType && (
                    <Badge variant="outline">{activeDocType.name}</Badge>
                  )}
                  {selectedSubTypeId && activeDocType?.subTypes && (
                    <Badge variant="secondary">
                      {activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.name}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[10%]">Select</TableHead>
                      <TableHead className="w-[40%]">Field</TableHead>
                      <TableHead className="w-[35%]">Value</TableHead>
                      <TableHead className="w-[15%] text-right">Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extractedElements
                      .filter(element => {
                        // Filter out elements without labels or values for display
                        const typedElement = element as ExtendedRedactionElement;
                        return typedElement.label && typedElement.text && !typedElement.missing;
                      })
                      .map(element => {
                        const typedElement = element as ExtendedRedactionElement;
                        return (
                          <TableRow key={element.id}>
                            <TableCell className="text-center">
                              <Checkbox 
                                checked={selectedElements.includes(element.id)}
                                onCheckedChange={() => toggleElementSelection(element.id)}
                                id={`select-element-${element.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <label 
                                htmlFor={`select-element-${element.id}`}
                                className="cursor-pointer"
                              >
                                {typedElement.label || "Unknown"}
                                {typedElement.category === 'PII' && (
                                  <Badge variant="outline" className="ml-2 text-xs">PII</Badge>
                                )}
                                {typedElement.action && (
                                  <Badge variant={typedElement.action === 'Redact' ? "destructive" : 
                                              typedElement.action === 'ExtractAndRedact' ? "default" : 
                                              "secondary"} 
                                         className="ml-2 text-xs">
                                    {typedElement.action}
                                  </Badge>
                                )}
                              </label>
                            </TableCell>
                            <TableCell>{typedElement.text || "Not found"}</TableCell>
                            <TableCell className="text-right">
                              {typedElement.confidence
                                ? `${(typedElement.confidence * 100).toFixed(0)}%`
                                : "N/A"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
              
              {/* Action buttons for data elements */}
              <div className="flex justify-end mt-4 gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setExtractedElements([])}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                
                <Button 
                  size="sm"
                  onClick={handleApplyRedactions}
                  disabled={isProcessing || selectedElements.length === 0}
                >
                  <Eraser className="h-4 w-4 mr-2" />
                  Redact Selected
                </Button>
              </div>
            </Card>
          )}

          {/* Error messages */}
          {uploadError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md">
              {uploadError}
            </div>
          )}
          
          {processError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md">
              {processError}
            </div>
          )}
        </div>

        {/* Right Column - Document Viewer */}
        <div className="space-y-6">
          <Card className="p-4 min-h-[600px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Document Viewer</h3>
              
              {/* Added toolbar when document is loaded */}
              {imageUrl && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {file?.type === 'application/pdf' ? 'PDF' : 
                     file?.type?.includes('image') ? 'Image' : 'Document'}
                  </Badge>
                </div>
              )}
            </div>
            
            {imageUrl ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="original">Original Document</TabsTrigger>
                  <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
                  {extractedText && <TabsTrigger value="text">Extracted Text</TabsTrigger>}
                  {redactedImageUrl && <TabsTrigger value="redacted">Redacted Document</TabsTrigger>}
                </TabsList>
                
                <TabsContent value="original" className="mt-0">
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-1">
                    <div className="flex justify-end mb-2 px-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          // Download original document
                          const link = document.createElement("a");
                          if (file) {
                            // Download using the original file
                            const url = URL.createObjectURL(file);
                            link.href = url;
                            link.download = file.name;
                            document.body.appendChild(link);
                            link.click();
                            URL.revokeObjectURL(url);
                            document.body.removeChild(link);
                          }
                        }}
                      >
                        <FileUp className="h-4 w-4 mr-2" />
                        Download Original
                      </Button>
                    </div>
                    <div className="max-h-[550px] overflow-auto p-3">
                      <DocumentViewer 
                        imageUrl={imageUrl} 
                        fileType={file?.type}
                        onPdfLoadError={handlePdfViewerError}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                {/* Add new extracted tab content */}
                <TabsContent value="extracted" className="mt-0">
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-4">
                    {documentSummary ? (
                      <div>
                        <h3 className="text-lg font-medium mb-2">Document Summary</h3>
                        <pre className="bg-muted/50 p-3 rounded-md whitespace-pre-wrap text-sm mb-4">
                          {documentSummary}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground p-4">
                        No document summary available.
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="text" className="mt-0">
                  {extractedText ? (
                    <div className="bg-muted/10 p-4 rounded-md relative">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute top-2 right-2"
                        onClick={() => {
                          if (extractedText) {
                            navigator.clipboard.writeText(extractedText);
                            toast({
                              title: "Copied to clipboard",
                              description: "The extracted text has been copied to your clipboard",
                            });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <pre className="text-xs whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                        {extractedText}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground bg-muted/10 rounded-md min-h-[300px]">
                      <FileText className="h-12 w-12 mb-4 text-muted-foreground/50" />
                      <p>No text extracted yet</p>
                      <p className="text-sm text-muted-foreground mt-2">Process the document to extract text</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="redacted" className="mt-0">
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-1">
                    <div className="flex justify-end mb-2 px-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          // Download redacted document
                          const link = document.createElement("a");
                          if (redactedImageUrl) {
                            // Download using the redacted image URL
                            link.href = redactedImageUrl;
                            link.download = `redacted-${file?.name || "document"}.png`;
                            document.body.appendChild(link);
                            link.click();
                            URL.revokeObjectURL(redactedImageUrl);
                            document.body.removeChild(link);
                          }
                        }}
                      >
                        <FileUp className="h-4 w-4 mr-2" />
                        Download Redacted
                      </Button>
                    </div>
                    <div className="max-h-[550px] overflow-auto p-3">
                      {redactedImageUrl ? (
                        <DocumentViewer 
                          imageUrl={redactedImageUrl as string} 
                          fileType={file?.type}
                          onPdfLoadError={handlePdfViewerError}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-64">
                          <p className="text-muted-foreground">No redacted image available</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground bg-muted/10 rounded-md min-h-[300px]">
                <FileText className="h-12 w-12 mb-4 text-muted-foreground/50" />
                <p>Upload a document to see the preview here</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={verificationOpen} onOpenChange={setVerificationOpen}>
        {/* ... existing dialog content ... */}
      </Dialog>
    </>
  );
}

