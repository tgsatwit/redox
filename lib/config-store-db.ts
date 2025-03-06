import { create } from 'zustand'
import { AppConfig, DocumentTypeConfig, DataElementConfig, DocumentSubTypeConfig, TrainingDataset, TrainingExample, PromptCategory, Prompt } from './types'
import { createId } from '@paralleldrive/cuid2'

// Initialize default data elements - using empty arrays
const defaultPIIElements: DataElementConfig[] = []
const defaultFinancialElements: DataElementConfig[] = []

// Default document types - using empty array
const defaultDocumentTypes: DocumentTypeConfig[] = []

// Initialize app configuration with empty arrays
export const initialConfig: AppConfig = {
  documentTypes: [],
  defaultRedactionSettings: {
    redactPII: true,
    redactFinancial: true
  },
  retentionPolicies: [],
  promptCategories: []
}

// Define the state type
type ConfigState = {
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  config: AppConfig
  activeDocumentTypeId: string | null
  
  // Initialization method
  initialize: () => Promise<void>
  
  // Basic state management
  setActiveDocumentType: (id: string | null) => void
  
  // Document type management
  addDocumentType: (documentType: Omit<DocumentTypeConfig, 'id'>) => Promise<DocumentTypeConfig>
  updateDocumentType: (id: string, updates: Partial<DocumentTypeConfig>) => Promise<void>
  deleteDocumentType: (id: string) => Promise<void>
  
  // Data element management
  addDataElement: (documentTypeId: string, dataElement: Omit<DataElementConfig, 'id'>) => Promise<DataElementConfig>
  updateDataElement: (documentTypeId: string, dataElementId: string, updates: Partial<DataElementConfig>) => Promise<void>
  deleteDataElement: (documentTypeId: string, dataElementId: string) => Promise<void>
  
  // Sub-type management
  addSubType: (documentTypeId: string, subType: Omit<DocumentSubTypeConfig, 'id'>) => Promise<DocumentSubTypeConfig>
  updateSubType: (documentTypeId: string, subTypeId: string, updates: Partial<DocumentSubTypeConfig>) => Promise<void>
  deleteSubType: (documentTypeId: string, subTypeId: string) => Promise<void>
  
  // Training dataset management
  addTrainingDataset: (documentTypeId: string, dataset: Omit<TrainingDataset, 'id'>) => Promise<TrainingDataset>
  updateTrainingDataset: (documentTypeId: string, datasetId: string, updates: Partial<TrainingDataset>) => Promise<void>
  deleteTrainingDataset: (documentTypeId: string, datasetId: string) => Promise<void>
  
  // Training examples management
  addTrainingExample: (documentTypeId: string, datasetId: string, example: Omit<TrainingExample, 'id'>) => Promise<TrainingExample>
  updateTrainingExample: (documentTypeId: string, datasetId: string, exampleId: string, updates: Partial<TrainingExample>) => Promise<void>
  deleteTrainingExample: (documentTypeId: string, datasetId: string, exampleId: string) => Promise<void>
  
  // Model management
  updateModelStatus: (documentTypeId: string, datasetId: string, modelStatus: TrainingDataset['modelStatus'], modelId?: string, modelArn?: string) => Promise<void>
  setDefaultModelForDocType: (documentTypeId: string, modelId: string) => Promise<void>
  
  resetToDefaults: () => Promise<void>

  // Prompt management
  addPromptCategory: (category: Omit<PromptCategory, 'id' | 'prompts'>) => Promise<PromptCategory>
  updatePromptCategory: (id: string, updates: Partial<Omit<PromptCategory, 'id' | 'prompts'>>) => Promise<void>
  deletePromptCategory: (id: string) => Promise<void>
  
  addPrompt: (categoryId: string, prompt: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Prompt>
  updatePrompt: (categoryId: string, promptId: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt'>>) => Promise<void>
  deletePrompt: (categoryId: string, promptId: string) => Promise<void>
}

// Create a store with API interaction instead of local persistence
export const useConfigStoreDB = create<ConfigState>()((set, get) => ({
  isLoading: false,
  isInitialized: false,
  error: null,
  config: initialConfig,
  activeDocumentTypeId: null,
  
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });
      
      // Instead of loading from a centralized config, load document types directly
      const docTypesResponse = await fetch('/api/document-types');
      
      if (!docTypesResponse.ok) {
        throw new Error(`HTTP error ${docTypesResponse.status}`);
      }
      
      const documentTypes = await docTypesResponse.json();
      
      // For each document type, load its sub-types and data elements
      for (const docType of documentTypes) {
        // Load sub-types for this document type
        const subTypesResponse = await fetch(`/api/document-types/${docType.id}/sub-types`);
        if (subTypesResponse.ok) {
          docType.subTypes = await subTypesResponse.json();
        } else {
          console.warn(`Failed to load sub-types for document type ${docType.id}`);
          docType.subTypes = [];
        }
        
        // Load data elements for this document type
        const elementsResponse = await fetch(`/api/document-types/${docType.id}/elements`);
        if (elementsResponse.ok) {
          docType.dataElements = await elementsResponse.json();
        } else {
          console.warn(`Failed to load elements for document type ${docType.id}`);
          docType.dataElements = [];
        }
        
        // For each sub-type, load its data elements
        if (docType.subTypes && docType.subTypes.length > 0) {
          for (const subType of docType.subTypes) {
            const subTypeElementsResponse = await fetch(`/api/document-types/${docType.id}/sub-types/${subType.id}/elements`);
            if (subTypeElementsResponse.ok) {
              subType.dataElements = await subTypeElementsResponse.json();
            } else {
              console.warn(`Failed to load elements for sub-type ${subType.id}`);
              subType.dataElements = [];
            }
          }
        }
      }
      
      // Create a simple app config with just the document types and default settings
      const appConfig = {
        documentTypes,
        defaultRedactionSettings: {
          redactPII: true,
          redactFinancial: true
        },
        retentionPolicies: [],
        promptCategories: []
      };
      
      // Load retention policies
      try {
        const retentionPoliciesResponse = await fetch('/api/retention-policies');
        if (retentionPoliciesResponse.ok) {
          appConfig.retentionPolicies = await retentionPoliciesResponse.json();
        } else {
          console.warn('Failed to load retention policies');
        }
      } catch (error) {
        console.error('Error loading retention policies:', error);
      }
      
      // Load prompt categories
      try {
        console.log('Loading prompt categories...');
        const promptCategoriesResponse = await fetch('/api/config/prompt-categories');
        if (promptCategoriesResponse.ok) {
          appConfig.promptCategories = await promptCategoriesResponse.json();
          console.log('Loaded prompt categories:', appConfig.promptCategories);
        } else {
          console.warn('Failed to load prompt categories');
        }
      } catch (error) {
        console.error('Error loading prompt categories:', error);
      }
      
      set({
        config: appConfig,
        activeDocumentTypeId: null,
        isInitialized: true,
        isLoading: false
      });
    } catch (error: any) {
      console.error('Error initializing config:', error);
      set({ 
        error: error.message || 'Failed to initialize configuration',
        isLoading: false 
      });
    }
  },
  
  setActiveDocumentType: (id) => set({ activeDocumentTypeId: id }),
  
  addDocumentType: async (documentType) => {
    try {
      set({ isLoading: true, error: null });
      
      // Create document type via API
      const response = await fetch('/api/config/document-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(documentType)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newDocType = await response.json() as DocumentTypeConfig;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: [...state.config.documentTypes, newDocType]
        },
        isLoading: false
      }));
      
      return newDocType;
    } catch (error: any) {
      console.error('Error adding document type:', error);
      set({ 
        error: error.message || 'Failed to add document type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateDocumentType: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update document type via API
      const response = await fetch(`/api/config/document-types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const updatedDocType = await response.json() as DocumentTypeConfig;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === id ? updatedDocType : docType
          )
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating document type ${id}:`, error);
      set({ 
        error: error.message || 'Failed to update document type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteDocumentType: async (id) => {
    try {
      set({ isLoading: true, error: null });
      
      // Delete document type via API
      const response = await fetch(`/api/config/document-types/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => {
        const newDocTypes = state.config.documentTypes.filter(docType => docType.id !== id);
        const newActiveDocType = state.activeDocumentTypeId === id 
          ? (newDocTypes[0]?.id || null) 
          : state.activeDocumentTypeId;
        
        return {
          config: {
            ...state.config,
            documentTypes: newDocTypes
          },
          activeDocumentTypeId: newActiveDocType,
          isLoading: false
        };
      });
    } catch (error: any) {
      console.error(`Error deleting document type ${id}:`, error);
      set({ 
        error: error.message || 'Failed to delete document type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  addDataElement: async (documentTypeId, dataElement) => {
    try {
      set({ isLoading: true, error: null });
      
      // Create data element via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/elements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataElement)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newElement = await response.json() as DataElementConfig;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  dataElements: [...docType.dataElements, newElement]
                } 
              : docType
          )
        },
        isLoading: false
      }));
      
      return newElement;
    } catch (error: any) {
      console.error(`Error adding data element to document type ${documentTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to add data element',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateDataElement: async (documentTypeId, dataElementId, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update data element via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/elements/${dataElementId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  dataElements: docType.dataElements.map(element => 
                    element.id === dataElementId ? { ...element, ...updates } : element
                  )
                } 
              : docType
          )
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating data element ${dataElementId}:`, error);
      set({ 
        error: error.message || 'Failed to update data element',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteDataElement: async (documentTypeId, dataElementId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Delete data element via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/elements/${dataElementId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  dataElements: docType.dataElements.filter(element => element.id !== dataElementId)
                } 
              : docType
          )
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting data element ${dataElementId}:`, error);
      set({ 
        error: error.message || 'Failed to delete data element',
        isLoading: false 
      });
      throw error;
    }
  },
  
  addSubType: async (documentTypeId, subType) => {
    try {
      set({ isLoading: true, error: null });
      
      // Create sub-type via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/sub-types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subType)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newSubType = await response.json() as DocumentSubTypeConfig;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  subTypes: [
                    ...(docType.subTypes || []),
                    newSubType
                  ]
                } 
              : docType
          )
        },
        isLoading: false
      }));
      
      return newSubType;
    } catch (error: any) {
      console.error(`Error adding sub-type to document type ${documentTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to add sub-type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateSubType: async (documentTypeId, subTypeId, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update sub-type via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/sub-types/${subTypeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  subTypes: docType.subTypes?.map(subType => 
                    subType.id === subTypeId ? { ...subType, ...updates } : subType
                  )
                } 
              : docType
          )
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating sub-type ${subTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to update sub-type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteSubType: async (documentTypeId, subTypeId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Delete sub-type via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/sub-types/${subTypeId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  subTypes: docType.subTypes?.filter(subType => subType.id !== subTypeId)
                } 
              : docType
          )
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting sub-type ${subTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to delete sub-type',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Training dataset management
  addTrainingDataset: async (documentTypeId, dataset) => {
    try {
      set({ isLoading: true, error: null });
      
      // Create training dataset via API (assuming you have an API endpoint for this)
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataset)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newDataset = await response.json() as TrainingDataset;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: [...(docType.trainingDatasets || []), newDataset]
            };
          })
        },
        isLoading: false
      }));
      
      return newDataset;
    } catch (error: any) {
      console.error(`Error adding training dataset to document type ${documentTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to add training dataset',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateTrainingDataset: async (documentTypeId, datasetId, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update training dataset via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).map(dataset => {
                if (dataset.id !== datasetId) return dataset;
                
                return {
                  ...dataset,
                  ...updates
                };
              })
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating training dataset ${datasetId}:`, error);
      set({ 
        error: error.message || 'Failed to update training dataset',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteTrainingDataset: async (documentTypeId, datasetId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Delete training dataset via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            const isDefaultModelFromThisDataset = docType.defaultModelId && 
              (docType.trainingDatasets || []).some(
                d => d.id === datasetId && d.modelId === docType.defaultModelId
              );
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).filter(
                dataset => dataset.id !== datasetId
              ),
              // If the default model was from this dataset, clear it
              defaultModelId: isDefaultModelFromThisDataset ? undefined : docType.defaultModelId
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting training dataset ${datasetId}:`, error);
      set({ 
        error: error.message || 'Failed to delete training dataset',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Training examples management
  addTrainingExample: async (documentTypeId, datasetId, example) => {
    try {
      set({ isLoading: true, error: null });
      
      // Create training example via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}/examples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(example)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newExample = await response.json() as TrainingExample;
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).map(dataset => {
                if (dataset.id !== datasetId) return dataset;
                
                return {
                  ...dataset,
                  examples: [...dataset.examples, newExample]
                };
              })
            };
          })
        },
        isLoading: false
      }));
      
      return newExample;
    } catch (error: any) {
      console.error(`Error adding training example to dataset ${datasetId}:`, error);
      set({ 
        error: error.message || 'Failed to add training example',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateTrainingExample: async (documentTypeId, datasetId, exampleId, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update training example via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}/examples/${exampleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).map(dataset => {
                if (dataset.id !== datasetId) return dataset;
                
                return {
                  ...dataset,
                  examples: dataset.examples.map(example => {
                    if (example.id !== exampleId) return example;
                    
                    return {
                      ...example,
                      ...updates
                    };
                  })
                };
              })
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating training example ${exampleId}:`, error);
      set({ 
        error: error.message || 'Failed to update training example',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteTrainingExample: async (documentTypeId, datasetId, exampleId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Delete training example via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}/examples/${exampleId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).map(dataset => {
                if (dataset.id !== datasetId) return dataset;
                
                return {
                  ...dataset,
                  examples: dataset.examples.filter(
                    example => example.id !== exampleId
                  )
                };
              })
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting training example ${exampleId}:`, error);
      set({ 
        error: error.message || 'Failed to delete training example',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Model management
  updateModelStatus: async (documentTypeId, datasetId, modelStatus, modelId, modelArn) => {
    try {
      set({ isLoading: true, error: null });
      
      // Update model status via API (assuming you have an endpoint for this)
      const response = await fetch(`/api/config/document-types/${documentTypeId}/datasets/${datasetId}/model-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          modelStatus,
          modelId,
          modelArn
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              trainingDatasets: (docType.trainingDatasets || []).map(dataset => {
                if (dataset.id !== datasetId) return dataset;
                
                return {
                  ...dataset,
                  modelStatus,
                  ...(modelId ? { modelId } : {}),
                  ...(modelArn ? { modelArn } : {}),
                  ...(modelStatus === 'TRAINED' ? { lastTrainedDate: Date.now() } : {})
                };
              })
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating model status for dataset ${datasetId}:`, error);
      set({ 
        error: error.message || 'Failed to update model status',
        isLoading: false 
      });
      throw error;
    }
  },
  
  setDefaultModelForDocType: async (documentTypeId, modelId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Set default model via API
      const response = await fetch(`/api/config/document-types/${documentTypeId}/default-model`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modelId })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update local state
      set(state => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => {
            if (docType.id !== documentTypeId) return docType;
            
            return {
              ...docType,
              defaultModelId: modelId
            };
          })
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error setting default model for document type ${documentTypeId}:`, error);
      set({ 
        error: error.message || 'Failed to set default model',
        isLoading: false 
      });
      throw error;
    }
  },
  
  resetToDefaults: async () => {
    try {
      set({ isLoading: true, error: null });
      
      // Reset to defaults via API
      const response = await fetch('/api/config/reset', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Refetch the config
      const configResponse = await fetch('/api/config');
      if (!configResponse.ok) {
        throw new Error(`HTTP error ${configResponse.status}`);
      }
      
      const appConfig = await configResponse.json() as AppConfig;
      
      // Update local state
      set({
        config: appConfig,
        activeDocumentTypeId: null,
        isLoading: false
      });
    } catch (error: any) {
      console.error('Error resetting configuration to defaults:', error);
      set({ 
        error: error.message || 'Failed to reset configuration',
        isLoading: false 
      });
      throw error;
    }
  },

  // Prompt management
  addPromptCategory: async (category) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch('/api/config/prompt-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(category)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newCategory = await response.json();
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: [...(state.config.promptCategories || []), newCategory]
        },
        isLoading: false
      }));
      
      return newCategory;
    } catch (error: any) {
      console.error('Error adding prompt category:', error);
      set({ 
        error: error.message || 'Failed to add prompt category',
        isLoading: false 
      });
      throw error;
    }
  },

  updatePromptCategory: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch(`/api/config/prompt-categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: state.config.promptCategories?.map(cat => 
            cat.id === id ? { ...cat, ...updates } : cat
          ) || []
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating prompt category ${id}:`, error);
      set({ 
        error: error.message || 'Failed to update prompt category',
        isLoading: false 
      });
      throw error;
    }
  },

  deletePromptCategory: async (id) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch(`/api/config/prompt-categories/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: state.config.promptCategories?.filter(cat => cat.id !== id) || []
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting prompt category ${id}:`, error);
      set({ 
        error: error.message || 'Failed to delete prompt category',
        isLoading: false 
      });
      throw error;
    }
  },

  addPrompt: async (categoryId, prompt) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch(`/api/config/prompt-categories/${categoryId}/prompts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(prompt)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const newPrompt = await response.json();
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: state.config.promptCategories?.map(cat => 
            cat.id === categoryId 
              ? { ...cat, prompts: [...cat.prompts, newPrompt] }
              : cat
          ) || []
        },
        isLoading: false
      }));
      
      return newPrompt;
    } catch (error: any) {
      console.error('Error adding prompt:', error);
      set({ 
        error: error.message || 'Failed to add prompt',
        isLoading: false 
      });
      throw error;
    }
  },

  updatePrompt: async (categoryId, promptId, updates) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch(`/api/config/prompt-categories/${categoryId}/prompts/${promptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: state.config.promptCategories?.map(cat => 
            cat.id === categoryId 
              ? {
                  ...cat,
                  prompts: cat.prompts.map(prompt =>
                    prompt.id === promptId ? { ...prompt, ...updates } : prompt
                  )
                }
              : cat
          ) || []
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error updating prompt ${promptId}:`, error);
      set({ 
        error: error.message || 'Failed to update prompt',
        isLoading: false 
      });
      throw error;
    }
  },

  deletePrompt: async (categoryId, promptId) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await fetch(`/api/config/prompt-categories/${categoryId}/prompts/${promptId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      set(state => ({
        config: {
          ...state.config,
          promptCategories: state.config.promptCategories?.map(cat => 
            cat.id === categoryId 
              ? {
                  ...cat,
                  prompts: cat.prompts.filter(prompt => prompt.id !== promptId)
                }
              : cat
          ) || []
        },
        isLoading: false
      }));
    } catch (error: any) {
      console.error(`Error deleting prompt ${promptId}:`, error);
      set({ 
        error: error.message || 'Failed to delete prompt',
        isLoading: false 
      });
      throw error;
    }
  },
})) 