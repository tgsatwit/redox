import { useState, useCallback } from 'react';
import { useConfigStoreDB } from "@/lib/config-store-db";
import { processDocument, classifyDocument, submitClassificationFeedback } from "@/lib/document-processing";
import { redactDocument } from "@/lib/redaction";
import { convertPdfToBase64 } from "@/lib/pdf-utils";
import { ensurePdfJsLoaded, reloadPdfJs } from "@/lib/pdf-preloader";
import { DocumentProcessorState, ExtendedRedactionElement, ProcessingOptions, UseDocumentProcessorReturn, ProcessingResult } from '../types';
import { useToast } from "@/components/ui/use-toast";
import { getPdfPageCount, convertBase64ToFile } from '../utils/document-utils';

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
      extractSpecificElements: false,
      redactElements: false,
      createSummary: false
    }
  });

  // Helper function to update state
  const updateState = useCallback((updates: Partial<DocumentProcessorState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Get configured data elements
  const getConfiguredDataElements = useCallback(() => {
    if (!activeDocumentTypeId) return [];
    
    const docType = config.documentTypes.find(dt => dt.id === activeDocumentTypeId);
    if (!docType) return [];
    
    if (state.selectedSubTypeId) {
      const subType = docType.subTypes?.find(st => st.id === state.selectedSubTypeId);
      if (subType) {
        return subType.dataElements;
      }
    }
    
    return docType.dataElements;
  }, [activeDocumentTypeId, config.documentTypes, state.selectedSubTypeId]);

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
        extractSpecificElements: false,
        redactElements: false,
        createSummary: false
      }
    });
  }, [updateState]);

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
      
      // Process the PDF page by page
      const docData = await processDocument(
        state.file,
        {
          documentType: config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.name || '',
          subType: state.selectedSubTypeId ? 
            config.documentTypes.find(dt => dt.id === activeDocumentTypeId)?.subTypes?.find(st => st.id === state.selectedSubTypeId)?.name : undefined,
          elementsToExtract: getConfiguredDataElements(),
          onProgress: (status: string, progress: number, total: number) => {
            updateState({
              processingStatus: status,
              processingProgress: Math.floor((progress / total) * 100)
            });
          }
        } as ProcessingOptions,
        false
      );

      const result: ProcessingResult = {
        success: true,
        documentData: docData,
        extractedFields: docData.extractedFields?.map(field => ({
          id: field.id,
          value: field.value || '',
          confidence: field.confidence,
          boundingBox: field.boundingBox || null
        }))
      };
      
      // Update state with the extracted text and elements
      updateState({
        documentData: result.documentData,
        extractedText: result.documentData.extractedText || '',
        extractedElements: result.extractedFields?.map(field => ({
          id: field.id,
          text: field.value,
          confidence: field.confidence,
          pageIndex: 0,
          boundingBox: field.boundingBox
        })) || [],
        isProcessingPageByPage: false,
        processingStatus: 'Processing complete!',
        processingProgress: 100
      });
      
      toast({
        title: "Page-by-page processing complete",
        description: `Processed ${result.totalPages || 0} pages successfully`,
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
  }, [state.file, activeDocumentTypeId, config.documentTypes, state.selectedSubTypeId, getConfiguredDataElements, updateState, toast]);

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