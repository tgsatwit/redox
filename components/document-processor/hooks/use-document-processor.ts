import { useState, useCallback } from 'react';
import { useConfigStoreDB } from "@/lib/config-store-db";
import { processDocument, classifyDocument, submitClassificationFeedback } from "@/lib/document-processing";
import { redactDocument } from "@/lib/redaction";
import { convertPdfToBase64 } from "@/lib/pdf-utils";
import { ensurePdfJsLoaded, reloadPdfJs } from "@/lib/pdf-preloader";
import { 
  DocumentProcessorState, 
  ExtendedRedactionElement, 
  ProcessingOptions, 
  UseDocumentProcessorReturn, 
  ProcessingResult,
  AnyBoundingBox
} from '../types';
import { 
  DataElementConfig,
  DataElementType,
  DataElementCategory,
  DataElementAction,
  DocumentTypeConfig
} from '@/lib/types';
import { useToast } from "@/components/ui/use-toast";
import { getPdfPageCount, convertBase64ToFile } from '../utils/document-utils';

// Move matchDataElements function definition before its usage
const matchDataElements = (extractedElements: ExtendedRedactionElement[], configuredElements: DataElementConfig[]) => {
  const matches: ExtendedRedactionElement[] = [];
  const unmatchedExtracted: ExtendedRedactionElement[] = [];
  
  // Helper function to normalize text for comparison
  const normalizeText = (text: string) => text.toLowerCase().trim();
  
  // Process each extracted element
  extractedElements.forEach(extracted => {
    let matched = false;
    
    // Try to find a match in configured elements
    for (const configured of configuredElements) {
      const extractedLabel = normalizeText(extracted.label || '');
      const configuredName = normalizeText(configured.name);
      const aliases = (configured.aliases || []).map(normalizeText);
      
      // Check for direct match or match with aliases
      if (extractedLabel === configuredName || aliases.includes(extractedLabel)) {
        matches.push({
          ...extracted,
          id: configured.id,  // Use configured element ID
          label: configured.name,  // Use configured element name
          type: configured.type,
          category: configured.category,
          isConfigured: true,
          action: configured.action as any, // Workaround for type incompatibility
          boundingBox: extracted.boundingBox || null  // Ensure boundingBox is not undefined
        });
        matched = true;
        break;
      }
    }
    
    // If no match found, add to unmatched list
    if (!matched) {
      unmatchedExtracted.push({
        ...extracted,
        boundingBox: extracted.boundingBox || null  // Ensure boundingBox is not undefined
      });
    }
  });
  
  // Create placeholders for configured elements that weren't matched
  const unmatchedConfigured = configuredElements
    .filter(configured => !matches.some(match => match.id === configured.id))
    .map(configured => ({
      id: configured.id,
      label: configured.name,
      text: '',
      value: null,
      confidence: 0,
      boundingBox: null,
      pageIndex: 0,
      type: configured.type,
      category: configured.category,
      isConfigured: true,
      missing: true,
      action: configured.action
    } as ExtendedRedactionElement));
  
  return {
    matches,
    unmatchedExtracted,
    unmatchedConfigured
  };
};

