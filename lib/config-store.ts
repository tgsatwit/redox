import { create } from 'zustand'
import { persist, PersistOptions } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { 
  DocumentTypeConfig, 
  DataElementConfig,
  AppConfig,
  TrainingDataset,
  TrainingExample,
  DocumentSubTypeConfig,
  RetentionPolicy
} from './types'

// Initialize app configuration with empty arrays instead of mock data
const initialConfig: AppConfig = {
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
  config: AppConfig
  activeDocumentTypeId: string | null
  setActiveDocumentType: (id: string | null) => void
  addDocumentType: (documentType: Omit<DocumentTypeConfig, 'id'>) => void
  updateDocumentType: (id: string, updates: Partial<DocumentTypeConfig>) => void
  deleteDocumentType: (id: string) => void
  addDataElement: (documentTypeId: string, dataElement: Omit<DataElementConfig, 'id'>) => void
  updateDataElement: (documentTypeId: string, dataElementId: string, updates: Partial<DataElementConfig>) => void
  deleteDataElement: (documentTypeId: string, dataElementId: string) => void
  
  // Sub-type management
  addSubType: (documentTypeId: string, subType: Omit<DocumentSubTypeConfig, 'id'>) => void
  updateSubType: (documentTypeId: string, subTypeId: string, updates: Partial<DocumentSubTypeConfig>) => void
  deleteSubType: (documentTypeId: string, subTypeId: string) => void
  
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
  
  // Retention policy management
  addRetentionPolicy: (policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRetentionPolicy: (id: string, updates: Partial<Omit<RetentionPolicy, 'id' | 'createdAt'>>) => void
  deleteRetentionPolicy: (id: string) => void
  
  resetToDefaults: () => void
}

// Define persist configuration
type ConfigPersist = {
  name: string
}

// Create a store with persistence
export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
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
                  dataElements: dataElement.subTypeId 
                    ? docType.dataElements // Don't add to document type if it's a sub-type element
                    : [...docType.dataElements, { ...dataElement, id: uuidv4() }],
                  subTypes: dataElement.subTypeId 
                    ? docType.subTypes?.map(subType =>
                        subType.id === dataElement.subTypeId
                          ? {
                              ...subType,
                              dataElements: [...(subType.dataElements || []), { ...dataElement, id: uuidv4() }]
                            }
                          : subType
                      )
                    : docType.subTypes
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
                  ),
                  subTypes: docType.subTypes?.map(subType => ({
                    ...subType,
                    dataElements: subType.dataElements.map(element =>
                      element.id === dataElementId ? { ...element, ...updates } : element
                    )
                  }))
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
                  dataElements: docType.dataElements.filter(element => element.id !== dataElementId),
                  subTypes: docType.subTypes?.map(subType => ({
                    ...subType,
                    dataElements: subType.dataElements.filter(element => element.id !== dataElementId)
                  }))
                } 
              : docType
          )
        }
      })),
      
      // Sub-type management
      addSubType: (documentTypeId, subType) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  subTypes: [
                    ...(docType.subTypes || []),
                    {
                      ...subType as Omit<DocumentSubTypeConfig, 'id'>,
                      id: uuidv4()
                    }
                  ]
                } 
              : docType
          )
        }
      })),
      
      updateSubType: (documentTypeId, subTypeId, updates) => set((state) => ({
        config: {
          ...state.config,
          documentTypes: state.config.documentTypes.map(docType => 
            docType.id === documentTypeId 
              ? { 
                  ...docType, 
                  subTypes: docType.subTypes?.map(subType => 
                    subType.id === subTypeId ? { ...subType, ...updates as Partial<DocumentSubTypeConfig> } : subType
                  )
                } 
              : docType
          )
        }
      })),
      
      deleteSubType: (documentTypeId, subTypeId) => set((state) => ({
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
      
      // Retention policy management
      addRetentionPolicy: (policy) => set((state) => ({
        config: {
          ...state.config,
          retentionPolicies: [
            ...(state.config.retentionPolicies || []),
            {
              ...policy,
              id: uuidv4(),
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ]
        }
      })),

      updateRetentionPolicy: (id, updates) => set((state) => ({
        config: {
          ...state.config,
          retentionPolicies: (state.config.retentionPolicies || []).map(policy =>
            policy.id === id
              ? { ...policy, ...updates, updatedAt: Date.now() }
              : policy
          )
        }
      })),

      deleteRetentionPolicy: (id) => set((state) => ({
        config: {
          ...state.config,
          retentionPolicies: (state.config.retentionPolicies || []).filter(policy => policy.id !== id)
        }
      })),
      
      resetToDefaults: () => set({ config: initialConfig })
    }),
    {
      name: 'document-processor-config',
    } as PersistOptions<ConfigState, unknown>
  )
) 