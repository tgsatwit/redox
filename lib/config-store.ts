import { create } from 'zustand'
import { persist, PersistOptions } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { 
  DocumentTypeConfig, 
  DataElementConfig,
  AppConfig,
  TrainingDataset,
  TrainingExample
} from './types'

// Default data elements
const defaultPIIElements: DataElementConfig[] = [
  {
    id: 'name',
    name: 'Name',
    type: 'Name',
    category: 'PII',
    action: 'ExtractAndRedact',
    description: 'Person name',
    isDefault: true
  },
  {
    id: 'email',
    name: 'Email Address',
    type: 'Email',
    category: 'PII',
    action: 'ExtractAndRedact',
    isDefault: true
  },
  {
    id: 'phone',
    name: 'Phone Number',
    type: 'Phone',
    category: 'PII',
    action: 'ExtractAndRedact',
    isDefault: true
  },
  {
    id: 'address',
    name: 'Address',
    type: 'Address',
    category: 'PII',
    action: 'ExtractAndRedact',
    isDefault: true
  },
]

const defaultFinancialElements: DataElementConfig[] = [
  {
    id: 'creditcard',
    name: 'Credit Card Number',
    type: 'CreditCard',
    category: 'Financial',
    action: 'ExtractAndRedact',
    isDefault: true
  },
  {
    id: 'bankaccount',
    name: 'Bank Account Number',
    type: 'Number',
    category: 'Financial',
    action: 'ExtractAndRedact',
    isDefault: true
  },
  {
    id: 'amount',
    name: 'Amount',
    type: 'Currency',
    category: 'Financial',
    action: 'Extract',
    isDefault: true
  }
]

// Default document types
const defaultDocumentTypes: DocumentTypeConfig[] = [
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Standard invoice document',
    isActive: true,
    dataElements: [
      ...defaultPIIElements,
      ...defaultFinancialElements,
      {
        id: 'invoiceNumber',
        name: 'Invoice Number',
        type: 'Text',
        category: 'General',
        action: 'Extract',
        isDefault: true
      },
      {
        id: 'date',
        name: 'Invoice Date',
        type: 'Date',
        category: 'General',
        action: 'Extract',
        isDefault: true
      },
      {
        id: 'dueDate',
        name: 'Due Date',
        type: 'Date',
        category: 'General',
        action: 'Extract',
        isDefault: true
      }
    ]
  },
  {
    id: 'receipt',
    name: 'Receipt',
    description: 'Purchase or transaction receipt',
    isActive: true,
    dataElements: [
      ...defaultPIIElements.filter(e => ['name', 'address'].includes(e.id)),
      {
        id: 'merchant',
        name: 'Merchant Name',
        type: 'Text',
        category: 'General',
        action: 'Extract',
        isDefault: true
      },
      {
        id: 'date',
        name: 'Transaction Date',
        type: 'Date',
        category: 'General',
        action: 'Extract',
        isDefault: true
      },
      {
        id: 'total',
        name: 'Total Amount',
        type: 'Currency',
        category: 'Financial',
        action: 'Extract',
        isDefault: true
      }
    ]
  },
  {
    id: 'id-document',
    name: 'ID Document',
    description: 'Identity documents such as driver license or passport',
    isActive: true,
    dataElements: [
      ...defaultPIIElements,
      {
        id: 'idNumber',
        name: 'ID Number',
        type: 'Text',
        category: 'PII',
        action: 'ExtractAndRedact',
        isDefault: true
      },
      {
        id: 'dateOfBirth',
        name: 'Date of Birth',
        type: 'Date',
        category: 'PII',
        action: 'ExtractAndRedact',
        isDefault: true
      },
      {
        id: 'expiryDate',
        name: 'Expiry Date',
        type: 'Date',
        category: 'General',
        action: 'Extract',
        isDefault: true
      }
    ]
  },
  {
    id: 'noa',
    name: 'Notice of Assessment',
    description: 'Australian Tax Notice of Assessment',
    isActive: true,
    dataElements: [
      ...defaultPIIElements,
      {
        id: 'tfn',
        name: 'TFN',
        type: 'Number',
        category: 'PII',
        action: 'ExtractAndRedact',
        isDefault: true
      }
    ]
  }
]

// Initialize app configuration
const initialConfig: AppConfig = {
  documentTypes: defaultDocumentTypes,
  defaultRedactionSettings: {
    redactPII: true,
    redactFinancial: true
  }
}

// Define the state type
type ConfigState = {
  config: AppConfig
  activeDocumentTypeId: string | null
  setActiveDocumentType: (id: string | null) => void
  addDocumentType: (documentType: Omit<DocumentTypeConfig, 'id'>) => void
  updateDocumentType: (id: string, updates: Partial<DocumentTypeConfig>) => void
  deleteDocumentType: (id: string) => void
  addDataElement: (documentTypeId: string, dataElement: Omit<DataElementConfig, 'id'>) => void
  updateDataElement: (documentTypeId: string, dataElementId: string, updates: Partial<DataElementConfig>) => void
  deleteDataElement: (documentTypeId: string, dataElementId: string) => void
  
  // Training dataset management
  addTrainingDataset: (documentTypeId: string, dataset: Omit<TrainingDataset, 'id'>) => void
  updateTrainingDataset: (documentTypeId: string, datasetId: string, updates: Partial<TrainingDataset>) => void
  deleteTrainingDataset: (documentTypeId: string, datasetId: string) => void
  
  // Training examples management
  addTrainingExample: (documentTypeId: string, datasetId: string, example: Omit<TrainingExample, 'id'>) => void
  updateTrainingExample: (documentTypeId: string, datasetId: string, exampleId: string, updates: Partial<TrainingExample>) => void
  deleteTrainingExample: (documentTypeId: string, datasetId: string, exampleId: string) => void
  
  // Model management
  updateModelStatus: (documentTypeId: string, datasetId: string, modelStatus: TrainingDataset['modelStatus'], modelId?: string, modelArn?: string) => void
  setDefaultModelForDocType: (documentTypeId: string, modelId: string) => void
  
  resetToDefaults: () => void
}

