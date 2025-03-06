import { useState, useCallback } from 'react';
import { useConfigStoreDB } from "@/lib/config-store-db";
import { classifyDocument, submitClassificationFeedback } from "@/lib/document-processing";
import { useToast } from "@/components/ui/use-toast";
import { ClassificationResult } from '@/lib/types';

interface ClassificationState {
  isClassifying: boolean;
  classificationResult: ClassificationResult | null;
  verificationOpen: boolean;
  feedbackSubmitted: boolean;
  selectedSubTypeId: string | null;
  useAutoClassification: boolean;
  isClassifyingWithGPT: boolean;
  gptClassificationResult: {
    documentType: string | null;
    subType: string | null;
    confidence: number;
    reasoning: string;
  } | null;
}

export function useDocumentClassification() {
  const { config, activeDocumentTypeId, setActiveDocumentType } = useConfigStoreDB();
  const { toast } = useToast();
  
  const [state, setState] = useState<ClassificationState>({
    isClassifying: false,
    classificationResult: null,
    verificationOpen: false,
    feedbackSubmitted: false,
    selectedSubTypeId: null,
    useAutoClassification: true,
    isClassifyingWithGPT: false,
    gptClassificationResult: null
  });

  const updateState = useCallback((updates: Partial<ClassificationState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleClassifyDocument = useCallback(async (file: File) => {
    if (!file) return null;
    
    updateState({
      isClassifying: true,
      classificationResult: null
    });
    
    try {
      const result = await classifyDocument(file);
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
            file.name,
            result,
            null,
            'auto'
          );
          
          // Try to auto-select a sub-type based on the document name if sub-types exist
          if (matchingDocType.subTypes && matchingDocType.subTypes.length > 0) {
            const fileName = file.name.toLowerCase();
            const potentialSubType = matchingDocType.subTypes.find(subType => 
              fileName.includes(subType.name.toLowerCase()) ||
              result.documentType.toLowerCase().includes(subType.name.toLowerCase())
            );
            
            if (potentialSubType) {
              console.log(`Auto-selected sub-type: ${potentialSubType.name}`);
              updateState({ selectedSubTypeId: potentialSubType.id });
            }
          }
          
          return matchingDocType;
        } else {
          // Lower confidence - request verification
          updateState({ verificationOpen: true });
          return null;
        }
      } else {
        // Document type not found in our configuration
        toast({
          title: "Unknown document type",
          description: `The document was classified as "${result.documentType}" which is not configured in the system.`,
          variant: "destructive"
        });
        return null;
      }
    } catch (error) {
      console.error("Classification error:", error);
      toast({
        title: "Classification failed",
        description: "Could not automatically classify document. Please select the document type manually.",
        variant: "destructive"
      });
      updateState({ isClassifying: false });
      return null;
    }
  }, [config.documentTypes, setActiveDocumentType, updateState, toast]);

  const handleVerification = useCallback(async (verified: boolean, correctedTypeId?: string, file?: File) => {
    if (!file || !state.classificationResult) return null;
    
    try {
      // Get the correct document type
      let docTypeId = verified ? 
        // Find the matching doc type ID if verified
        config.documentTypes.find(dt => dt.name.toLowerCase() === state.classificationResult!.documentType.toLowerCase())?.id : 
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
        file.name,
        state.classificationResult,
        verified ? null : docType.name,
        'manual',
        state.selectedSubTypeId ? docType.subTypes?.find(st => st.id === state.selectedSubTypeId)?.name || null : null
      );
      
      updateState({ verificationOpen: false });
      return docType;
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify document type",
        variant: "destructive"
      });
      return null;
    }
  }, [config.documentTypes, setActiveDocumentType, state.classificationResult, state.selectedSubTypeId, updateState, toast]);

  // Reset classification state and active document type
  const resetClassification = useCallback(() => {
    updateState({
      isClassifying: false,
      classificationResult: null,
      verificationOpen: false,
      feedbackSubmitted: false,
      selectedSubTypeId: null,
      isClassifyingWithGPT: false,
      gptClassificationResult: null
    });
    
    // Reset active document type
    setActiveDocumentType(null);
  }, [updateState, setActiveDocumentType]);

  return {
    state,
    updateState,
    handleClassifyDocument,
    handleVerification,
    resetClassification
  };
} 