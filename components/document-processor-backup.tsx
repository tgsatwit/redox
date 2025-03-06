"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
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
  CheckIcon, 
  Info, 
  FileJson,
  Download
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
  if (!extractedLabel || !configuredElements?.length) return null;

  console.log(`Looking for match for label: ${extractedLabel}`);

  // Enhanced normalize text function for comparison
  // This normalizes in multiple ways to increase chance of matching
  const normalizeText = (text: string): { basic: string; withUnderscores: string; wordsOnly: string } => {
    if (!text) return { basic: '', withUnderscores: '', wordsOnly: '' };
    // Basic normalization - lowercase, no special chars
    const basic = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Normalized with underscores replacing spaces (common in database fields)
    const withUnderscores = text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Words only normalization
    const wordsOnly = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    // Return all formats for comparison
    return { basic, withUnderscores, wordsOnly };
  };

  const normalizedExtracted = normalizeText(extractedLabel);
  
  // Common document field mappings for passport and IDs
  // This maps the extracted field names to standard config names
  const commonFieldMappings: Record<string, string> = {
    'DOCUMENT_NUMBER': 'Passport Number',
    'PASSPORT_NUMBER': 'Passport Number',
    'DATE_OF_ISSUE': 'Issue Date',
    'ISSUE_DATE': 'Issue Date',
    'DATE_OF_BIRTH': 'Date of Birth',
    'EXPIRATION_DATE': 'Expiration Date',
    'DATE_OF_EXPIRY': 'Expiration Date',
    'FIRST_NAME': 'First Name',
    'LAST_NAME': 'Last Name',
    'GIVEN_NAME': 'First Name',  // Adding variations
    'SURNAME': 'Last Name',      // Adding variations
    'FAMILY_NAME': 'Last Name',  // Adding variations
    'NATIONALITY': 'Nationality',
    'PLACE_OF_BIRTH': 'Place of Birth',
    'SEX': 'Gender',             // Adding variations
    'GENDER': 'Gender',          // Adding variations
    'ID_NUMBER': 'ID Number'     // Adding variations
  };

  // First try direct mapping from extracted underscore format to config names
  if (commonFieldMappings[extractedLabel]) {
    const configName = commonFieldMappings[extractedLabel];
    const matchingElement = configuredElements.find(
      element => element.name.toLowerCase() === configName.toLowerCase()
    );
    
    if (matchingElement) {
      console.log(`✅ Found direct field mapping match: "${extractedLabel}" → "${matchingElement.name}"`);
      return matchingElement;
    }
  }

  // FIRST PASS: Try exact name match or alias match using all normalization formats
  for (const element of configuredElements) {
    const normalizedElement = normalizeText(element.name);
    
    // Check for exact name match with any normalization format
    if (normalizedElement.basic === normalizedExtracted.basic || 
        normalizedElement.withUnderscores === normalizedExtracted.withUnderscores ||
        normalizedElement.wordsOnly === normalizedExtracted.wordsOnly) {
      console.log(`✅ Found exact name match: "${extractedLabel}" → "${element.name}"`);
      return element;
    }
    
    // Check aliases if available (with enhanced normalization)
    if (element.aliases && element.aliases.length > 0) {
      // 1. Check for exact matches with aliases
      for (const alias of element.aliases) {
        const normalizedAlias = normalizeText(alias);
        
        // Check all normalization formats for exact match
        if (normalizedAlias.basic === normalizedExtracted.basic || 
            normalizedAlias.withUnderscores === normalizedExtracted.withUnderscores ||
            normalizedAlias.wordsOnly === normalizedExtracted.wordsOnly) {
          console.log(`✅ Found exact alias match: "${extractedLabel}" (alias: "${alias}") → "${element.name}"`);
          return element;
        }
      }
      
      // 2. Check for partial matches with aliases
      for (const alias of element.aliases) {
        const normalizedAlias = normalizeText(alias);
        
        if (normalizedAlias.basic.includes(normalizedExtracted.basic) || 
            normalizedExtracted.basic.includes(normalizedAlias.basic)) {
          console.log(`✅ Found partial alias match: "${extractedLabel}" ↔ "${alias}" → "${element.name}"`);
          return element;
        }
      }
      
      // 3. Check for word-by-word matches with aliases
      const extractedWords = normalizedExtracted.wordsOnly.split(' ').filter(w => w.length > 2);
      
      for (const alias of element.aliases) {
        const aliasWords = normalizeText(alias).wordsOnly.split(' ').filter(w => w.length > 2);
        
        // Skip if either has no significant words
        if (aliasWords.length === 0 || extractedWords.length === 0) continue;
        
        // Check if all important words from alias appear in extracted label or vice versa
        const allAliasWordsInExtracted = aliasWords.every(word => 
          extractedWords.some(extractedWord => extractedWord.includes(word) || word.includes(extractedWord))
        );
        
        const allExtractedWordsInAlias = extractedWords.every(word => 
          aliasWords.some(aliasWord => aliasWord.includes(word) || word.includes(aliasWord))
        );
        
        if (allAliasWordsInExtracted || allExtractedWordsInAlias) {
          console.log(`✅ Found word-by-word alias match: "${extractedLabel}" ↔ "${alias}" → "${element.name}"`);
          return element;
        }
      }
    }
  }
  
  // SECOND PASS: Try word-by-word matching (particularly useful for fields like "Date of Birth" vs "Birth Date")
  for (const element of configuredElements) {
    const elementWords = normalizeText(element.name).wordsOnly.split(' ');
    const extractedWords = normalizedExtracted.wordsOnly.split(' ');
    
    // Check if all the important words from element name appear in extracted label or vice versa
    const allElementWordsInExtracted = elementWords.every(word => 
      word.length > 2 && extractedWords.some(extractedWord => extractedWord.includes(word) || word.includes(extractedWord))
    );
    
    const allExtractedWordsInElement = extractedWords.every(word => 
      word.length > 2 && elementWords.some(elementWord => elementWord.includes(word) || word.includes(elementWord))
    );
    
    if (allElementWordsInExtracted || allExtractedWordsInElement) {
      console.log(`✅ Found word-by-word match: "${extractedLabel}" ↔ "${element.name}"`);
      return element;
    }
  }
  
  // THIRD PASS: Try partial matches - more flexible matching
  for (const element of configuredElements) {
    // Check if element name contains the extracted label or vice versa
    if (normalizeText(element.name).basic.includes(normalizedExtracted.basic) || 
        normalizedExtracted.basic.includes(normalizeText(element.name).basic)) {
      console.log(`✅ Found partial match: "${extractedLabel}" ↔ "${element.name}"`);
      return element;
    }
  }

  // FOURTH PASS: Check for common synonyms or related terms
  const commonSynonyms: Record<string, string[]> = {
    'birth': ['dob', 'born', 'birthday'],
    'expire': ['expiry', 'expiration', 'valid until'],
    'issue': ['issued', 'created'],
    'gender': ['sex'],
    'nationality': ['citizen', 'country'],
    'passport': ['travel document', 'pass'],
    'id': ['identification', 'identity', 'document'],
    'name': ['fullname', 'full name'],
    'first': ['given', 'forename'],
    'last': ['surname', 'family']
  };
  
  for (const element of configuredElements) {
    // Check if the normalized element name contains any related terms to the extracted label
    const elementTerms = Object.keys(commonSynonyms).filter(term => 
      normalizeText(element.name).wordsOnly.includes(term)
    );
    
    for (const term of elementTerms) {
      const relatedTerms = commonSynonyms[term];
      const hasRelatedTerm = relatedTerms.some(relatedTerm => 
        normalizedExtracted.wordsOnly.includes(relatedTerm)
      );
      
      if (hasRelatedTerm) {
        console.log(`✅ Found synonym match (${term}): "${extractedLabel}" → "${element.name}"`);
        return element;
      }
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
  const { config, activeDocumentTypeId, setActiveDocumentType: _setActiveDocumentType } = useConfigStoreDB()
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
  const [extractedElements, setExtractedElements] = useState<ExtendedRedactionElement[]>([])
  const [selectedElements, setSelectedElements] = useState<string[]>([])
  const [showAwsHelper, setShowAwsHelper] = useState(false)
  const [pdfViewerError, setPdfViewerError] = useState<string | null>(null)
  const [useAutoClassification, setUseAutoClassification] = useState(true)
  const [isClassifying, setIsClassifying] = useState(false)
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [manualSelections, setManualSelections] = useState<Array<any>>([])
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [selectedSubTypeId, setSelectedSubTypeId] = useState<string | null>(null)
  const [workflowStep, setWorkflowStep] = useState<'upload' | 'classify' | 'process' | 'results'>('upload')
  const [useTextExtractionForClassification, setUseTextExtractionForClassification] = useState(false)
  const [isClassifyingWithGPT, setIsClassifyingWithGPT] = useState(false)
  const [gptClassificationResult, setGptClassificationResult] = useState<{
    documentType: string | null;
    subType: string | null;
    confidence: number;
    reasoning: string;
  } | null>(null)
  const [rawTextractData, setRawTextractData] = useState<any>(null)
  const [selectedRetentionPolicies, setSelectedRetentionPolicies] = useState<{
    original: string;
    redacted: string;
  }>({
    original: '',
    redacted: ''
  })
  
  // Add documentSummary state variable
  const [documentSummary, setDocumentSummary] = useState<string | null>(null)
  
  // Add the missing processingOptions state
  const [processingOptions, setProcessingOptions] = useState<{
    identifyDataElements: boolean;
    redactElements: boolean;
    createSummary: boolean;
    saveDocument: {
      original: boolean;
      redacted: boolean;
    };
  }>({
    identifyDataElements: true,
    redactElements: false,
    createSummary: false,
    saveDocument: {
      original: false,
      redacted: false
    }
  })

  // Add scanForTFN state variable
  const [scanForTFN, setScanForTFN] = useState<boolean>(false);

  // Add these state variables with the other useState declarations (around line 400)
  const [requiredElementsCollapsed, setRequiredElementsCollapsed] = useState(false);
  const [extractedDataCollapsed, setExtractedDataCollapsed] = useState(false);

  // Add these state variables with the other useState declarations where you added the previous state variables
  const [extractedTextCollapsed, setExtractedTextCollapsed] = useState(false);
  const [textractResponseCollapsed, setTextractResponseCollapsed] = useState(false);

  // Add state for the data elements collapsible in results step
  const [resultsDataElementsCollapsed, setResultsDataElementsCollapsed] = useState(false);

  // Add this state variable near the other state declarations
  const [redactionsAutoApplied, setRedactionsAutoApplied] = useState(false);
  
  // Add derived state variables based on existing values
  const activeDocType = config.documentTypes.find((dt: { id: string }) => dt.id === activeDocumentTypeId);
  const availableDocTypes = config.documentTypes.filter((dt: { isActive: boolean }) => dt.isActive);
  
  // Toggle element selection function
  const toggleElementSelection = (elementId: string) => {
    setSelectedElements(prev => {
      if (prev.includes(elementId)) {
        return prev.filter(id => id !== elementId);
      } else {
        return [...prev, elementId];
      }
    });
  };
  
  // Toggle field redaction function
  const toggleFieldRedaction = (elementId: string) => {
    setFieldsToRedact(prev => {
      const newSet = new Set(prev);
      if (newSet.has(elementId)) {
        newSet.delete(elementId);
      } else {
        newSet.add(elementId);
      }
      return newSet;
    });
  };
  
  // Check if the file format is supported
  const isFileFormatSupported = () => {
    if (!file) return false;
    const supportedFormats = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    return supportedFormats.includes(file.type);
  };
  
  // Client-side PDF extraction function
  const clientSidePdfExtraction = async (pdfFile: File): Promise<string> => {
    // Implementation would go here - for now we'll just return a placeholder
    return "PDF extraction placeholder";
  };
  
  // Try to match extracted text to elements
  const tryMatchExtractedTextToElements = (text: string) => {
    // Implementation would go here
    console.log("Attempting to match extracted text to elements");
  };
  
  // Handle download function
  const handleDownload = () => {
    if (redactedImageUrl) {
      const link = document.createElement('a');
      link.href = redactedImageUrl;
      link.download = 'redacted_document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  
  // Handle text extraction
  const handleExtractText = async () => {
    if (!file) return;
    setIsExtractingText(true);
    try {
      let extractedText = "";
      if (file.type === "application/pdf") {
        extractedText = await clientSidePdfExtraction(file);
      }
      setExtractedText(extractedText);
      return extractedText;
    } catch (error) {
      console.error("Error extracting text:", error);
      toast({
        title: "Text extraction failed",
        description: error instanceof Error ? error.message : "Failed to extract text from the document.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsExtractingText(false);
    }
  };
  
  // Function to handle automatic redaction based on field actions
  const handleAutomaticRedaction = useCallback(() => {
    // Only apply if Redact Elements option is enabled
    if (!processingOptions.redactElements) return;
    
    // Get configured data elements
    const configuredElements = getConfiguredDataElements();
    
    // Match extracted elements with configured elements
    extractedElements.forEach(element => {
      const typedElement = element as ExtendedRedactionElement;
      
      // Skip if no label
      if (!typedElement.label) return;
      
      // Find matching configured element
      const matchingConfigured = configuredElements.find(
        configElement => configElement.name === typedElement.label
      );
      
      // If there's a match and the action is redact or extractAndRedact
      if (matchingConfigured && 
          (matchingConfigured.action === 'Redact' || 
           matchingConfigured.action === 'ExtractAndRedact')) {
        // Add to selectedElements if not already there
        if (!selectedElements.includes(element.id)) {
          toggleElementSelection(element.id);
        }
      }
    });
  }, [processingOptions.redactElements, extractedElements, selectedElements]);
  
  // Reset active tab if needed when extractedElements changes
  useEffect(() => {
    if (activeTab === "extracted" && (!extractedElements.length || !activeDocumentTypeId)) {
      setActiveTab("original");
    }
    if (activeTab === "summary" && !documentSummary) {
      setActiveTab("original");
    }
  }, [activeTab, extractedElements, activeDocumentTypeId, documentSummary]);

  // Log when activeDocumentTypeId changes to help debug
  useEffect(() => {
    console.log('activeDocumentTypeId changed:', activeDocumentTypeId);
    if (activeDocumentTypeId) {
      console.log('Selected document type:', config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.name);
    } else {
      console.log('No document type selected (Unclassified)');
    }
  }, [activeDocumentTypeId, config.documentTypes]);

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
              
              // Store the Textract response if available
              if (data.textractResponse) {
                setRawTextractData(data.textractResponse);
              }
              
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
                  
                  return [...filteredPrev, ...elements] as ExtendedRedactionElement[];
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
            
            return [...filteredPrev, ...enhancedPatternElements] as ExtendedRedactionElement[];
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
      
      // Store the GPT classification result
      setGptClassificationResult(result);
      
      // Debug log to help troubleshoot classification issues
      console.log("GPT Classification Result:", JSON.stringify(result, null, 2));
      
      // Also update the main classification result for consistency
      setClassificationResult({
        documentType: result.documentType || 'Unknown',
        confidence: result.confidence || 0.0,
        modelId: 'gpt-4o',
        classifierId: 'gpt'
      });
      
      // If a document type was identified, set it
      if (result.documentType) {
        const matchingDocType = config.documentTypes.find(
          dt => dt.name.toLowerCase() === result.documentType.toLowerCase()
        );
        
        if (matchingDocType) {
          // Save document type to config store and update local state
          // Pass true to skip resetting the subtype when setting the document type
          setActiveDocumentType(matchingDocType.id, true);
          
          console.log("GPT Classification: Setting document type to", matchingDocType.name);
          
          // Ensure auto-classification is turned off so manual selections are visible
          setUseAutoClassification(false);
          
          // If subtype was identified, set it as well
          if (result.subType) {
            const matchingSubType = matchingDocType.subTypes?.find(
              st => st.name.toLowerCase() === result.subType.toLowerCase()
            );
            
            if (matchingSubType) {
              console.log("GPT Classification: Setting subtype to", matchingSubType.name);
              // Ensure we set the subtype ID after a short delay to allow the document type update to complete
              setTimeout(() => {
                setSelectedSubTypeId(matchingSubType.id);
                console.log("Selected subtype ID set to:", matchingSubType.id);
              }, 100);
            } else {
              console.log("GPT Classification: Subtype not found:", result.subType);
            }
          }
          
          // Update classification result state for display in the document viewer
          setClassificationResult({
            documentType: matchingDocType.name,
            confidence: result.confidence,
            modelId: "gpt-4o",
            classifierId: "gpt"
          });
          
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

  // Update the handleApplyRedactions function
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
          return {
            id: element.id,
            label: (element as any).label || 'Text',
            value: element.text,
            dataType: (element as any).type || 'Text',
            confidence: element.confidence,
            boundingBox: element.boundingBox,
            page: element.pageIndex
          };
        })
      };
      
      // Call the redaction function
      const redactedUrl = await redactDocument(
        fileToRedact,
        Array.from(selectedElements),
        documentDataForRedaction as any
      );
      
      // Update state with the redacted image URL
      setRedactedImageUrl(redactedUrl);
      setActiveTab("redacted");
      
      // Set flag to indicate redactions have been applied to prevent infinite loops
      setRedactionsAutoApplied(true);
      
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

  // Reset redactionsAutoApplied when workflow step changes
  useEffect(() => {
    setRedactionsAutoApplied(false);
  }, [workflowStep]);

  // Create a separate self-contained useEffect hook for auto-redaction
  useEffect(() => {
    // Only trigger auto-redaction when:
    // 1. We're in the results step
    // 2. Redact elements option is enabled
    // 3. We have elements to redact
    // 4. Redactions haven't been applied already
    // 5. We're not currently processing
    if (
      workflowStep === 'results' && 
      processingOptions.redactElements && 
      selectedElements.length > 0 && 
      !redactionsAutoApplied && 
      !isProcessing
    ) {
      const timer = setTimeout(() => {
        // Directly call handleApplyRedactions (avoid unnecessary wrapper function)
        handleApplyRedactions();
      }, 800); // Longer delay to ensure element selection has completed
      
      return () => clearTimeout(timer);
    }
  }, [
    workflowStep, 
    processingOptions.redactElements, 
    selectedElements, 
    redactionsAutoApplied, 
    isProcessing, 
    handleApplyRedactions
  ]);

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

  // Enhanced function to match extracted elements with configured elements
  const matchExtractedWithConfigured = async (initialElements?: ExtendedRedactionElement[]) => {
    console.log('Starting enhanced matchExtractedWithConfigured');
    try {
      // Get the configured data elements for current document type/subtype
      const configuredElements = getConfiguredDataElements();
      if (!configuredElements.length) {
        console.log('No configured elements found');
        toast({
          title: "No configured elements",
          description: "Please select a document type with configured data elements",
          variant: "destructive"
        });
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
        toast({
          title: "No data elements",
          description: "No extracted data elements found to match",
          variant: "destructive"
        });
        return;
      }
      
      console.log(`Working with ${workingElements.length} elements to match`);
      
      // Arrays to track matched and unmatched elements
      const matchedElements: ExtendedRedactionElement[] = [];
      const unmatchedExtractedElements: ExtendedRedactionElement[] = [];
      
      // Clone the configured elements to track which ones were matched
      const unmatchedConfigured = [...configuredElements];
      
      // FIRST PASS: Try exact label matches
      console.log("FIRST PASS: Direct matching with element labels");
      for (const element of workingElements) {
        if (!(element as ExtendedRedactionElement).label) {
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
            
          // Check for exact match with element name
          if (normalizedConfig === normalizedLabel) {
            return true;
          }
          
          // Check for exact match with any aliases
          if (config.aliases && config.aliases.length > 0) {
            return config.aliases.some(alias => {
              const normalizedAlias = alias
                .toUpperCase()
                .replace(/[^A-Z0-9_]/g, '');
              return normalizedAlias === normalizedLabel;
            });
          }
          
          return false;
        });
        
        if (directMatch) {
          console.log(`Direct match found: "${(element as ExtendedRedactionElement).label}" → "${directMatch.name}"`);
          
          // Remove from unmatched list
          const matchingIndex = unmatchedConfigured.findIndex(e => e.id === directMatch.id);
          if (matchingIndex !== -1) {
            unmatchedConfigured.splice(matchingIndex, 1);
          }
          
          // Create enhanced matched element with type assertion to avoid TypeScript errors
          const matchedElement = {
            id: element.id,
            text: element.text,
            confidence: element.confidence,
            pageIndex: element.pageIndex,
            value: element.text,
            label: directMatch.name,
            type: directMatch.type || element.type,
            isConfigured: true,
            action: directMatch.action as DataElementAction,
            category: directMatch.category || (element as ExtendedRedactionElement).category || 'Unknown',
            boundingBox: element.boundingBox,
            configId: directMatch.id // Track the config ID for reference
          } as ExtendedRedactionElement; // Use type assertion
          
          matchedElements.push(matchedElement);
        }
      }
      
      // SECOND PASS: Try fuzzy matching with our findMatchingElement function
      console.log("SECOND PASS: Fuzzy matching with findMatchingElement");
      const remainingElements = workingElements.filter(el => 
        !matchedElements.some(matched => matched.id === el.id)
      );
      
      for (const element of remainingElements) {
        if (!(element as ExtendedRedactionElement).label) {
          unmatchedExtractedElements.push(element as ExtendedRedactionElement);
          continue;
        }
        
        // Use our fuzzy matching helper function
        const label = (element as ExtendedRedactionElement).label;
        const matchingConfig = label ? findMatchingElement(label, unmatchedConfigured) : null;
        
        if (matchingConfig) {
          console.log(`Fuzzy match found: "${(element as ExtendedRedactionElement).label}" → "${matchingConfig.name}"`);
          
          // Remove from unmatched list
          const matchingIndex = unmatchedConfigured.findIndex(e => e.id === matchingConfig.id);
          if (matchingIndex !== -1) {
            unmatchedConfigured.splice(matchingIndex, 1);
          }
          
          // Create enhanced matched element with type assertion
          const matchedElement = {
            id: element.id,
            text: element.text,
            confidence: element.confidence,
            pageIndex: element.pageIndex,
            value: element.text,
            label: matchingConfig.name,
            type: matchingConfig.type || element.type,
            isConfigured: true,
            action: matchingConfig.action as DataElementAction,
            category: matchingConfig.category || (element as ExtendedRedactionElement).category || 'Unknown',
            boundingBox: element.boundingBox,
            configId: matchingConfig.id // Track the config ID for reference
          } as ExtendedRedactionElement; // Use type assertion
          
          matchedElements.push(matchedElement);
        } else {
          // No match found
          unmatchedExtractedElements.push(element as ExtendedRedactionElement);
        }
      }
      
      // THIRD PASS: Try to use GPT for more advanced matching if we have unmatched elements and configs
      if (unmatchedExtractedElements.length > 0 && unmatchedConfigured.length > 0) {
        try {
          console.log("THIRD PASS: Using GPT for advanced matching");
          const enhancedElements = await matchElementsWithGPT(unmatchedExtractedElements, unmatchedConfigured);
          
          if (enhancedElements && enhancedElements.length > 0) {
            // Process the GPT-enhanced elements
            for (const enhancedElement of enhancedElements) {
              // Use type assertion to access the properties safely
              const typedElement = enhancedElement as any;
              if (typedElement.matchedConfigId) {
                console.log(`GPT match found: "${typedElement.label}" → "${typedElement.matchedConfigName}"`);
                
                // Find the config using the matched ID
                const matchingConfig = unmatchedConfigured.find(c => c.id === typedElement.matchedConfigId);
                
                if (matchingConfig) {
                  // Remove from unmatched list
                  const matchingIndex = unmatchedConfigured.findIndex(e => e.id === matchingConfig.id);
                  if (matchingIndex !== -1) {
                    unmatchedConfigured.splice(matchingIndex, 1);
                  }
                  
                  // Add to matched elements with type assertion
                  matchedElements.push({
                    ...enhancedElement,
                    isConfigured: true,
                    action: matchingConfig.action as DataElementAction,
                    category: matchingConfig.category || typedElement.category || 'Unknown',
                    configId: matchingConfig.id
                  } as ExtendedRedactionElement);
                } else {
                  // Config not found (should be rare)
                  unmatchedExtractedElements.push(enhancedElement);
                }
              } else {
                // No match from GPT
                unmatchedExtractedElements.push(enhancedElement);
              }
            }
          }
        } catch (gptError) {
          console.error("GPT matching error:", gptError);
          // Continue with what we have
        }
      }
      
      // Now, create placeholders for required configured elements that weren't matched
      const missingElements = unmatchedConfigured
        .filter(element => element.required === true)
        .map(element => ({
          id: `missing-${element.id}`,
          label: element.name,
          text: 'Not found in document',
          type: element.type,
          value: null,
          confidence: 0,
          boundingBox: null,
          pageIndex: 0,
          isConfigured: true,
          missing: true,
          category: element.category,
          action: element.action as DataElementAction,
          configId: element.id
        } as ExtendedRedactionElement)); // Use type assertion
      
      console.log(`Matched: ${matchedElements.length}, Unmatched: ${unmatchedExtractedElements.length}, Missing required: ${missingElements.length}`);
      
      // Combine all elements and update state
      const allElements = [...matchedElements, ...unmatchedExtractedElements, ...missingElements];
      setExtractedElements(allElements);
      
      // Auto-select elements for redaction based on their action
      const elementsToAutoSelect = matchedElements
        .filter(el => el.action === 'Redact' || el.action === 'ExtractAndRedact')
        .map(el => el.id);
      
      if (elementsToAutoSelect.length > 0) {
        console.log(`Auto-selecting ${elementsToAutoSelect.length} elements for redaction based on action`);
        elementsToAutoSelect.forEach(id => {
          toggleFieldRedaction(id);
        });
      }
      
      // Show success toast
      toast({
        title: "Elements matched",
        description: `Successfully matched ${matchedElements.length} elements, found ${missingElements.length} missing required elements`,
        variant: "default"
      });
      
      // If there are matched elements, switch to the extracted tab
      if (matchedElements.length > 0) {
        setActiveTab("extracted");
      }
      
      return allElements;
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

  // Function to run all selected processes
  const runSelectedProcesses = async () => {
    setIsProcessing(true);
    setProcessError(null);
    
    try {
      console.log('Starting processing workflow');
      
      // Always ensure text extraction is done first if not already available
      if (!extractedText) {
        toast({
          title: "Extracting text",
          description: "Text extraction is required for data element matching",
        });
        await handleExtractText();
      }
      
      // Identify data elements (matching extracted fields with configured elements)
      if (processingOptions.identifyDataElements) {
        console.log('Starting element identification and matching...');
        
        // If we have existing extracted elements, match them
        if (extractedElements.length > 0) {
          await matchExtractedWithConfigured(extractedElements);
        } 
        // Otherwise, process the document to extract elements first
        else {
          // Extract elements from the document
          toast({
            title: "Extracting document elements",
            description: "Analyzing document to extract data elements",
          });
          
          // Get the active document type
          const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
          if (docType) {
            // Process document with the active document type
            await processWithDocType(docType);
            
            // Wait briefly to ensure elements are processed
            setTimeout(async () => {
              // Then match the extracted elements with configured elements
              if (extractedElements.length > 0) {
                await matchExtractedWithConfigured(extractedElements);
              }
            }, 500);
          } else {
            toast({
              title: "Document type required",
              description: "Please select a document type to process",
              variant: "destructive"
            });
          }
        }
      }
      
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
      
      // After all processing is complete, move to the results step
      setWorkflowStep('results');
      
      toast({
        title: "Processing complete",
        description: "All selected processes have been completed",
        variant: "default"
      });
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

  // Create a wrapper for setActiveDocumentType that handles manual classification confidence
  const setActiveDocumentType = (docTypeId: string | null, skipResetSubType: boolean = false) => {
    // Set document type in config store
    _setActiveDocumentType(docTypeId);
    
    // Only reset subtype if not explicitly skipped
    if (docTypeId && !skipResetSubType) {
      setSelectedSubTypeId(null);
    }
    
    // If manually selected and not using auto-classification, set confidence to 100%
    if (docTypeId && !useAutoClassification && !classificationResult) {
      // Create a manual classification result with 100% confidence
      setClassificationResult({
        documentType: config.documentTypes.find(dt => dt.id === docTypeId)?.name || 'Unknown',
        confidence: 1.0, // 100% confidence for manual selection
        modelId: 'manual-selection',
        classifierId: 'manual'
      });
    }
  };
  
  // Create document summary function for displaying in the Document Summary tab
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
      console.error('Error saving document:', error);
      toast({
        title: "Error saving document",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Add after other state variables declarations, around line 350
  const [allElements, setAllElements] = useState<ExtendedRedactionElement[]>([])
  const [activeDocumentSubType, setActiveDocumentSubType] = useState<DocumentSubTypeConfig | null>(null)

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

  // New state for selected workflow
  const [selectedWorkflow, setSelectedWorkflow] = useState<{ id: string; isOneOff: boolean } | null>(null);

  // Handler for workflow selection
  const handleWorkflowSelect = (workflowId: string, isOneOff: boolean) => {
    setSelectedWorkflow({ id: workflowId, isOneOff });
    console.log(`Selected workflow: ${workflowId}, One-off: ${isOneOff}`);
    
    // You could potentially load pre-configured settings based on the workflow
    if (workflowId && !isOneOff) {
      // Example: Set default settings based on workflow type
      switch (workflowId) {
        case 'passport':
          setScanForTFN(true);
          setUseAutoClassification(true);
          break;
        case 'invoice':
          setScanForTFN(false);
          setUseAutoClassification(true);
          break;
        // Add other workflows as needed
        default:
          // Default settings
          break;
      }
    }
  };

  // Available workflows - in a real app, these would come from a database
  const availableWorkflows = [
    { id: "invoice", name: "Invoice Processing" },
    { id: "passport", name: "Passport Verification" },
    { id: "license", name: "Driver's License Verification" },
    { id: "agreement", name: "Contract/Agreement Review" }
  ];

  // Define the missing resetWorkflow function
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
    setRawTextractData(null);
  };

  // Define the processWithDocType function
  const processWithDocType = async (docType: any) => {
    try {
      setProcessingStatus('Processing document...');
      setProcessingProgress(50);
      
      // Find the selected sub-type if any
      const selectedSubType = selectedSubTypeId 
        ? docType.subTypes?.find((subType: any) => subType.id === selectedSubTypeId)
        : docType.subTypes?.find((subType: any) => subType.isActive);
      
      // Process the document using our processDocument function from lib/document-processing
      const data = await processDocument(
        file!,
        {
          documentType: docType.name,
          subType: selectedSubType?.name, // Include subType if available
          elementsToExtract: selectedSubType ? 
            // If a sub-type is selected, use its data elements
            selectedSubType.dataElements.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
            })) :
            // Otherwise use the main document type's data elements
            docType.dataElements.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
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
      
      // Try to match extracted text with data elements
      if (data.extractedText) {
        tryMatchExtractedTextToElements(data.extractedText);
      }
      
      // Update processing status
      setProcessingStatus('Processing complete');
      setProcessingProgress(100);
      setIsProcessing(false);
      setIsClassifying(false);
      
      // Show success toast
      toast({
        title: "Document processed successfully",
        description: `Extracted ${data.extractedFields?.length || 0} fields${data.subType ? ` (${data.subType})` : ''}`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error in document processing:', error);
      setProcessError(`Error: ${(error as Error).message}`);
      setIsProcessing(false);
      setIsClassifying(false);
    }
  };

  // Define the handleClassifyDocument function
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

  // Function to handle processing option changes
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

  // Fix the type errors with boundingBox in setExtractedElements calls
  const fixBoundingBoxOnElements = (elements: RedactionElement[]): ExtendedRedactionElement[] => {
    return elements.map(element => {
      // Ensure the element has a boundingBox property that meets the ExtendedRedactionElement requirement
      return {
        ...element,
        boundingBox: element.boundingBox || null,
      } as ExtendedRedactionElement;
    });
  };

  // Now replace the problematic setExtractedElements calls with our fixed version
  // For example, replace:
  // setExtractedElements(prev => {
  //   // Filter out any elements with the same labels
  //   const existingLabels = new Set(elements.map((el: ExtendedRedactionElement) => el.label?.toLowerCase()));
  //   const filteredPrev = prev.filter(p => {
  //     return !p.label || !existingLabels.has(p.label.toLowerCase());
  //   });
  //   return [...filteredPrev, ...elements];
  // });
  // With:
  // setExtractedElements(prev => {
  //   // Filter out any elements with the same labels
  //   const existingLabels = new Set(elements.map((el: ExtendedRedactionElement) => el.label?.toLowerCase()));
  //   const filteredPrev = prev.filter(p => {
  //     return !p.label || !existingLabels.has(p.label.toLowerCase());
  //   });
  //   return [...filteredPrev, ...fixBoundingBoxOnElements(elements)];
  // });

  // Add effect to run automatic redaction when elements change or when moving to results step
  useEffect(() => {
    if (workflowStep === 'results' && processingOptions.redactElements) {
      handleAutomaticRedaction();
    }
  }, [workflowStep, handleAutomaticRedaction]);

  // Add useEffect to automatically handle redaction when moving to the results page
  // or when processing options change
  useEffect(() => {
    // Only proceed if we're on the results step and redact elements is enabled
    if (workflowStep === 'results' && processingOptions.redactElements) {
      // Get configured elements with Redact or ExtractAndRedact action
      const elementsToRedact = getConfiguredDataElements().filter(
        element => element.action === 'Redact' || element.action === 'ExtractAndRedact'
      );
      
      // Find matching extracted elements and add to selection
      const newSelectedElements = [...selectedElements];
      let hasChanges = false;
      
      extractedElements.forEach(element => {
        const typedElement = element as ExtendedRedactionElement;
        
        // Check if this element matches any element that should be redacted
        const shouldRedact = elementsToRedact.some(
          configElement => configElement.name === typedElement.label
        );
        
        // If this element should be redacted and is not already selected
        if (shouldRedact && !selectedElements.includes(element.id)) {
          newSelectedElements.push(element.id);
          hasChanges = true;
        }
      });
      
      // Update selected elements if changes were made
      if (hasChanges) {
        setSelectedElements(newSelectedElements);
      }
    }
  }, [workflowStep, processingOptions.redactElements, extractedElements]);

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
                <div className="space-y-4">
                  <FileUploader 
                    onFileUpload={handleFileUpload} 
                    isProcessing={isUploading} 
                    file={file}
                    error={uploadError}
                    onWorkflowSelect={handleWorkflowSelect}
                  />
                  
                  {selectedWorkflow && (
                    <div className="p-3 bg-muted/20 rounded-md mt-4">
                      <div className="flex justify-between items-center">
                        <p className="text-sm">
                          <span className="font-medium">Selected workflow:</span> {selectedWorkflow.isOneOff ? 'One-off processing' : availableWorkflows.find(w => w.id === selectedWorkflow.id)?.name || 'Custom workflow'}
                        </p>
                        {file && (
                          <Button size="sm" onClick={() => setWorkflowStep('classify')}>
                            Continue to Classification
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
                              // Reset feedback status when selection changes
                              setFeedbackSubmitted(false);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDocTypes.map((docType) => (
                                <SelectItem key={docType.id} value={docType.id}>
                                  {docType.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="extract-elements">Identify Required Data Elements</Label>
                        <p className="text-xs text-muted-foreground">Identify and extract data elements</p>
                      </div>
                      <Switch 
                        checked={processingOptions.identifyDataElements}
                        onCheckedChange={() => handleProcessOptionChange('identifyDataElements')}
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

              {/* Step 4: Results Step with amalgamated table */}
              {workflowStep === 'results' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Results</h3>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setWorkflowStep('process')}>
                        <ChevronDown className="h-4 w-4 mr-2" rotate={270} />
                        Back
                      </Button>
                      <Button variant="ghost" size="sm" onClick={resetWorkflow}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                  
                  {/* Remove the blue box with document type info */}
                  {/* <div className="p-4 border rounded-md bg-blue-50 text-blue-700">
                    <p className="font-medium">Selected document type: {activeDocType?.name}</p>
                    {selectedSubTypeId && activeDocType?.subTypes && (
                      <p className="mt-1">
                        Sub-type: {activeDocType.subTypes.find(st => st.id === selectedSubTypeId)?.name}
                      </p>
                    )}
                  </div> */}

                  {/* Amalgamated Table with Required and Extracted Data */}
                  <div className="border rounded-md overflow-hidden bg-muted/10">
                    <div 
                      className="p-3 border-b bg-muted/20 flex justify-between items-center"
                    >
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium mr-4">Data Elements</h3>
                        <Button 
                          onClick={handleApplyRedactions}
                          disabled={isProcessing || selectedElements.length === 0}
                          size="sm"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Pencil className="h-3 w-3 mr-1" />
                              Apply Redactions
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center cursor-pointer" onClick={() => setResultsDataElementsCollapsed(!resultsDataElementsCollapsed)}>
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${resultsDataElementsCollapsed ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    <div id="amalgamated-data-content" className={resultsDataElementsCollapsed ? "hidden" : "p-2"}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[5%]">Select</TableHead>
                            <TableHead className="w-[20%]">Field Name</TableHead>
                            <TableHead className="w-[10%]">Type</TableHead>
                            <TableHead className="w-[10%]">Category</TableHead>
                            <TableHead className="w-[10%]">Action</TableHead>
                            <TableHead className="w-[20%]">Value</TableHead>
                            <TableHead className="w-[10%]">Identified</TableHead>
                            <TableHead className="w-[15%]">Extracted Field</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Render combined data elements */}
                          {activeDocType && activeDocType.dataElements
                            .map(element => {
                              // Find matching extracted element (if any)
                              const matchingExtracted = extractedElements.find(
                                extractedElement => {
                                  const typedElement = extractedElement as ExtendedRedactionElement;
                                  return typedElement.label === element.name && !typedElement.missing;
                                }
                              );
                              
                              // Check if this element was found in extracted elements
                              const isIdentified = !!matchingExtracted;
                              const typedMatchingElement = matchingExtracted as ExtendedRedactionElement;
                              
                              return (
                                <TableRow key={element.id}>
                                  <TableCell className="text-center">
                                    <Checkbox 
                                      checked={matchingExtracted ? selectedElements.includes(matchingExtracted.id) : false}
                                      onCheckedChange={() => {
                                        if (matchingExtracted) {
                                          toggleElementSelection(matchingExtracted.id);
                                        }
                                      }}
                                      disabled={!matchingExtracted}
                                      id={`select-element-${element.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {element.name}
                                    {element.required && (
                                      <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>{element.type}</TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      element.category === 'PII' ? "destructive" : 
                                      element.category === 'Financial' ? "default" :
                                      "secondary"
                                    } className="text-xs">
                                      {element.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      element.action === 'Redact' ? "destructive" : 
                                      element.action === 'ExtractAndRedact' ? "default" : 
                                      element.action === 'Extract' ? "secondary" :
                                      "outline"
                                    } className="text-xs">
                                      {element.action}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="break-words">
                                    <div className="whitespace-normal">
                                      {matchingExtracted ? (typedMatchingElement.text || "Not found") : "Not found"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={isIdentified ? "default" : "outline"} className={`text-xs ${isIdentified ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                                      {isIdentified ? "Yes" : "No"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {matchingExtracted ? (
                                      <div className="text-sm text-muted-foreground">{typedMatchingElement.label || "Unknown"}</div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">—</div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          }
                          
                          {/* Render subtype data elements if a subtype is selected */}
                          {selectedSubTypeId && activeDocType?.subTypes?.find(st => st.id === selectedSubTypeId)?.dataElements
                            .map(element => {
                              // Find matching extracted element (if any)
                              const matchingExtracted = extractedElements.find(
                                extractedElement => {
                                  const typedElement = extractedElement as ExtendedRedactionElement;
                                  return typedElement.label === element.name && !typedElement.missing;
                                }
                              );
                              
                              // Check if this element was found in extracted elements
                              const isIdentified = !!matchingExtracted;
                              const typedMatchingElement = matchingExtracted as ExtendedRedactionElement;
                              
                              return (
                                <TableRow key={element.id} className="bg-muted/10">
                                  <TableCell className="text-center">
                                    <Checkbox 
                                      checked={matchingExtracted ? selectedElements.includes(matchingExtracted.id) : false}
                                      onCheckedChange={() => {
                                        if (matchingExtracted) {
                                          toggleElementSelection(matchingExtracted.id);
                                        }
                                      }}
                                      disabled={!matchingExtracted}
                                      id={`select-element-${element.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {element.name}
                                    {element.required && (
                                      <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                                    )}
                                    <Badge variant="secondary" className="ml-2 text-xs">Subtype</Badge>
                                  </TableCell>
                                  <TableCell>{element.type}</TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      element.category === 'PII' ? "destructive" : 
                                      element.category === 'Financial' ? "default" :
                                      "secondary"
                                    } className="text-xs">
                                      {element.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      element.action === 'Redact' ? "destructive" : 
                                      element.action === 'ExtractAndRedact' ? "default" : 
                                      element.action === 'Extract' ? "secondary" :
                                      "outline"
                                    } className="text-xs">
                                      {element.action}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="break-words">
                                    <div className="whitespace-normal">
                                      {matchingExtracted ? (typedMatchingElement.text || "Not found") : "Not found"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={isIdentified ? "default" : "outline"} className={`text-xs ${isIdentified ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                                      {isIdentified ? "Yes" : "No"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {matchingExtracted ? (
                                      <div className="text-sm text-muted-foreground">{typedMatchingElement.label || "Unknown"}</div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">—</div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          }
                          
                          {/* Add extracted fields that don't match any configured field */}
                          {extractedElements
                            .filter(element => {
                              const typedElement = element as ExtendedRedactionElement;
                              const configuredElements = getConfiguredDataElements();
                              return typedElement.label && typedElement.text && !typedElement.missing &&
                                !configuredElements.some(ce => ce.name === typedElement.label);
                            })
                            .map(element => {
                              const typedElement = element as ExtendedRedactionElement;
                              return (
                                <TableRow key={element.id} className="bg-blue-50">
                                  <TableCell className="text-center">
                                    <Checkbox 
                                      checked={selectedElements.includes(element.id)}
                                      onCheckedChange={() => toggleElementSelection(element.id)}
                                      id={`select-element-${element.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    <span className="italic text-muted-foreground">Not configured</span>
                                  </TableCell>
                                  <TableCell>—</TableCell>
                                  <TableCell>—</TableCell>
                                  <TableCell>—</TableCell>
                                  <TableCell className="break-words">
                                    <div className="whitespace-normal">{typedElement.text || "Not found"}</div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">
                                      Extra
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-sm">{typedElement.label || "Unknown"}</div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          }
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={handleApplyRedactions}
                      disabled={isProcessing || selectedElements.length === 0}
                      className="flex-1"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Pencil className="h-4 w-4 mr-2" />
                          Apply Redactions
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={handleDownload}
                      disabled={!redactedImageUrl}
                      variant="outline"
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Redacted
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
          
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
              
              {/* Removed toolbar from here as it will be moved below */}
            </div>
            
            {/* Document classification info box - updated for better confidence display */}
            {imageUrl && (
              <div className="mb-4 border rounded-md p-3 bg-muted/10">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Document Classification:</span>
                    {activeDocumentTypeId 
                      ? <Badge variant="outline" className={`text-xs ${
                          gptClassificationResult?.confidence && gptClassificationResult?.confidence > 0.7 
                            ? 'bg-green-50 text-green-700' 
                            : classificationResult?.confidence && classificationResult?.confidence > 0.7
                            ? 'bg-blue-50 text-blue-700'
                            : !useAutoClassification
                            ? 'bg-green-50 text-green-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {gptClassificationResult?.confidence 
                            ? `${(gptClassificationResult.confidence * 100).toFixed(0)}% Confidence`
                            : classificationResult?.confidence 
                            ? `${(classificationResult.confidence * 100).toFixed(0)}% Confidence`
                            : !useAutoClassification 
                            ? '100% Confidence'
                            : ''}
                        </Badge>
                      : <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600">
                          Unclassified
                        </Badge>
                    }
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {activeDocumentTypeId 
                        ? config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.name || 'Unknown'
                        : 'Unclassified'}
                    </span>
                    {selectedSubTypeId && activeDocumentTypeId && (
                      <>
                        <span className="text-muted-foreground text-sm">→</span>
                        <span className="text-sm font-medium">
                          {config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.subTypes?.find(st => st.id === selectedSubTypeId)?.name || ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {imageUrl ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="original">Original Document</TabsTrigger>
                  {extractedText && <TabsTrigger value="text">Extracted Text</TabsTrigger>}
                  {extractedElements.length > 0 && activeDocumentTypeId && (
                    <TabsTrigger value="extracted">Data Elements</TabsTrigger>
                  )}
                  {documentSummary && (
                    <TabsTrigger value="summary">Document Summary</TabsTrigger>
                  )}
                  {redactedImageUrl && <TabsTrigger value="redacted">Redacted Document</TabsTrigger>}
                </TabsList>
                
                <TabsContent value="original" className="mt-0">
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-1">
                    {/* Moved document info here */}
                    {file && (
                      <div className="p-2 border-b mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{file.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {file.type === 'application/pdf' ? 'PDF' : 
                               file.type?.includes('image') ? 'Image' : 'Document'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                            {isFileFormatSupported() && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                Supported Format
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
                    {/* Remove info alert box */}
                    
                    {/* Enhanced data elements table showing all configured elements */}
                    {activeDocType && (
                      <div className="space-y-4">
                        {/* Collapsible Required Data Elements section */}
                        <div className="border rounded-md overflow-hidden bg-muted/10">
                          <div 
                            className="p-3 border-b bg-muted/20 flex justify-between items-center cursor-pointer"
                            onClick={() => setRequiredElementsCollapsed(!requiredElementsCollapsed)}
                          >
                            <h3 className="text-lg font-medium">Required Data Elements</h3>
                            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${requiredElementsCollapsed ? "rotate-180" : ""}`} />
                          </div>
                          <div id="required-data-elements-content" className={requiredElementsCollapsed ? "hidden" : "p-2"}>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[40%]">Field Name</TableHead>
                                  <TableHead className="w-[15%]">Type</TableHead>
                                  <TableHead className="w-[15%]">Category</TableHead>
                                  <TableHead className="w-[15%]">Action</TableHead>
                                  <TableHead className="w-[15%]">Identified</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {/* Render document type data elements */}
                                {activeDocType.dataElements
                                  .map(element => {
                                    // Check if this element was found in extracted elements
                                    const isIdentified = extractedElements.some(
                                      extractedElement => {
                                        const typedElement = extractedElement as ExtendedRedactionElement;
                                        return typedElement.label === element.name && !typedElement.missing;
                                      }
                                    );
                                    
                                    return (
                                      <TableRow key={element.id}>
                                        <TableCell className="font-medium">
                                          {element.name}
                                          {element.required && (
                                            <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>{element.type}</TableCell>
                                        <TableCell>
                                          <Badge variant={
                                            element.category === 'PII' ? "destructive" : 
                                            element.category === 'Financial' ? "default" :
                                            "secondary"
                                          } className="text-xs">
                                            {element.category}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={
                                            element.action === 'Redact' ? "destructive" : 
                                            element.action === 'ExtractAndRedact' ? "default" : 
                                            element.action === 'Extract' ? "secondary" :
                                            "outline"
                                          } className="text-xs">
                                            {element.action}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={isIdentified ? "default" : "outline"} className={`text-xs ${isIdentified ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                                            {isIdentified ? "Yes" : "No"}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })
                                }
                                
                                {/* Render subtype data elements if a subtype is selected */}
                                {selectedSubTypeId && activeDocType.subTypes?.find(st => st.id === selectedSubTypeId)?.dataElements
                                  .map(element => {
                                    // Check if this element was found in extracted elements
                                    const isIdentified = extractedElements.some(
                                      extractedElement => {
                                        const typedElement = extractedElement as ExtendedRedactionElement;
                                        return typedElement.label === element.name && !typedElement.missing;
                                      }
                                    );
                                    
                                    return (
                                      <TableRow key={element.id} className="bg-muted/10">
                                        <TableCell className="font-medium">
                                          {element.name}
                                          {element.required && (
                                            <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                                          )}
                                          <Badge variant="secondary" className="ml-2 text-xs">Subtype</Badge>
                                        </TableCell>
                                        <TableCell>{element.type}</TableCell>
                                        <TableCell>
                                          <Badge variant={
                                            element.category === 'PII' ? "destructive" : 
                                            element.category === 'Financial' ? "default" :
                                            "secondary"
                                          } className="text-xs">
                                            {element.category}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={
                                            element.action === 'Redact' ? "destructive" : 
                                            element.action === 'ExtractAndRedact' ? "default" : 
                                            element.action === 'Extract' ? "secondary" :
                                            "outline"
                                          } className="text-xs">
                                            {element.action}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={isIdentified ? "default" : "outline"} className={`text-xs ${isIdentified ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                                            {isIdentified ? "Yes" : "No"}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })
                                }
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Extracted elements table (show only if we have extracted elements) */}
                    {extractedElements.length > 0 && (
                      <div className="space-y-4 mt-6">
                        {/* Collapsible Extracted Data section */}
                        <div className="border rounded-md overflow-hidden bg-muted/10">
                          <div 
                            className="p-3 border-b bg-muted/20 flex justify-between items-center cursor-pointer"
                            onClick={() => setExtractedDataCollapsed(!extractedDataCollapsed)}
                          >
                            <h3 className="text-lg font-medium">Extracted Data</h3>
                            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${extractedDataCollapsed ? "rotate-180" : ""}`} />
                          </div>
                          <div id="extracted-data-content" className={extractedDataCollapsed ? "hidden" : "p-2"}>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[10%]">Select</TableHead>
                                  <TableHead className="w-[50%]">Field</TableHead>
                                  <TableHead className="w-[40%]">Value</TableHead>
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
                                        <TableCell className="break-words">
                                          <div className="whitespace-normal">{typedElement.text || "Not found"}</div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Show message if no document type is selected */}
                    {!activeDocType && (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mb-2 text-amber-500" />
                        <p>Please classify the document to view available data elements</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                {/* Extracted Text tab */}
                <TabsContent value="text" className="mt-0">
                  <div className="space-y-4">
                    {/* Section 1: Extracted Document Text */}
                    <div className="border rounded-md overflow-hidden bg-muted/10">
                      <div 
                        className="p-3 border-b bg-muted/20 flex justify-between items-center cursor-pointer"
                        onClick={() => setExtractedTextCollapsed(!extractedTextCollapsed)}
                      >
                        <h3 className="text-lg font-medium">Extracted Document Text</h3>
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${extractedTextCollapsed ? "rotate-180" : ""}`} />
                      </div>
                      <div id="extracted-text-content" className={extractedTextCollapsed ? "hidden" : "p-4"}>
                        {extractedText ? (
                          <div className="relative">
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
                            <pre className="text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                              {extractedText}
                            </pre>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground min-h-[200px]">
                            <FileText className="h-12 w-12 mb-4 text-muted-foreground/50" />
                            <p>No text extracted yet</p>
                            <p className="text-sm text-muted-foreground mt-2">Process the document to extract text</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Section 2: Textract Response */}
                    <div className="border rounded-md overflow-hidden bg-muted/10">
                      <div 
                        className="p-3 border-b bg-muted/20 flex justify-between items-center cursor-pointer"
                        onClick={() => setTextractResponseCollapsed(!textractResponseCollapsed)}
                      >
                        <h3 className="text-lg font-medium">AWS Textract Response</h3>
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${textractResponseCollapsed ? "rotate-180" : ""}`} />
                      </div>
                      <div id="textract-response-content" className={textractResponseCollapsed ? "hidden" : "p-4"}>
                        {rawTextractData ? (
                          <div className="relative">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="absolute top-2 right-2"
                              onClick={() => {
                                if (rawTextractData) {
                                  navigator.clipboard.writeText(JSON.stringify(rawTextractData, null, 2));
                                  toast({
                                    title: "Copied to clipboard",
                                    description: "The Textract response has been copied to your clipboard",
                                  });
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <pre className="text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                              {JSON.stringify(rawTextractData, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground min-h-[200px]">
                            <FileJson className="h-12 w-12 mb-4 text-muted-foreground/50" />
                            <p>No Textract response available</p>
                            <p className="text-sm text-muted-foreground mt-2">Process a document to see the raw Textract response</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
                
                {/* Document Summary tab */}
                <TabsContent value="summary" className="mt-0">
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-sm text-blue-800 flex items-start">
                      <Info className="h-5 w-5 mr-2 flex-shrink-0 text-blue-500" />
                      <div>
                        <p className="font-medium mb-1">Document Summary</p>
                        <p>This tab shows a summary of the document's content and identified elements.</p>
                      </div>
                    </div>
                    
                    {documentSummary ? (
                      <div>
                        <h3 className="text-lg font-medium mb-2">Document Summary</h3>
                        <pre className="bg-muted/50 p-3 rounded-md whitespace-pre-wrap text-sm">
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

