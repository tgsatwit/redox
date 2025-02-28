"use client"

import { useState, useEffect } from "react"
import { FileUploader } from "./file-uploader"
import { DocumentViewer } from "./document-viewer"
import { DataExtractor } from "./data-extractor"
import { RedactionControls } from "./redaction-controls"
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
import { processDocument } from "@/lib/document-processing"
import { redactDocument } from "@/lib/redaction"
import type { DocumentData, DataElementConfig, DocumentTypeConfig, AnyBoundingBox, AwsBoundingBox } from "@/lib/types"
import { Loader2, FileText, Settings, AlignLeft, AlertTriangle, Scissors, FileSearch, Wrench, Eraser } from "lucide-react"
import { useConfigStore } from "@/lib/config-store"
import { useRouter } from "next/navigation"
import { convertPdfToBase64 } from "../lib/pdf-utils"
import { ensurePdfJsLoaded, reloadPdfJs } from "@/lib/pdf-preloader"
import { processMultiPagePdf, RedactionElement, applyRedactionsToPdf } from '@/lib/pdf-redaction'
import { AwsCredentialsHelper } from './aws-credentials-helper'
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import { toast } from "@/components/ui/use-toast"

// Helper functions
// Extended RedactionElement type to include properties we need
interface ExtendedRedactionElement extends RedactionElement {
  label?: string;
  type?: string;
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
  const { config, activeDocumentTypeId, setActiveDocumentType } = useConfigStore()
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
  const [documentClassification, setDocumentClassification] = useState<{
    classes: Array<{name: string; score: number}>;
    dominant: string;
    sentiment?: string;
    sentimentScores?: {
      Positive?: number;
      Negative?: number;
      Neutral?: number;
      Mixed?: number;
    };
    isLoading: boolean;
  } | null>(null)
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
  const { toast } = useToast()

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