export function useDocumentProcessor(): UseDocumentProcessorReturn {
  const { config, activeDocumentTypeId, setActiveDocumentType } = useConfigStoreDB();
  const { toast } = useToast();
  
  // Initialize state
  const [state, setState] = useState<DocumentProcessorState>({
    file: null,
    imageUrl: null,
    documentData: null,
    redactedImageUrl: null,
    isUploading: false,
    isProcessing: false,
    activeTab: "original",
    fieldsToRedact: new Set(),
    uploadError: null,
    processError: null,
    extractedText: null,
    isExtractingText: false,
    isPdfJsLoading: false,
    pdfJsLoadError: null,
    pdfJsStatus: { loaded: false },
    isProcessingPageByPage: false,
    processingStatus: '',
    processingProgress: 0,
    extractedElements: [],
    selectedElements: [],
    showAwsHelper: false,
    pdfViewerError: null,
    useAutoClassification: true,
    isClassifying: false,
    classificationResult: null,
    verificationOpen: false,
    manualSelections: [],
    feedbackSubmitted: false,
    selectedSubTypeId: null,
    workflowStep: 'upload',
    useTextExtractionForClassification: false,
    isClassifyingWithGPT: false,
    gptClassificationResult: null,
    processingOptions: {
      identifyDataElements: false,
      redactElements: false,
      createSummary: false,
      saveDocument: {
        original: false,
        redacted: false
      }
    }
  });

  // Helper function to update state
  const updateState = useCallback((updates: Partial<DocumentProcessorState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Get configured data elements with aliases - update return type to match UseDocumentProcessorReturn
  const getConfiguredDataElements = useCallback(() => {
    // This now returns synchronously to match the expected return type
    if (!activeDocumentTypeId) return [];
    
    const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
    if (!docType) return [];
    
    // Get data elements based on sub-type or document type
    if (state.selectedSubTypeId) {
      const subType = docType.subTypes?.find(st => st.id === state.selectedSubTypeId);
      if (subType) {
        return subType.dataElements;
      }
    }
    
    return docType.dataElements || [];
  }, [activeDocumentTypeId, config.documentTypes, state.selectedSubTypeId]);
  
  // New function to asynchronously fetch data elements with aliases
  const fetchConfiguredDataElements = useCallback(async () => {
    if (!activeDocumentTypeId) return [];
    
    try {
      // Get document type configuration from DynamoDB
      const response = await fetch(`/api/document-types/${activeDocumentTypeId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document type configuration');
      }
      
      const docType = await response.json();
      if (!docType) return [];
      
      // Get data elements based on sub-type or document type
      let dataElements: DataElementConfig[] = [];
      if (state.selectedSubTypeId && docType.subTypes) {
        const subType = docType.subTypes.find((st: { id: string }) => st.id === state.selectedSubTypeId);
        if (subType) {
          dataElements = subType.dataElements;
        }
      }
      
      // If no sub-type or no elements found in sub-type, use document type elements
      if (dataElements.length === 0) {
        dataElements = docType.dataElements || [];
      }
      
      // Enhance data elements with aliases
      return dataElements.map((element: DataElementConfig) => ({
        ...element,
        aliases: element.aliases || []  // Include aliases array if it exists
      }));
    } catch (error) {
      console.error('Error fetching data elements:', error);
      toast({
        title: "Error fetching data elements",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
      return [];
    }
  }, [activeDocumentTypeId, state.selectedSubTypeId, toast]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File | null) => {
    if (!file) {
      updateState({
        file: null,
        imageUrl: null,
        uploadError: null
      });
      return;
    }

    updateState({
      isUploading: true,
      uploadError: null,
      file
    });

    try {
      const base64Data = await convertPdfToBase64(file);
      updateState({
        imageUrl: base64Data,
        isUploading: false
      });
    } catch (error) {
      updateState({
        uploadError: error instanceof Error ? error.message : "Failed to upload file",
        isUploading: false
      });
    }
  }, [updateState]);

  // Handle document processing
  const handleProcessDocument = useCallback(async () => {
    if (!state.file) {
      toast({
        title: "No file selected",
        description: "Please upload a document first.",
        variant: "destructive"
      });
      return;
    }
    
    updateState({
      isProcessing: true,
      processError: null,
      showAwsHelper: false
    });
    
    try {
      if (state.file.type === 'application/pdf') {
        try {
          const pageCount = await getPdfPageCount(state.file);
          if (pageCount > 1) {
            console.log(`Multipage PDF detected (${pageCount} pages), switching to page-by-page processing`);
            handleProcessPageByPage();
            return;
          }
        } catch (e) {
          console.warn('Error checking PDF page count:', e);
        }
      }

      if (state.useAutoClassification && !activeDocumentTypeId) {
        await handleClassifyDocument();
      } else if (activeDocumentTypeId) {
        const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
        if (docType) {
          await processWithDocType(docType);
        } else {
          throw new Error("Selected document type not found");
        }
      } else {
        toast({
          title: "No document type selected",
          description: "Please select a document type before processing.",
          variant: "destructive"
        });
        updateState({ isProcessing: false });
      }
    } catch (error) {
      console.error('Error processing document:', error);
      updateState({
        processError: `Error: ${(error as Error).message}`,
        isProcessing: false
      });
    }
  }, [state.file, state.useAutoClassification, activeDocumentTypeId, config.documentTypes, updateState, toast]);

  // Process document with specific document type
  const processWithDocType = useCallback(async (docType: any) => {
    try {
      updateState({
        processingStatus: 'Processing document...',
        processingProgress: 50
      });
      
      const selectedSubType = state.selectedSubTypeId 
        ? docType.subTypes?.find((subType: any) => subType.id === state.selectedSubTypeId)
        : docType.subTypes?.find((subType: any) => subType.isActive);
      
      const data = await processDocument(
        state.file!,
        {
          documentType: docType.name,
          subType: selectedSubType?.name,
          elementsToExtract: selectedSubType ? 
            selectedSubType.dataElements.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
              required: e.required
            })) :
            docType.dataElements.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
              required: e.required
            })),
          useIdAnalysis: selectedSubType?.awsAnalysisType === 'TEXTRACT_ANALYZE_ID'
        },
        false
      );
      
      updateState({
        documentData: data,
        activeTab: "extracted",
        isProcessing: false,
        isClassifying: false,
        processingProgress: 100
      });
      
      toast({
        title: "Document processed successfully",
        description: `Extracted ${data.extractedFields?.length || 0} fields${data.subType ? ` (${data.subType})` : ''}`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error in document processing:', error);
      updateState({
        processError: `Error: ${(error as Error).message}`,
        isProcessing: false,
        isClassifying: false
      });
    }
  }, [state.file, state.selectedSubTypeId, updateState, toast]);

  // Handle redaction
  const handleRedaction = useCallback(async () => {
    if (!state.file || !state.documentData) return;
    
    updateState({ isProcessing: true });
    
    try {
      let fileToRedact = state.file;
      
      if (state.file.type === "application/pdf" && state.imageUrl && state.imageUrl.startsWith('data:application/pdf;base64,')) {
        const base64Data = state.imageUrl.split(',')[1];
        fileToRedact = convertBase64ToFile(base64Data, state.file.name, 'application/pdf');
      }
      
      const redactedUrl = await redactDocument(
        fileToRedact,
        Array.from(state.fieldsToRedact),
        state.documentData
      );
      
      updateState({
        redactedImageUrl: redactedUrl,
        activeTab: "redacted",
        isProcessing: false
      });
    } catch (error) {
      console.error("Error redacting document:", error);
      updateState({
        processError: error instanceof Error ? error.message : "Failed to redact the document.",
        isProcessing: false
      });
    }
  }, [state.file, state.documentData, state.fieldsToRedact, state.imageUrl, updateState]);

  // Toggle field redaction
  const toggleFieldRedaction = useCallback((fieldId: string) => {
    const newFieldsToRedact = new Set(state.fieldsToRedact);
    if (newFieldsToRedact.has(fieldId)) {
      newFieldsToRedact.delete(fieldId);
    } else {
      newFieldsToRedact.add(fieldId);
    }
    updateState({ fieldsToRedact: newFieldsToRedact });
  }, [state.fieldsToRedact, updateState]);

  const handleDownload = useCallback(() => {
    if (!state.redactedImageUrl) return;

    const link = document.createElement("a");
    link.href = state.redactedImageUrl;
    link.download = `redacted-${state.file?.name || "document"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [state.redactedImageUrl, state.file?.name]);

  const resetWorkflow = useCallback(() => {
    updateState({
      file: null,
      imageUrl: null,
      documentData: null,
      redactedImageUrl: null,
      isUploading: false,
      isProcessing: false,
      activeTab: "original",
      fieldsToRedact: new Set(),
      uploadError: null,
      processError: null,
      extractedText: null,
      isExtractingText: false,
      isPdfJsLoading: false,
      pdfJsLoadError: null,
      pdfJsStatus: { loaded: false },
      isProcessingPageByPage: false,
      processingStatus: '',
      processingProgress: 0,
      extractedElements: [],
      selectedElements: [],
      showAwsHelper: false,
      pdfViewerError: null,
      useAutoClassification: true,
      isClassifying: false,
      classificationResult: null,
      verificationOpen: false,
      manualSelections: [],
      feedbackSubmitted: false,
      selectedSubTypeId: null,
      workflowStep: 'upload',
      useTextExtractionForClassification: false,
      isClassifyingWithGPT: false,
      gptClassificationResult: null,
      processingOptions: {
        identifyDataElements: false,
        redactElements: false,
        createSummary: false,
        saveDocument: {
          original: false,
          redacted: false
        }
      }
    });
  }, [updateState]);

  // Update handleProcessPageByPage to use the fetchConfiguredDataElements function
  const handleProcessPageByPage = useCallback(async () => {
    if (!state.file) return;
    
    try {
      updateState({
        isProcessingPageByPage: true,
        processingStatus: 'Starting page-by-page processing...',
        processingProgress: 0,
        processError: null,
        showAwsHelper: false
      });
      
      // Get configured data elements first - using async fetch method
      const configuredElements = await fetchConfiguredDataElements();
      
      // Process the PDF page by page
      const docData = await processDocument(
        state.file,
        {
          documentType: config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.name || '',
          subType: state.selectedSubTypeId ? 
            config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.subTypes?.find(st => st.id === state.selectedSubTypeId)?.name : undefined,
          elementsToExtract: configuredElements,
          onProgress: (status: string, progress: number, total: number) => {
            updateState({
              processingStatus: status,
              processingProgress: Math.floor((progress / total) * 100)
            });
          }
        } as unknown as ProcessingOptions,
        false
      );

      // Convert extracted fields to ExtendedRedactionElement format
      const extractedElements = docData.extractedFields?.map(field => ({
        id: field.id,
        text: field.value || '',
        value: field.value,
        confidence: field.confidence,
        boundingBox: field.boundingBox || null, // Ensure never undefined
        pageIndex: 0,
        label: field.label
      } as ExtendedRedactionElement)) || [];

      // Match extracted elements with configured elements
      const { matches, unmatchedExtracted, unmatchedConfigured } = matchDataElements(extractedElements, configuredElements);

      // Convert to RedactionElement[] to satisfy type constraints
      const redactionElements = [...matches, ...unmatchedExtracted, ...unmatchedConfigured].map(el => ({
        id: el.id,
        text: el.text,
        confidence: el.confidence,
        pageIndex: el.pageIndex,
        boundingBox: el.boundingBox || null // Ensure never undefined
      }));

      // Update state with all elements
      updateState({
        documentData: docData,
        extractedText: docData.extractedText || '',
        extractedElements: redactionElements,
        isProcessingPageByPage: false,
        processingStatus: 'Processing complete!',
        processingProgress: 100
      });
      
      toast({
        title: "Page-by-page processing complete",
        description: `Processed document successfully`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error in page-by-page processing:', error);
      
      // Check if this is an AWS configuration error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Missing required AWS configuration')) {
        updateState({
          processError: 'AWS credentials are not properly configured. Please check your .env.local file.',
          showAwsHelper: true
        });
      } else {
        updateState({
          processError: errorMessage,
          showAwsHelper: false
        });
      }
      
      // Reset progress
      updateState({
        processingProgress: 0,
        isProcessingPageByPage: false
      });
    }
  }, [state.file, activeDocumentTypeId, config.documentTypes, state.selectedSubTypeId, fetchConfiguredDataElements, matchDataElements, updateState, toast]);

  const handleClassifyDocument = useCallback(async () => {
    if (!state.file) return;
    
    updateState({
      isClassifying: true,
      classificationResult: null
    });
    
    try {
      const result = await classifyDocument(state.file);
      updateState({
        classificationResult: result,
        isClassifying: false
      });
      
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
            state.file.name,
            result,
            null,
            'auto'
          );
          
          // Try to auto-select a sub-type based on the document name if sub-types exist
          if (matchingDocType.subTypes && matchingDocType.subTypes.length > 0) {
            const fileName = state.file.name.toLowerCase();
            const potentialSubType = matchingDocType.subTypes.find(subType => 
              fileName.includes(subType.name.toLowerCase()) ||
              result.documentType.toLowerCase().includes(subType.name.toLowerCase())
            );
            
            if (potentialSubType) {
              console.log(`Auto-selected sub-type: ${potentialSubType.name}`);
              updateState({ selectedSubTypeId: potentialSubType.id });
            }
          }
          
          await processWithDocType(matchingDocType);
        } else {
          // Lower confidence - request verification
          updateState({ verificationOpen: true });
        }
      } else {
        // Document type not found in our configuration
        toast({
          title: "Unknown document type",
          description: `The document was classified as "${result.documentType}" which is not configured in the system.`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Classification error:", error);
      toast({
        title: "Classification failed",
        description: "Could not automatically classify document. Please select the document type manually.",
        variant: "destructive"
      });
      updateState({ isClassifying: false });
    }
  }, [state.file, config.documentTypes, setActiveDocumentType, updateState, toast, processWithDocType]);

  return {
    state,
    updateState,
    getConfiguredDataElements,
    handleFileUpload,
    handleProcessDocument,
    handleRedaction,
    toggleFieldRedaction,
    handleDownload,
    resetWorkflow,
    processWithDocType,
    handleProcessPageByPage,
    handleClassifyDocument
  };
} 