// Define persist configuration
type ConfigPersist = {
  name: string
}

// Create a store with persistence
export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: initialConfig,
      activeDocumentTypeId: initialConfig.documentTypes[0]?.id || null,
      
      setActiveDocumentType: (id) => set({ activeDocumentTypeId: id }),
      
      addDocumentType: (documentType) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: [
            ...state.config.documentTypes,
            {
              ...documentType,
              id: uuidv4()
            }
          ]
        }
      })),
      
      updateDocumentType: (id, updates) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === id ? { ...docType, ...updates } : docType
          )
        }
      })),
      
      deleteDocumentType: (id) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.filter(docType => docType.id !== id)
        },
        activeDocumentTypeId: state.activeDocumentTypeId === id ? (state.config.documentTypes[0]?.id || null) : state.activeDocumentTypeId
      })),
      
      addDataElement: (documentTypeId, dataElement) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  dataElements: [
                    ...docType.dataElements,
                    {
                      ...dataElement,
                      id: uuidv4()
                    }
                  ]
                } 
              : docType
          )
        }
      })),
      
      updateDataElement: (documentTypeId, dataElementId, updates) => set((state) => ({
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
        }
      })),
      
      deleteDataElement: (documentTypeId, dataElementId) => set((state) => ({
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
        }
      })),
      
      // Training dataset management
      addTrainingDataset: (documentTypeId, dataset) => set((state) => {
        const newDataset = {
          ...dataset,
          id: uuidv4(),
        };
        
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: [...(docType.trainingDatasets || []), newDataset],
              };
            }),
          },
        };
      }),
      
      updateTrainingDataset: (documentTypeId, datasetId, updates) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).map((dataset) => {
                  if (dataset.id !== datasetId) return dataset;
                  
                  return {
                    ...dataset,
                    ...updates,
                  };
                }),
              };
            }),
          },
        };
      }),
      
      deleteTrainingDataset: (documentTypeId, datasetId) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).filter(
                  (dataset) => dataset.id !== datasetId
                ),
                // If the default model was from this dataset, clear it
                defaultModelId: docType.defaultModelId && 
                               (docType.trainingDatasets || []).some(
                                 d => d.id === datasetId && d.modelId === docType.defaultModelId
                               ) ? undefined : docType.defaultModelId
              };
            }),
          },
        };
      }),
      
      // Training examples management
      addTrainingExample: (documentTypeId, datasetId, example) => set((state) => {
        const newExample = {
          ...example,
          id: uuidv4(),
        };
        
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).map((dataset) => {
                  if (dataset.id !== datasetId) return dataset;
                  
                  return {
                    ...dataset,
                    examples: [...dataset.examples, newExample],
                  };
                }),
              };
            }),
          },
        };
      }),
      
      updateTrainingExample: (documentTypeId, datasetId, exampleId, updates) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).map((dataset) => {
                  if (dataset.id !== datasetId) return dataset;
                  
                  return {
                    ...dataset,
                    examples: dataset.examples.map((example) => {
                      if (example.id !== exampleId) return example;
                      
                      return {
                        ...example,
                        ...updates,
                      };
                    }),
                  };
                }),
              };
            }),
          },
        };
      }),
      
      deleteTrainingExample: (documentTypeId, datasetId, exampleId) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).map((dataset) => {
                  if (dataset.id !== datasetId) return dataset;
                  
                  return {
                    ...dataset,
                    examples: dataset.examples.filter(
                      (example) => example.id !== exampleId
                    ),
                  };
                }),
              };
            }),
          },
        };
      }),
      
      // Model management
      updateModelStatus: (documentTypeId, datasetId, modelStatus, modelId, modelArn) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                trainingDatasets: (docType.trainingDatasets || []).map((dataset) => {
                  if (dataset.id !== datasetId) return dataset;
                  
                  return {
                    ...dataset,
                    modelStatus,
                    ...(modelId ? { modelId } : {}),
                    ...(modelArn ? { modelArn } : {}),
                    ...(modelStatus === 'TRAINED' ? { lastTrainedDate: Date.now() } : {}),
                  };
                }),
              };
            }),
          },
        };
      }),
      
      setDefaultModelForDocType: (documentTypeId, modelId) => set((state) => {
        return {
          config: {
            ...state.config,
            documentTypes: state.config.documentTypes.map((docType) => {
              if (docType.id !== documentTypeId) return docType;
              
              return {
                ...docType,
                defaultModelId: modelId,
              };
            }),
          },
        };
      }),
      
      resetToDefaults: () => set({ config: initialConfig })
    }),
    {
      name: 'document-processor-config',
    } as PersistOptions<ConfigState, unknown>
  )
) 