  const handleFileUpload = async (uploadedFile: File | null) => {
    if (!uploadedFile) {
      setFile(null);
      return;
    }
    
    setFile(uploadedFile);
    setImageUrl(null);
    setExtractedText("");
    setExtractedElements([]);
    setActiveTab("Document");
    
    // Generate a data URL to display the document
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(uploadedFile);
    
    try {
      // For PDF documents, we should check if it's multipage
      if (uploadedFile.type === 'application/pdf') {
        // Check if this is a multipage PDF
        let pageCount = 1;
        try {
          pageCount = await getPdfPageCount(uploadedFile);
        } catch (e) {
          console.warn('Error getting PDF page count:', e);
        }
        
        if (pageCount > 10) {
          // For large PDFs, automatically use page-by-page processing
          toast({
            title: "Large PDF detected",
            description: `This PDF has ${pageCount} pages. It will be processed page by page for best results.`,
            duration: 5000
          });
          
          // Wait for the file to be set before triggering page-by-page processing
          setTimeout(() => {
            handleProcessPageByPage();
          }, 500);
          return;
        }
      }
    } catch (error) {
      console.error('Error checking PDF page count:', error);
    }
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
    
    if (!activeDocType) {
      toast({
        title: "No document type selected",
        description: "Please select a document type before processing.",
        variant: "destructive"
      });
      return;
    }

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
      
      // Create form data for the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', activeDocType!.name);
      
      // Add extraction elements if configured
      if (activeDocType!.dataElements) {
        formData.append('elementsToExtract', 
          JSON.stringify(activeDocType!.dataElements.map((e: any) => ({
            id: e.id,
            name: e.name,
            type: e.type
          })))
        );
      }
      
      // Process the document
      const response = await fetch('/api/process-document', {
        method: 'POST',
        body: formData
      });
      
      // Parse the response
      const result = await response.json();
      
      // Check if we need page-by-page processing
      if (response.status === 400 && result.requiresPageByPage) {
        console.log('Server indicated this document requires page-by-page processing');
        toast({
          title: "Page by page processing required",
          description: result.message || "This document requires page-by-page processing for best results.",
          duration: 5000
        });
        handleProcessPageByPage();
        return;
      }
      
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}: ${response.statusText}`);
      }
      
      // Update the state with the processed data
      setExtractedText(result.extractedText || '');
      
      // Convert the fields to the expected format if necessary
      if (result.extractedFields && Array.isArray(result.extractedFields)) {
        setExtractedElements(
          result.extractedFields.map((field: any) => ({
            id: field.id || `field-${Math.random().toString(36).substring(2, 11)}`,
            text: field.value || field.text || '',
            label: field.label || '',
            confidence: field.confidence || 0,
            boundingBox: field.boundingBox || null,
            pageIndex: field.pageIndex || 0
          }))
        );
      }
      
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
      
      // Move to the next step
      setActiveTab("Results");
      
    } catch (error) {
      console.error('Error processing document:', error);
      
      // Get the error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for special cases
      if (errorMessage.includes('requires page-by-page processing')) {
        handleProcessPageByPage();
        return;
      }
      
      setProcessError(errorMessage);
      
      // Check if this is an AWS configuration error
      if (
        errorMessage.includes('AWS') || 
        errorMessage.includes('credentials') || 
        errorMessage.includes('access key')
      ) {
        setShowAwsHelper(true);
      }
    } finally {
      setIsProcessing(false);
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
        title: "No file selected",
        description: "Please upload a document first.",
        variant: "destructive"
      });
      return;
    }
    
    if (selectedElements.length === 0) {
      toast({
        title: "No elements selected",
        description: "Please select elements to redact.",
        variant: "destructive"
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      let fileToRedact = file;
      
      // If it's a PDF and we have a base64 version, convert it to a File object
      if (file.type === "application/pdf" && imageUrl && imageUrl.startsWith('data:application/pdf;base64,')) {
        const base64Data = imageUrl.split(',')[1];
        fileToRedact = convertBase64ToFile(base64Data, file.name, 'application/pdf');
      }
      
      // Create the document data structure expected by redactDocument
      const documentDataForRedaction = {
        documentType: activeDocType?.name || 'Unknown',
        confidence: 100,
        extractedText: extractedText || '',
        extractedFields: extractedElements.map(element => ({
          id: element.id,
          label: (element as any).label || 'Text',
          value: element.text,
          dataType: (element as any).type || 'Text',
          confidence: element.confidence,
          boundingBox: element.boundingBox,
          page: element.pageIndex
        }))
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

  const handleClassifyDocument = async () => {
    if (!file) return;
    
    // Set loading state
    setDocumentClassification({
      classes: [],
      dominant: "",
      isLoading: true
    });
    
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
      setDocumentClassification({
        classes: data.classes,
        dominant: data.dominant,
        sentiment: data.sentiment,
        sentimentScores: data.sentimentScores,
        isLoading: false
      });
      
      // Show success toast
      toast({
        title: "Document Classified",
        description: `Identified as: ${data.dominant}`,
        variant: "default"
      });
      
      // If we have a matching document type in our config, select it automatically
      if (data.dominant) {
        const matchingDocType = config.documentTypes.find(
          dt => dt.name.toLowerCase() === data.dominant.toLowerCase()
        );
        
        if (matchingDocType) {
          setActiveDocumentType(matchingDocType.id);
          toast({
            title: "Document Type Set",
            description: `Automatically selected ${matchingDocType.name}`,
            variant: "default"
          });
        }
      }
    } catch (error) {
      console.error('Error classifying document:', error);
      
      // Reset loading state but keep any previous results
      setDocumentClassification(prev => prev 
        ? { ...prev, isLoading: false } 
        : { classes: [], dominant: "", isLoading: false });
      
      const errorMessage = error instanceof Error ? error.message : "Failed to classify document";
      
      // Check if this is an AWS permissions error
      if (errorMessage.includes('AccessDeniedException') || 
          errorMessage.includes('not authorized to perform: comprehend:') || 
          errorMessage.includes('AWS configuration')) {
        setProcessError('AWS Comprehend permissions are required for document classification. Please update your IAM policy.');
        setShowAwsHelper(true);
        
        toast({
          title: "AWS Permissions Error",
          description: "Your AWS user needs Comprehend permissions. See instructions below.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Classification Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
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

  // Handler for new manual selections from DocumentViewer
  const handleManualSelectionAdded = (selection: {
    id: string;
    label: string;
    boundingBox: {
      Left: number;
      Top: number;
      Width: number;
      Height: number;
    };
  }) => {
    // Add to manual selections
    setManualSelections(prev => [...prev, selection]);
    
    // Also add to selected elements for redaction
    setSelectedElements(prev => [...prev, selection.id]);
    
    // Create a corresponding extracted element
    const newElement = {
      id: selection.id,
      text: selection.label,
      label: selection.label,
      type: 'Manual',
      confidence: 1.0,
      boundingBox: selection.boundingBox,
      pageIndex: 0
    };
    
    // Add to extracted elements
    setExtractedElements(prev => [...prev, newElement]);
    
    // Show confirmation
    toast({
      title: "Selection Added",
      description: `"${selection.label}" has been added to redactions.`,
      variant: "default",
    });
  };

  // Add predefined redaction templates for common document types
  const redactionTemplates = {
    passport: [
      { id: 'template-passport-number', label: 'Passport Number', boundingBoxRatio: { Left: 0.7, Top: 0.16, Width: 0.25, Height: 0.04 } },
      { id: 'template-mrz-line1', label: 'MRZ Line 1', boundingBoxRatio: { Left: 0.05, Top: 0.94, Width: 0.9, Height: 0.025 } },
      { id: 'template-mrz-line2', label: 'MRZ Line 2', boundingBoxRatio: { Left: 0.05, Top: 0.97, Width: 0.9, Height: 0.025 } },
      { id: 'template-photo', label: 'Photo', boundingBoxRatio: { Left: 0.05, Top: 0.2, Width: 0.3, Height: 0.4 } },
      { id: 'template-signature', label: 'Signature', boundingBoxRatio: { Left: 0.6, Top: 0.7, Width: 0.3, Height: 0.1 } }
    ],
    driverLicense: [
      { id: 'template-license-number', label: 'License Number', boundingBoxRatio: { Left: 0.6, Top: 0.3, Width: 0.35, Height: 0.05 } },
      { id: 'template-photo', label: 'Photo', boundingBoxRatio: { Left: 0.05, Top: 0.2, Width: 0.3, Height: 0.45 } },
      { id: 'template-signature', label: 'Signature', boundingBoxRatio: { Left: 0.5, Top: 0.7, Width: 0.4, Height: 0.1 } }
    ]
  };
  
  // Apply a predefined template based on document type
  const applyRedactionTemplate = (templateType: 'passport' | 'driverLicense') => {
    if (!redactionTemplates[templateType] || !imageUrl) {
      toast({
        title: "Cannot apply template",
        description: "Template not available or no document loaded",
        variant: "destructive"
      });
      return;
    }
    
    // Create new selection elements from the template
    const newSelections = redactionTemplates[templateType].map(template => ({
      id: `${template.id}-${Date.now()}`,
      label: template.label,
      boundingBox: template.boundingBoxRatio
    }));
    
    // Add to manual selections
    setManualSelections(prev => [...prev, ...newSelections]);
    
    // Add to selected elements for redaction
    const newSelectedElementIds = newSelections.map(s => s.id);
    setSelectedElements(prev => [...prev, ...newSelectedElementIds]);
    
    // Add to extracted elements
    const newExtractedElements = newSelections.map(selection => ({
      id: selection.id,
      text: selection.label,
      label: selection.label,
      type: 'Template',
      confidence: 1.0,
      boundingBox: selection.boundingBox,
      pageIndex: 0
    }));
    
    setExtractedElements(prev => [...prev, ...newExtractedElements]);
    
    toast({
      title: "Template Applied",
      description: `Applied ${templateType} template with ${newSelections.length} redaction zones`,
      variant: "default"
    });
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
    
    const detectedElements: Array<RedactionElement & { label?: string; type?: string }> = [];
    
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
  
  // Enhanced function to extract text with pattern detection
  const handleExtractTextWithPatterns = async () => {
    await handleExtractText();
    
    // After text extraction, run pattern detection
    if (extractedText) {
      const patternElements = detectPatterns(extractedText);
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
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Upload Document</h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => router.push('/config')}
              >
                <Settings className="h-4 w-4" />
                Configure Document Types
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Document Type
                </label>
                <Select
                  value={activeDocumentTypeId || ''}
                  onValueChange={(value) => setActiveDocumentType(value)}
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
              
              <FileUploader onFileUpload={handleFileUpload} isProcessing={isUploading} file={file} />
            </div>
            
            {uploadError && (
              <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
                {uploadError}
              </div>
            )}
            
            {isPdfJsLoading && (
              <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-md flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Loading PDF processor...</span>
              </div>
            )}
            
            {!isPdfJsLoading && pdfJsLoadError && (
              <div className="mt-4 p-3 bg-amber-50 text-amber-700 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">PDF Processor Warning</span>
                </div>
                <p className="text-sm mb-2">{pdfJsLoadError}</p>
                <p className="text-sm mb-2">This may affect PDF processing. You can try to reload the PDF processor.</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleReloadPdfJs}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reloading...
                    </>
                  ) : (
                    "Reload PDF Processor"
                  )}
                </Button>
              </div>
            )}
          </Card>

          {imageUrl && (
            <Card className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="original">Original Document</TabsTrigger>
                  <TabsTrigger value="text" disabled={!extractedText}>
                    Extracted Text
                  </TabsTrigger>
                  <TabsTrigger value="redacted" disabled={!redactedImageUrl}>
                    Redacted Document
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="original" className="min-h-[400px]">
                  <DocumentViewer 
                    imageUrl={imageUrl} 
                    fileType={file?.type}
                    extractedText={extractedText || undefined} 
                    textError={processError || undefined}
                    onRequestPageByPageProcessing={handleProcessPageByPage}
                    onPdfLoadError={handlePdfViewerError}
                    onSelectionAdded={handleManualSelectionAdded}
                  />
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {file && !isExtractingText && (
                      <Button 
                        onClick={handleExtractTextWithPatterns} 
                        variant="outline" 
                        className="gap-2"
                      >
                        {isExtractingText ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {isPdfJsLoading ? 'Processing PDF in browser...' : 'Extracting Text...'}
                          </>
                        ) : extractedText && processError ? (
                          <>
                            <AlignLeft className="h-4 w-4" />
                            Retry Text Extraction
                          </>
                        ) : extractedText && extractedText.includes("This is a fallback text extraction") ? (
                          <>
                            <AlignLeft className="h-4 w-4" />
                            Use Advanced Extraction
                          </>
                        ) : extractedText ? (
                          <>
                            <AlignLeft className="h-4 w-4" />
                            Refresh Text
                          </>
                        ) : (
                          <>
                            <AlignLeft className="h-4 w-4" />
                            Extract Text
                          </>
                        )}
                      </Button>
                    )}
                    
                    {/* Add template buttons */}
                    {file && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => applyRedactionTemplate('passport')}
                          variant="outline"
                          className="gap-2"
                        >
                          <Scissors className="h-4 w-4" />
                          Apply Passport Template
                        </Button>
                        <Button
                          onClick={() => applyRedactionTemplate('driverLicense')}
                          variant="outline"
                          className="gap-2"
                        >
                          <Scissors className="h-4 w-4" />
                          Apply Driver's License Template
                        </Button>
                      </div>
                    )}
                  </div>
                  {!isFileFormatSupported() && file && (
                    <div className="mt-4 p-3 bg-amber-50 text-amber-700 rounded-md">
                      This file format is not supported for processing. Please upload a PDF, JPEG, PNG, or TIFF file.
                    </div>
                  )}
                  {!activeDocType && file && isFileFormatSupported() && (
                    <div className="mt-4 p-3 bg-amber-50 text-amber-700 rounded-md">
                      Please select a document type before processing.
                    </div>
                  )}
                  {processError && (
                    <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
                      {processError}
                      {processError.includes('version') && (
                        <div className="mt-2">
                          <p className="text-sm">This appears to be a PDF.js version issue. Try reloading the PDF processor.</p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="mt-2"
                            onClick={handleReloadPdfJs}
                          >
                            Reload PDF Processor
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Show AWS Helper when needed */}
                  {showAwsHelper && (
                    <div className="mt-4">
                      <AwsCredentialsHelper />
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="text" className="min-h-[400px]">
                  <div className="rounded-md border bg-muted/40 p-4">
                    <div className="flex justify-between mb-2">
                      <h3 className="text-lg font-medium">Extracted Text</h3>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          if (extractedText) {
                            navigator.clipboard.writeText(extractedText);
                            toast({
                              title: "Copied to clipboard",
                              description: "The extracted text has been copied to your clipboard.",
                              variant: "default"
                            });
                          }
                        }}
                        disabled={!extractedText}
                      >
                        Copy Text
                      </Button>
                    </div>
                    {isExtractingText ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p>Extracting text...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border rounded-md p-4 h-96 overflow-y-auto whitespace-pre-wrap font-mono text-sm">
                        {extractedText || 'No text extracted yet. Use the "Extract Text" button to extract text from the document.'}
                      </div>
                    )}
                    {processError && (
                      <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
                        {processError}
                      </div>
                    )}
                    <div className="mt-4">
                      <Button 
                        onClick={handleExtractTextWithPatterns} 
                        disabled={isExtractingText || !file}
                        variant="outline" 
                        className="gap-2"
                      >
                        {isExtractingText ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Extracting Text...
                          </>
                        ) : (
                          <>
                            <AlignLeft className="h-4 w-4" />
                            {extractedText ? 'Refresh Text' : 'Extract Text'}
                          </>
                        )}
                      </Button>
                      {extractedText && (
                        <Button
                          onClick={() => setActiveTab("original")}
                          variant="ghost"
                          className="ml-2"
                        >
                          Return to Document
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="redacted" className="min-h-[400px]">
                  {redactedImageUrl && <DocumentViewer 
                    imageUrl={redactedImageUrl} 
                    fileType="image/png"
                    extractedText={extractedText || undefined}
                    redactionElements={[
                      // Include auto-detected elements that are selected for redaction
                      ...extractedElements
                        .filter(elem => selectedElements.includes(elem.id))
                        .map(elem => ({
                          id: elem.id,
                          boundingBox: elem.boundingBox as any
                        })),
                      // Include manual selections
                      ...manualSelections
                    ]}
                  />}
                </TabsContent>
              </Tabs>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {isProcessing ? (
            <Card className="p-6 flex items-center justify-center min-h-[200px]">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Processing document...</p>
              </div>
            </Card>
          ) : documentData ? (
            <>
              <Card className="p-4">
                <h2 className="text-xl font-semibold mb-2">Document Information</h2>
                <div className="space-y-2">
                  <p>
                    <strong>Document Type:</strong> {activeDocType?.name || documentData.documentType}
                  </p>
                  <p>
                    <strong>Confidence:</strong> {documentData.confidence}%
                  </p>
                </div>
              </Card>

              <DataExtractor
                extractedFields={documentData.extractedFields}
                fieldsToRedact={fieldsToRedact}
                onToggleField={toggleFieldRedaction}
              />

              <RedactionControls
                onRedact={handleRedaction}
                onDownload={handleDownload}
                canRedact={documentData.extractedFields.length > 0}
                canDownload={!!redactedImageUrl}
              />
            </>
          ) : null}

          {/* Add page-by-page processing button for PDFs */}
          {file && file.type === "application/pdf" && !isProcessing && !documentData && (
            <Card className="p-4 border border-muted-foreground/20">
              <h2 className="text-lg font-semibold mb-3">PDF Processing Options</h2>
              
              {/* PDF rendering guidance for users */}
              {(pdfViewerError) && (
                <div className="mb-4 p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-sm">
                  <p className="font-medium">PDF rendering issue detected</p>
                  <p className="text-xs mt-1">We recommend using "Process PDF Page by Page" below</p>
                </div>
              )}
              
              {/* Classification results, if available */}
              {documentClassification && !documentClassification.isLoading && (
                <div className="mb-4 p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-sm">
                  <p className="font-medium">Document Classification</p>
                  
                  {/* Entity types */}
                  <p className="mt-1">
                    <span className="font-semibold">Primary Entity Type:</span> {documentClassification.dominant}
                  </p>
                  
                  {/* Sentiment analysis if available */}
                  {documentClassification.sentiment && (
                    <p className="mt-1">
                      <span className="font-semibold">Sentiment:</span> {documentClassification.sentiment}
                      {documentClassification.sentimentScores && (
                        <span className="text-xs ml-2">
                          ({Math.round((documentClassification.sentimentScores?.Positive || 0) * 100)}% positive)
                        </span>
                      )}
                    </p>
                  )}
                  
                  <div className="mt-2 text-xs">
                    <p className="font-medium mb-1">Entity types found:</p>
                    <ul className="space-y-1">
                      {documentClassification.classes.map(c => (
                        <li key={c.name} className="flex justify-between">
                          <span>{c.name}</span>
                          <span>{(c.score * 100).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <Button 
                  onClick={handleProcessDocument}
                  disabled={isProcessing}
                  className="w-full flex justify-start items-center"
                  size="lg"
                >
                  <FileText className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div>Process as {activeDocType?.name || 'Document'}</div>
                    <div className="text-xs font-normal opacity-80">Standard processing</div>
                  </div>
                </Button>
                
                <Button 
                  onClick={handleProcessPageByPage}
                  disabled={isProcessingPageByPage}
                  className="w-full flex justify-start items-center"
                  variant={(pdfViewerError) ? "default" : "secondary"}
                  size="lg"
                >
                  <FileSearch className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div>Process PDF Page by Page</div>
                    <div className="text-xs font-normal opacity-80">Recommended for complex PDFs</div>
                  </div>
                </Button>
                
                <Button 
                  onClick={handleClassifyDocument}
                  disabled={isProcessing || !file || documentClassification?.isLoading}
                  className="w-full flex justify-start items-center"
                  variant="outline"
                  size="lg"
                >
                  <Loader2 className={`mr-3 h-5 w-5 ${documentClassification?.isLoading ? 'animate-spin' : ''}`} />
                  <div className="text-left">
                    <div>{documentClassification?.isLoading ? 'Classifying...' : 'Classify Document'}</div>
                    <div className="text-xs font-normal opacity-80">Analyze document type with AWS Comprehend</div>
                  </div>
                </Button>
                
                <details className="text-sm mt-2">
                  <summary className="cursor-pointer font-medium">Advanced Options</summary>
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-2 border-t">
                    <Button 
                      onClick={handleTestPageSplitting}
                      disabled={isProcessing}
                      className="flex justify-center items-center gap-2"
                      variant="outline"
                      size="sm"
                    >
                      <FileText className="h-4 w-4" />
                      Test Page Splitting
                    </Button>

                    <Button 
                      onClick={handleDiagnosticTest}
                      disabled={isProcessing}
                      className="flex justify-center items-center gap-2"
                      variant="outline"
                      size="sm"
                    >
                      <Wrench className="h-4 w-4" />
                      Run Diagnostic
                    </Button>
                  </div>
                </details>
              </div>
            </Card>
          )}

          {/* Add processing options for non-PDF files */}
          {file && file.type !== "application/pdf" && !isProcessing && !documentData && isFileFormatSupported() && (
            <Card className="p-4 border border-muted-foreground/20">
              <h2 className="text-lg font-semibold mb-3">Document Processing Options</h2>
              
              {/* Classification results, if available */}
              {documentClassification && !documentClassification.isLoading && (
                <div className="mb-4 p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-sm">
                  <p className="font-medium">Document Classification</p>
                  
                  {/* Entity types */}
                  <p className="mt-1">
                    <span className="font-semibold">Primary Entity Type:</span> {documentClassification.dominant}
                  </p>
                  
                  {/* Sentiment analysis if available */}
                  {documentClassification.sentiment && (
                    <p className="mt-1">
                      <span className="font-semibold">Sentiment:</span> {documentClassification.sentiment}
                      {documentClassification.sentimentScores && (
                        <span className="text-xs ml-2">
                          ({Math.round((documentClassification.sentimentScores?.Positive || 0) * 100)}% positive)
                        </span>
                      )}
                    </p>
                  )}
                  
                  <div className="mt-2 text-xs">
                    <p className="font-medium mb-1">Entity types found:</p>
                    <ul className="space-y-1">
                      {documentClassification.classes.map(c => (
                        <li key={c.name} className="flex justify-between">
                          <span>{c.name}</span>
                          <span>{(c.score * 100).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <Button 
                  onClick={handleProcessDocument}
                  disabled={isProcessing}
                  className="w-full flex justify-start items-center"
                  size="lg"
                >
                  <FileText className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div>Process as {activeDocType?.name || 'Document'}</div>
                    <div className="text-xs font-normal opacity-80">Standard processing</div>
                  </div>
                </Button>
                
                <Button 
                  onClick={handleClassifyDocument}
                  disabled={isProcessing || !file || documentClassification?.isLoading}
                  className="w-full flex justify-start items-center"
                  variant="outline"
                  size="lg"
                >
                  <Loader2 className={`mr-3 h-5 w-5 ${documentClassification?.isLoading ? 'animate-spin' : ''}`} />
                  <div className="text-left">
                    <div>{documentClassification?.isLoading ? 'Classifying...' : 'Classify Document'}</div>
                    <div className="text-xs font-normal opacity-80">Analyze document type with AWS Comprehend</div>
                  </div>
                </Button>
              </div>
            </Card>
          )}

          {/* Processing status and progress bar */}
          {isProcessingPageByPage && (
            <div className="mt-4 space-y-2">
              <div className="text-sm text-muted-foreground">{processingStatus}</div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Extracted elements for redaction */}
          {extractedElements.length > 0 && (
            <Card className="mt-6 p-4">
              <h3 className="text-lg font-medium mb-2">Extracted Elements for Redaction</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select elements to redact. {selectedElements.length} elements selected.
              </p>
              
              {activeDocType && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {activeDocType.dataElements
                    .filter(de => de.action === 'Redact' || de.action === 'ExtractAndRedact')
                    .map(de => (
                      <Badge key={de.id} variant="outline" className="px-2 py-1 text-xs">
                        {de.name} ({de.category})
                      </Badge>
                    ))}
                </div>
              )}
              
              <Tabs defaultValue="list" className="w-full">
                <TabsList>
                  <TabsTrigger value="list">List View</TabsTrigger>
                  <TabsTrigger value="category">By Category</TabsTrigger>
                </TabsList>
                
                <TabsContent value="list" className="mt-4">
                  <div className="max-h-[450px] overflow-y-auto space-y-2">
                    {extractedElements.map(element => (
                      <div 
                        key={element.id}
                        className={`p-3 border rounded flex flex-col hover:bg-gray-50 transition-colors ${
                          selectedElements.includes(element.id) 
                            ? 'border-blue-500 bg-blue-50 shadow-sm' 
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => toggleElementSelection(element.id)}>
                          <Checkbox
                            checked={selectedElements.includes(element.id)}
                            onCheckedChange={() => toggleElementSelection(element.id)}
                            className={`h-5 w-5 ${selectedElements.includes(element.id) ? 'bg-blue-600 border-blue-600' : ''}`}
                          />
                          <div className="flex-1">
                            <div className={`font-medium truncate max-w-md ${selectedElements.includes(element.id) ? 'text-blue-700' : ''}`}>
                              {element.text}
                            </div>
                            <div className="text-xs flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {(element as ExtendedRedactionElement).type === '' 
                                  ? 'None' 
                                  : (element as ExtendedRedactionElement).type || 'Text'}
                              </Badge>
                              <span className="text-muted-foreground">
                                Page: {element.pageIndex + 1} | Confidence: {Math.min(100, (element.confidence * 100)).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Add controls for changing element type */}
                        {selectedElements.includes(element.id) && activeDocType && (
                          <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-2">
                            <div className="text-xs font-medium">Change type:</div>
                            <Select
                              value={
                                (element as ExtendedRedactionElement).type === '' 
                                  ? 'none' 
                                  : (element as ExtendedRedactionElement).type || 'Text'
                              }
                              onValueChange={(value) => {
                                // Update the element type
                                setExtractedElements(prev => 
                                  prev.map(el => 
                                    el.id === element.id 
                                      ? {
                                          ...el, 
                                          type: value === 'none' ? '' : value, 
                                          label: value === 'none' ? '' : value
                                        } 
                                      : el
                                  )
                                );
                                
                                toast({
                                  title: "Element type changed",
                                  description: `Changed to: ${value === 'none' ? 'None' : value}`,
                                  variant: "default"
                                });
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {activeDocType?.dataElements.map((de) => (
                                  <SelectItem key={de.id} value={de.type || de.name}>
                                    {de.name}
                                  </SelectItem>
                                ))}
                                <SelectItem value="Text">Generic Text</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {/* Show bounding box information if available */}
                        {element.boundingBox && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Position: {
                                ((box) => {
                                  return 'Left' in box 
                                    ? (box.Left * 100).toFixed(1) + '%'
                                    : (box.x * 100).toFixed(1) + '%';
                                })(element.boundingBox)
                              }, {
                                ((box) => {
                                  return 'Top' in box 
                                    ? (box.Top * 100).toFixed(1) + '%'
                                    : (box.y * 100).toFixed(1) + '%';
                                })(element.boundingBox)
                              }</span>
                              <span>Size: {
                                ((box) => {
                                  return 'Width' in box 
                                    ? (box.Width * 100).toFixed(1) + '%'
                                    : (box.width * 100).toFixed(1) + '%';
                                })(element.boundingBox)
                              } × {
                                ((box) => {
                                  return 'Height' in box 
                                    ? (box.Height * 100).toFixed(1) + '%'
                                    : (box.height * 100).toFixed(1) + '%';
                                })(element.boundingBox)
                              }</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="category" className="mt-4">
                  <div className="space-y-4">
                    {Object.entries(
                      extractedElements.reduce((acc, element) => {
                        const category = getElementCategory(
                          element as ExtendedRedactionElement, 
                          activeDocType || null
                        );
                        acc[category] = acc[category] || [];
                        acc[category].push(element);
                        return acc;
                      }, {} as Record<string, typeof extractedElements>)
                    ).map(([category, elements]) => (
                      <div key={category} className="border rounded-md p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <h4 className="font-medium">{category}</h4>
                          <Badge>{elements.length}</Badge>
                        </div>
                        
                        <div className="space-y-2">
                          {elements.map(element => (
                            <div 
                              key={element.id}
                              className={`p-2 border rounded flex items-center space-x-2 cursor-pointer hover:bg-gray-50 ${
                                selectedElements.includes(element.id) ? 'border-blue-500 bg-blue-50' : ''
                              }`}
                              onClick={() => toggleElementSelection(element.id)}
                            >
                              <Checkbox
                                checked={selectedElements.includes(element.id)}
                                onCheckedChange={() => toggleElementSelection(element.id)}
                              />
                              <div className="flex-1">
                                <div className="truncate max-w-md">{element.text}</div>
                                <div className="text-xs flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {(element as ExtendedRedactionElement).type === '' 
                                      ? 'None' 
                                      : (element as ExtendedRedactionElement).type || 'Text'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
              
              <Button
                className="bg-red-600 text-white hover:bg-red-700 mt-4"
                disabled={selectedElements.length === 0 || isProcessing}
                onClick={handleApplyRedactions}
              >
                <Eraser className="mr-2 h-4 w-4" />
                Apply Redactions ({selectedElements.length})
              </Button>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

