import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  QueryCommand, 
  UpdateCommand, 
  DeleteCommand,
  ScanCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { createId } from '@paralleldrive/cuid2';
import { 
  AppConfig, 
  DocumentTypeConfig, 
  DataElementConfig, 
  DocumentSubTypeConfig,
  TrainingDataset,
  TrainingExample,
  RetentionPolicy,
  PromptCategory,
  Prompt
} from '../types';
import { initialConfig } from '../config-store-db';

// Constants
const CONFIG_TABLE = process.env.DYNAMODB_CONFIG_TABLE || 'document-processor-config';
const DOC_TYPE_TABLE = process.env.DYNAMODB_DOCTYPE_TABLE || 'document-processor-doctypes';
const SUB_TYPE_TABLE = process.env.DYNAMODB_SUBTYPE_TABLE || 'document-processor-subtypes';
const DATA_ELEMENT_TABLE = process.env.DYNAMODB_ELEMENT_TABLE || 'document-processor-elements';
const TRAINING_DATASET_TABLE = process.env.DYNAMODB_DATASET_TABLE || 'document-processor-datasets';
const TRAINING_EXAMPLE_TABLE = process.env.DYNAMODB_EXAMPLE_TABLE || 'document-processor-examples';
const RETENTION_POLICY_TABLE = process.env.DYNAMODB_RETENTION_POLICY_TABLE || 'document-processor-retention-policies';
const PROMPT_CATEGORIES_TABLE = process.env.DYNAMODB_PROMPT_CATEGORIES_TABLE || 'document-processor-prompt-categories';
const PROMPTS_TABLE = process.env.DYNAMODB_PROMPTS_TABLE || 'document-processor-prompts';

// Local storage keys
const LS_CONFIG_KEY = 'document-processor-config';
const LS_DOC_TYPES_KEY = 'document-processor-doctypes';
const LS_SUB_TYPES_KEY = 'document-processor-subtypes';
const LS_DATA_ELEMENTS_KEY = 'document-processor-elements';
const LS_TRAINING_DATASETS_KEY = 'document-processor-datasets';
const LS_TRAINING_EXAMPLES_KEY = 'document-processor-examples';
const LS_RETENTION_POLICIES_KEY = 'document-processor-retention-policies';
const LS_PROMPT_CATEGORIES_KEY = 'document-processor-prompt-categories';
const LS_PROMPTS_KEY = 'document-processor-prompts';

// Server-side storage for fallback
const serverStorage: Record<string, any> = {};

// Default configuration for local storage
const defaultAppConfig = initialConfig;

// Get DynamoDB configuration
const getDynamoDBConfig = () => {
  const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  
  console.log('AWS Credentials:', {
    region: process.env.APP_REGION,
    accessKeyId: process.env.APP_ACCESS_KEY_ID ? 'Set' : 'Not set',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY ? 'Set' : 'Not set'
  });
  
  if (localEndpoint) {
    console.log('Using local DynamoDB endpoint:', localEndpoint);
    return {
      region: 'local',
      endpoint: localEndpoint,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
      }
    };
  }
  
  console.log('Using AWS DynamoDB in region:', process.env.APP_REGION || 'us-east-1');
  return {
    region: process.env.APP_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
    }
  };
};

// Create DynamoDB clients
const dynamoClient = new DynamoDBClient(getDynamoDBConfig());
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Helper to check if the error is a permission error
const isPermissionError = (error: any): boolean => {
  // Check for AccessDeniedException or ResourceNotFoundException
  console.log('DynamoDB Error:', error);
  if (error?.$metadata?.httpStatusCode === 400 || error?.$metadata?.httpStatusCode === 403) {
    const errorType = error?.__type || '';
    return errorType.includes('AccessDeniedException') || 
           errorType.includes('ResourceNotFoundException') ||
           errorType.includes('UnrecognizedClientException');
  }
  return false;
};

/**
 * Get item from local storage with fallback default value
 */
const getFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') {
    // Server-side: use in-memory storage
    console.log(`Server-side: Getting ${key} from in-memory storage`);
    return serverStorage[key] as T || defaultValue;
  }
  
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading from local storage for key ${key}:`, error);
    return defaultValue;
  }
};

/**
 * Save item to local storage
 */
const saveToLocalStorage = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') {
    // Server-side: use in-memory storage
    console.log(`Server-side: Saving ${key} to in-memory storage:`, value);
    serverStorage[key] = value;
    return;
  }
  
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to local storage for key ${key}:`, error);
  }
};

/**
 * DynamoDB service for configuration data management with local storage fallback
 */
export class DynamoDBConfigService {
  // Flag to track if we should use fallback storage
  private useFallbackStorage: boolean = false;

  // Cache object to store data elements by subTypeId
  private subTypeDataElementsCache: Record<string, { timestamp: number, data: DataElementConfig[] }> = {};
  private CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

  /**
   * Get application configuration
   */
  async getAppConfig(): Promise<AppConfig> {
    // Reset the fallback flag to ensure we always try DynamoDB first
    this.useFallbackStorage = false;
    console.log('Getting app config from DynamoDB...');

    try {
      const response = await docClient.send(
        new GetCommand({
          TableName: CONFIG_TABLE,
          Key: {
            id: 'app-config',
          },
        })
      );

      console.log('DynamoDB response:', response);

      if (!response.Item) {
        console.log('No app configuration found in DynamoDB, returning default config');
        return defaultAppConfig;
      }

      console.log('Found app config in DynamoDB:', response.Item);
      return response.Item as AppConfig;
    } catch (error) {
      console.error('Error fetching app configuration from DynamoDB:', error);
      
      if (isPermissionError(error)) {
        console.log('Permission error accessing DynamoDB, falling back to local storage');
        this.useFallbackStorage = true;
        return this.getAppConfigFromLocalStorage();
      }
      
      if (error && (error as any).__type?.includes('ResourceNotFoundException')) {
        console.log('DynamoDB table not found, falling back to local storage');
        this.useFallbackStorage = true;
        return this.getAppConfigFromLocalStorage();
      }

      throw error;
    }
  }

  /**
   * Update application configuration
   */
  async updateAppConfig(config: AppConfig): Promise<void> {
    try {
      // If using fallback storage, save to local storage
      if (this.useFallbackStorage) {
        saveToLocalStorage(LS_CONFIG_KEY, config);
        return;
      }

      await docClient.send(
        new PutCommand({
          TableName: CONFIG_TABLE,
          Item: {
            id: 'app-config',
            config,
            updatedAt: Date.now()
          }
        })
      );
    } catch (error) {
      console.error('Error updating app config:', error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for config due to permission issues');
        this.useFallbackStorage = true;
        saveToLocalStorage(LS_CONFIG_KEY, config);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get all document types
   */
  async getAllDocumentTypes(): Promise<DocumentTypeConfig[]> {
    // Reset the fallback flag to ensure we always try DynamoDB first
    this.useFallbackStorage = false;
    console.log('Getting all document types from DynamoDB...');

    try {
      const response = await docClient.send(
        new ScanCommand({
          TableName: DOC_TYPE_TABLE,
        })
      );

      console.log(`Found ${response.Items?.length || 0} document types in DynamoDB`);
      if (response.Items && response.Items.length > 0) {
        console.log('First document type:', response.Items[0]);
      }

      const documentTypes = (response.Items || []) as DocumentTypeConfig[];
      
      // For each document type, load its sub-types
      for (const docType of documentTypes) {
        try {
          // Load sub-types for this document type (each with their own data elements)
          const subTypes = await this.getSubTypesByDocumentType(docType.id);
          docType.subTypes = subTypes;
        } catch (error) {
          console.warn(`Error fetching sub-types for document type ${docType.id}:`, error);
          // Keep the embedded sub-types if any error occurs
          docType.subTypes = docType.subTypes || [];
        }
      }

      return documentTypes;
    } catch (error) {
      console.error('Error fetching document types:', error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for document types due to permission issues');
        this.useFallbackStorage = true;
        
        // Try to get from app config first
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        console.log('App config from local storage after error:', config);
        
        // Also check document types storage
        const docTypes = getFromLocalStorage<DocumentTypeConfig[]>(LS_DOC_TYPES_KEY, []);
        console.log('Document types from separate storage after error:', docTypes);
        
        // Merge both sources, preferring app config if there are duplicates
        const mergedDocTypes = [...docTypes];
        
        // Add document types from app config that aren't already in the merged list
        if (config && config.documentTypes) {
          for (const docType of config.documentTypes) {
            if (!mergedDocTypes.some(dt => dt.id === docType.id)) {
              mergedDocTypes.push(docType);
            }
          }
        }
        
        console.log('Merged document types from local storage after error:', mergedDocTypes);
        return mergedDocTypes;
      }
      
      throw error;
    }
  }

  /**
   * Get document type by ID
   */
  async getDocumentType(id: string): Promise<DocumentTypeConfig | null> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        return config.documentTypes.find(dt => dt.id === id) || null;
      }

      const response = await docClient.send(
        new GetCommand({
          TableName: DOC_TYPE_TABLE,
          Key: { id }
        })
      );

      if (!response.Item) {
        return null;
      }

      const docType = response.Item as DocumentTypeConfig;
      
      try {
        // Load sub-types with their self-contained elements
        if (docType.id) {
          const subTypes = await this.getSubTypesByDocumentType(docType.id);
          docType.subTypes = subTypes;
        }
      } catch (error) {
        console.warn(`Error fetching sub-types for document type ${id}:`, error);
        // Keep the embedded sub-types if any error occurs
        docType.subTypes = docType.subTypes || [];
      }

      return docType;
    } catch (error) {
      console.error(`Error fetching document type ${id}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for document type due to permission issues');
        this.useFallbackStorage = true;
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        return config.documentTypes.find(dt => dt.id === id) || null;
      }
      
      throw error;
    }
  }

  /**
   * Create a new document type
   */
  async createDocumentType(documentType: Omit<DocumentTypeConfig, 'id'>): Promise<DocumentTypeConfig> {
    const newDocType: DocumentTypeConfig = {
      ...documentType,
      id: createId(),
      dataElements: documentType.dataElements || []
    };

    try {
      // If using fallback storage, save to local storage
      if (this.useFallbackStorage) {
        console.log('Using local storage fallback for creating document type');
        
        // Get current app config
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        console.log('Current app config before adding document type:', config);
        
        // Update document types in app config
        const updatedConfig = {
          ...config,
          documentTypes: [...(config.documentTypes || []), newDocType]
        };
        
        // Save updated app config
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        console.log('Updated app config after adding document type:', updatedConfig);
        
        // Also save to document types storage for consistency
        const docTypes = getFromLocalStorage<DocumentTypeConfig[]>(LS_DOC_TYPES_KEY, []);
        saveToLocalStorage(LS_DOC_TYPES_KEY, [...docTypes, newDocType]);
        
        // Force the useFallbackStorage flag to true for the entire session
        this.useFallbackStorage = true;
        
        return newDocType;
      }

      // Save the document type first
      await docClient.send(
        new PutCommand({
          TableName: DOC_TYPE_TABLE,
          Item: newDocType
        })
      );

      // If there are default data elements, save them separately to the elements table
      if (newDocType.dataElements && newDocType.dataElements.length > 0) {
        console.log(`Saving ${newDocType.dataElements.length} default data elements for document type ${newDocType.id}`);
        
        const batchWriteItems = newDocType.dataElements.map(element => ({
          PutRequest: {
            Item: {
              ...element,
              // Ensure aliases are included if they exist
              ...(element.aliases && { aliases: element.aliases }),
              documentTypeId: newDocType.id
            }
          }
        }));
        
        // Process batch writes in chunks of 25 (DynamoDB limit)
        for (let i = 0; i < batchWriteItems.length; i += 25) {
          const batch = batchWriteItems.slice(i, i + 25);
          
          try {
            await docClient.send(
              new BatchWriteCommand({
                RequestItems: {
                  [DATA_ELEMENT_TABLE]: batch
                }
              })
            );
          } catch (batchError) {
            console.error(`Error saving batch of data elements for document type ${newDocType.id}:`, batchError);
            // We'll continue with the next batch even if this one fails
          }
        }
      }

      // If there are subtypes, save them separately
      if (newDocType.subTypes && newDocType.subTypes.length > 0) {
        console.log(`Saving ${newDocType.subTypes.length} subtypes for document type ${newDocType.id}`);
        
        // Process each subtype
        for (const subType of newDocType.subTypes) {
          // Make sure the subtype has a valid ID
          const subTypeWithId = {
            ...subType,
            id: subType.id || createId(),
            documentTypeId: newDocType.id
          };
          
          // Save the subtype
          await docClient.send(
            new PutCommand({
              TableName: SUB_TYPE_TABLE,
              Item: subTypeWithId
            })
          );
          
          // If the subtype has data elements, save them too
          if (subTypeWithId.dataElements && subTypeWithId.dataElements.length > 0) {
            console.log(`Saving ${subTypeWithId.dataElements.length} data elements for subtype ${subTypeWithId.id}`);
            
            const subTypeBatchWriteItems = subTypeWithId.dataElements.map(element => ({
              PutRequest: {
                Item: {
                  ...element,
                  // Ensure aliases are included if they exist
                  ...(element.aliases && { aliases: element.aliases }),
                  documentTypeId: newDocType.id,
                  subTypeId: subTypeWithId.id
                }
              }
            }));
            
            // Process batch writes in chunks of 25 (DynamoDB limit)
            for (let i = 0; i < subTypeBatchWriteItems.length; i += 25) {
              const batch = subTypeBatchWriteItems.slice(i, i + 25);
              
              try {
                await docClient.send(
                  new BatchWriteCommand({
                    RequestItems: {
                      [DATA_ELEMENT_TABLE]: batch
                    }
                  })
                );
              } catch (batchError) {
                console.error(`Error saving batch of data elements for subtype ${subTypeWithId.id}:`, batchError);
                // We'll continue with the next batch even if this one fails
              }
            }
          }
        }
      }

      return newDocType;
    } catch (error) {
      console.error('Error creating document type:', error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for creating document type due to permission issues');
        this.useFallbackStorage = true;
        
        // Get current app config
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        console.log('Current app config before adding document type (after error):', config);
        
        // Update document types in app config
        const updatedConfig = {
          ...config,
          documentTypes: [...(config.documentTypes || []), newDocType]
        };
        
        // Save updated app config
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        console.log('Updated app config after adding document type (after error):', updatedConfig);
        
        // Also save to document types storage for consistency
        const docTypes = getFromLocalStorage<DocumentTypeConfig[]>(LS_DOC_TYPES_KEY, []);
        saveToLocalStorage(LS_DOC_TYPES_KEY, [...docTypes, newDocType]);
        
        return newDocType;
      }
      
      throw error;
    }
  }

  /**
   * Update an existing document type
   */
  async updateDocumentType(id: string, updates: Partial<DocumentTypeConfig>): Promise<void> {
    try {
      // If using fallback storage, update in local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => 
          docType.id === id ? { ...docType, ...updates } : docType
        );
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      // Create the update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        return; // Nothing to update
      }

      await docClient.send(
        new UpdateCommand({
          TableName: DOC_TYPE_TABLE,
          Key: { id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating document type ${id}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating document type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => 
          docType.id === id ? { ...docType, ...updates } : docType
        );
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a document type and all related entities
   */
  async deleteDocumentType(id: string): Promise<void> {
    try {
      // If using fallback storage, delete from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedConfig = {
          ...config,
          documentTypes: config.documentTypes.filter(docType => docType.id !== id)
        };
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      // First, get all related sub-types
      const subTypes = await this.getSubTypesByDocumentType(id);
      
      // Delete all related sub-types
      for (const subType of subTypes) {
        await this.deleteSubType(id, subType.id);
      }
      
      // Delete all data elements connected to this document type
      const dataElements = await this.getDataElementsByDocumentType(id);
      for (const element of dataElements) {
        await this.deleteDataElement(id, element.id);
      }
      
      // Delete all training datasets for this document type
      const datasets = await this.getTrainingDatasetsByDocumentType(id);
      for (const dataset of datasets) {
        await this.deleteTrainingDataset(id, dataset.id);
      }
      
      // Finally, delete the document type itself
      await docClient.send(
        new DeleteCommand({
          TableName: DOC_TYPE_TABLE,
          Key: { id }
        })
      );
    } catch (error) {
      console.error(`Error deleting document type ${id}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting document type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedConfig = {
          ...config,
          documentTypes: config.documentTypes.filter(docType => docType.id !== id)
        };
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get all sub-types for a document type
   */
  async getSubTypesByDocumentType(documentTypeId: string): Promise<DocumentSubTypeConfig[]> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        return docType?.subTypes || [];
      }

      // Fetch sub-types with their embedded data elements
      const response = await docClient.send(
        new QueryCommand({
          TableName: SUB_TYPE_TABLE,
          IndexName: 'documentTypeId-index',
          KeyConditionExpression: 'documentTypeId = :documentTypeId',
          ExpressionAttributeValues: {
            ':documentTypeId': documentTypeId
          }
        })
      );

      // Return sub-types with their embedded data elements
      // Each sub-type should be self-contained with its own elements
      return (response.Items || []) as DocumentSubTypeConfig[];
    } catch (error) {
      console.error(`Error fetching sub-types for document type ${documentTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for sub-types due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        return docType?.subTypes || [];
      }
      
      throw error;
    }
  }

  /**
   * Get a specific sub-type by ID
   */
  async getSubType(id: string): Promise<DocumentSubTypeConfig | null> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        for (const docType of config.documentTypes) {
          const subType = docType.subTypes?.find(st => st.id === id);
          if (subType) return subType;
        }
        return null;
      }

      const response = await docClient.send(
        new GetCommand({
          TableName: SUB_TYPE_TABLE,
          Key: { id }
        })
      );

      if (!response.Item) {
        return null;
      }

      return response.Item as DocumentSubTypeConfig;
    } catch (error) {
      console.error(`Error fetching sub-type ${id}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for sub-type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        for (const docType of config.documentTypes) {
          const subType = docType.subTypes?.find(st => st.id === id);
          if (subType) return subType;
        }
        return null;
      }
      
      throw error;
    }
  }

  /**
   * Create a new sub-type for a document type
   */
  async createSubType(
    documentTypeId: string, 
    subType: Omit<DocumentSubTypeConfig, 'id'>
  ): Promise<DocumentSubTypeConfig> {
    const newSubType: DocumentSubTypeConfig = {
      ...subType,
      id: createId(),
      documentTypeId,
      dataElements: subType.dataElements || []
    };

    try {
      // If using fallback storage, save to local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: [...(docType.subTypes || []), newSubType]
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return newSubType;
      }

      // Save the sub-type first with its embedded elements
      await docClient.send(
        new PutCommand({
          TableName: SUB_TYPE_TABLE,
          Item: newSubType
        })
      );

      // Also save data elements to the elements table for API access
      // This creates duplicates, but ensures elements can be accessed both ways
      if (newSubType.dataElements && newSubType.dataElements.length > 0) {
        console.log(`Saving ${newSubType.dataElements.length} data elements for sub-type ${newSubType.id} to elements table`);
        
        const batchWriteItems = newSubType.dataElements.map(element => ({
          PutRequest: {
            Item: {
              ...element,
              documentTypeId: documentTypeId,
              subTypeId: newSubType.id
            }
          }
        }));
        
        // Process batch writes in chunks of 25 (DynamoDB limit)
        for (let i = 0; i < batchWriteItems.length; i += 25) {
          const batch = batchWriteItems.slice(i, i + 25);
          
          try {
            await docClient.send(
              new BatchWriteCommand({
                RequestItems: {
                  [DATA_ELEMENT_TABLE]: batch
                }
              })
            );
          } catch (batchError) {
            console.error(`Error saving batch of data elements for sub-type ${newSubType.id}:`, batchError);
            // We'll continue with the next batch even if this one fails
          }
        }
      }

      return newSubType;
    } catch (error) {
      console.error('Error creating sub-type:', error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for creating sub-type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: [...(docType.subTypes || []), newSubType]
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return newSubType;
      }
      
      throw error;
    }
  }

  /**
   * Update an existing sub-type
   */
  async updateSubType(
    documentTypeId: string, 
    subTypeId: string, 
    updates: Partial<DocumentSubTypeConfig>
  ): Promise<void> {
    try {
      // If using fallback storage, update in local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: docType.subTypes?.map(subType => 
              subType.id === subTypeId ? { ...subType, ...updates } : subType
            ) || []
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      // Special handling if dataElements are being updated
      if (updates.dataElements) {
        try {
          // Get the current sub-type to see what elements might have been removed
          const currentSubType = await this.getSubType(subTypeId);
          
          if (currentSubType) {
            // Get IDs of elements that should be removed from the elements table
            const currentElementIds = new Set(currentSubType.dataElements?.map(e => e.id) || []);
            const updatedElementIds = new Set(updates.dataElements.map(e => e.id));
            
            // Find element IDs to remove (in current but not in updates)
            const elementsToRemove = [...currentElementIds].filter(id => !updatedElementIds.has(id));
            
            // Remove elements from the elements table that are no longer in the sub-type
            for (const elementId of elementsToRemove) {
              try {
                await this.deleteDataElement(documentTypeId, elementId, subTypeId);
              } catch (error) {
                console.warn(`Error removing element ${elementId} from elements table:`, error);
              }
            }
            
            // Add/update elements in the elements table
            for (const element of updates.dataElements) {
              try {
                if (currentElementIds.has(element.id)) {
                  // Update existing element
                  await this.updateDataElement(documentTypeId, element.id, element, subTypeId);
                } else {
                  // Add new element
                  await this.createDataElement(documentTypeId, element, subTypeId);
                }
              } catch (error) {
                console.warn(`Error saving element ${element.id} to elements table:`, error);
              }
            }
          }
        } catch (error) {
          console.warn('Error syncing data elements with elements table:', error);
        }
      }

      // Create the update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'documentTypeId') {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        return; // Nothing to update
      }

      await docClient.send(
        new UpdateCommand({
          TableName: SUB_TYPE_TABLE,
          Key: { id: subTypeId },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating sub-type ${subTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating sub-type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: docType.subTypes?.map(subType => 
              subType.id === subTypeId ? { ...subType, ...updates } : subType
            ) || []
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a sub-type
   */
  async deleteSubType(documentTypeId: string, subTypeId: string): Promise<void> {
    try {
      // If using fallback storage, delete from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: docType.subTypes?.filter(subType => subType.id !== subTypeId) || []
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      // First remove any data elements connected to this sub-type from the elements table
      try {
        const elements = await this.getDataElementsBySubType(subTypeId);
        for (const element of elements) {
          await this.deleteDataElement(documentTypeId, element.id, subTypeId);
        }
      } catch (error) {
        console.warn(`Error cleaning up elements for sub-type ${subTypeId} from elements table:`, error);
      }

      // Then delete the sub-type itself
      await docClient.send(
        new DeleteCommand({
          TableName: SUB_TYPE_TABLE,
          Key: { id: subTypeId }
        })
      );
    } catch (error) {
      console.error(`Error deleting sub-type ${subTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting sub-type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          return {
            ...docType,
            subTypes: docType.subTypes?.filter(subType => subType.id !== subTypeId) || []
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get all data elements for a document type
   */
  async getDataElementsByDocumentType(documentTypeId: string): Promise<DataElementConfig[]> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        
        // Filter out elements that might have a subTypeId - they belong to sub-types, not the parent
        return (docType?.dataElements || []).filter(element => !element.subTypeId);
      }

      try {
        // Try using the index first
        const response = await docClient.send(
          new QueryCommand({
            TableName: DATA_ELEMENT_TABLE,
            IndexName: 'documentTypeId-index',
            KeyConditionExpression: 'documentTypeId = :documentTypeId',
            ExpressionAttributeValues: {
              ':documentTypeId': documentTypeId
            }
          })
        );

        // Filter out elements that have a subTypeId since they belong to sub-types
        const elements = (response.Items || []) as DataElementConfig[];
        return elements.filter(element => !element.subTypeId);
      } catch (indexError: any) {
        // If the index doesn't exist, fall back to scanning the table
        if (indexError.name === 'ValidationException' && 
            indexError.message.includes('specified index') && 
            indexError.message.includes('does not have')) {
          console.warn(`Index not found, falling back to table scan for data elements: ${indexError.message}`);
          
          const scanResponse = await docClient.send(
            new ScanCommand({
              TableName: DATA_ELEMENT_TABLE,
              FilterExpression: 'documentTypeId = :documentTypeId AND attribute_not_exists(subTypeId)',
              ExpressionAttributeValues: {
                ':documentTypeId': documentTypeId
              }
            })
          );
          
          return (scanResponse.Items || []) as DataElementConfig[];
        }
        
        // If it's a different error, rethrow it
        throw indexError;
      }
    } catch (error) {
      console.error(`Error fetching data elements for document type ${documentTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for data elements due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        // Filter out elements that might have a subTypeId
        return (docType?.dataElements || []).filter(element => !element.subTypeId);
      }
      
      throw error;
    }
  }

  /**
   * Get all data elements for a specific sub-type
   */
  async getDataElementsBySubType(subTypeId: string): Promise<DataElementConfig[]> {
    if (!subTypeId) {
      return [];
    }

    // Check cache first
    const cachedData = this.subTypeDataElementsCache[subTypeId];
    if (cachedData && (Date.now() - cachedData.timestamp) < this.CACHE_TTL_MS) {
      return cachedData.data;
    }

    if (this.useFallbackStorage) {
      const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
      const elements = [];
      
      // Find all document types with the matching subType
      for (const docType of config.documentTypes) {
        const subType = docType.subTypes?.find(st => st.id === subTypeId);
        if (subType?.dataElements) {
          elements.push(...subType.dataElements);
        }
      }
      
      return elements;
    }

    try {
      // Try using the index first if it exists
      const response = await docClient.send(
        new QueryCommand({
          TableName: DATA_ELEMENT_TABLE,
          IndexName: 'subTypeId-index',
          KeyConditionExpression: 'subTypeId = :subTypeId',
          ExpressionAttributeValues: {
            ':subTypeId': subTypeId
          }
        })
      );

      const results = (response.Items || []) as DataElementConfig[];
      
      // Cache the results
      this.subTypeDataElementsCache[subTypeId] = {
        timestamp: Date.now(),
        data: results
      };
      
      return results;
    } catch (indexError: any) {
      // If the index doesn't exist or we don't have permission, use an optimized query approach
      console.warn(`Index issue or permission error, using optimized approach for sub-type data elements: ${indexError.message}`);
      
      try {
        // First try to get the documentTypeId for this subTypeId to optimize our scan
        const subTypeResponse = await docClient.send(
          new GetCommand({
            TableName: 'document-processor-subtypes',
            Key: { id: subTypeId }
          })
        );
        
        const subTypeItem = subTypeResponse.Item as DocumentSubTypeConfig;
        const documentTypeId = subTypeItem?.documentTypeId;
        
        // If we found the document type ID, we can filter elements more efficiently
        if (documentTypeId) {
          // Try to use the documentTypeId-index first, which is known to exist
          const queryResponse = await docClient.send(
            new QueryCommand({
              TableName: DATA_ELEMENT_TABLE,
              IndexName: 'documentTypeId-index',
              KeyConditionExpression: 'documentTypeId = :docTypeId',
              FilterExpression: 'subTypeId = :subTypeId',
              ExpressionAttributeValues: {
                ':docTypeId': documentTypeId,
                ':subTypeId': subTypeId
              }
            })
          );
          
          const results = (queryResponse.Items || []) as DataElementConfig[];
          
          // Cache the results
          this.subTypeDataElementsCache[subTypeId] = {
            timestamp: Date.now(),
            data: results
          };
          
          return results;
        }
      } catch (subTypeError) {
        console.warn(`Error getting subType details: ${(subTypeError as Error).message}, falling back to full scan`);
      }
      
      // If all else fails, fall back to the original scan approach
      const scanResponse = await docClient.send(
        new ScanCommand({
          TableName: DATA_ELEMENT_TABLE,
          FilterExpression: 'subTypeId = :subTypeId',
          ExpressionAttributeValues: {
            ':subTypeId': subTypeId
          }
        })
      );
      
      const results = (scanResponse.Items || []) as DataElementConfig[];
      
      // Cache the results
      this.subTypeDataElementsCache[subTypeId] = {
        timestamp: Date.now(),
        data: results
      };
      
      return results;
    }
  }

  /**
   * Create a new data element
   */
  async createDataElement(
    documentTypeId: string, 
    dataElement: Omit<DataElementConfig, 'id'>, 
    subTypeId?: string
  ): Promise<DataElementConfig> {
    const newElement: DataElementConfig & { documentTypeId: string; subTypeId?: string } = {
      ...dataElement,
      id: createId(),
      documentTypeId,
      // Ensure aliases are included if they exist
      ...(dataElement.aliases && { aliases: dataElement.aliases }),
      ...(subTypeId && { subTypeId })
    };

    try {
      // If using fallback storage, save to local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, add it to the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: [...(subType.dataElements || []), newElement]
                };
              }) || []
            };
          }
          
          // Otherwise, add it to the document type
          return {
            ...docType,
            dataElements: [...docType.dataElements, newElement]
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return newElement;
      }

      await docClient.send(
        new PutCommand({
          TableName: DATA_ELEMENT_TABLE,
          Item: newElement
        })
      );

      return newElement;
    } catch (error) {
      console.error('Error creating data element:', error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for creating data element due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, add it to the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: [...(subType.dataElements || []), newElement]
                };
              }) || []
            };
          }
          
          // Otherwise, add it to the document type
          return {
            ...docType,
            dataElements: [...docType.dataElements, newElement]
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return newElement;
      }
      
      throw error;
    }
  }

  /**
   * Update an existing data element
   */
  async updateDataElement(
    documentTypeId: string, 
    dataElementId: string, 
    updates: Partial<DataElementConfig>,
    subTypeId?: string
  ): Promise<void> {
    try {
      // If using fallback storage, update in local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, update it in the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: (subType.dataElements || []).map(element => 
                    element.id === dataElementId ? { 
                      ...element, 
                      ...updates,
                      // Ensure aliases are properly updated
                      ...(updates.aliases && { aliases: updates.aliases })
                    } : element
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, update it in the document type
          return {
            ...docType,
            dataElements: docType.dataElements.map(element => 
              element.id === dataElementId ? { 
                ...element, 
                ...updates,
                // Ensure aliases are properly updated
                ...(updates.aliases && { aliases: updates.aliases })
              } : element
            )
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      // Create the update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'documentTypeId' && key !== 'subTypeId') {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        return; // Nothing to update
      }

      // Ensure aliases are handled properly
      if (updates.aliases !== undefined) {
        // If aliases is not in the update expressions (possibly because it was an empty array), add it
        if (!expressionAttributeNames['#aliases']) {
          updateExpressions.push('#aliases = :aliases');
          expressionAttributeNames['#aliases'] = 'aliases';
          expressionAttributeValues[':aliases'] = updates.aliases || [];
        }
      }

      await docClient.send(
        new UpdateCommand({
          TableName: DATA_ELEMENT_TABLE,
          Key: { id: dataElementId },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating data element ${dataElementId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating data element due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, update it in the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: (subType.dataElements || []).map(element => 
                    element.id === dataElementId ? { 
                      ...element, 
                      ...updates,
                      // Ensure aliases are properly updated
                      ...(updates.aliases && { aliases: updates.aliases })
                    } : element
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, update it in the document type
          return {
            ...docType,
            dataElements: docType.dataElements.map(element => 
              element.id === dataElementId ? { 
                ...element, 
                ...updates,
                // Ensure aliases are properly updated
                ...(updates.aliases && { aliases: updates.aliases })
              } : element
            )
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a data element
   */
  async deleteDataElement(
    documentTypeId: string, 
    dataElementId: string, 
    subTypeId?: string
  ): Promise<void> {
    try {
      // If using fallback storage, delete from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, delete it from the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: (subType.dataElements || []).filter(element => 
                    element.id !== dataElementId
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, delete it from the document type
          return {
            ...docType,
            dataElements: docType.dataElements.filter(element => 
              element.id !== dataElementId
            )
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }

      await docClient.send(
        new DeleteCommand({
          TableName: DATA_ELEMENT_TABLE,
          Key: { id: dataElementId }
        })
      );
    } catch (error) {
      console.error(`Error deleting data element ${dataElementId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting data element due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const updatedDocTypes = config.documentTypes.map(docType => {
          if (docType.id !== documentTypeId) return docType;
          
          // If this element belongs to a sub-type, delete it from the sub-type
          if (subTypeId) {
            return {
              ...docType,
              subTypes: docType.subTypes?.map(subType => {
                if (subType.id !== subTypeId) return subType;
                
                return {
                  ...subType,
                  dataElements: (subType.dataElements || []).filter(element => 
                    element.id !== dataElementId
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, delete it from the document type
          return {
            ...docType,
            dataElements: docType.dataElements.filter(element => 
              element.id !== dataElementId
            )
          };
        });
        
        const updatedConfig = {
          ...config,
          documentTypes: updatedDocTypes
        };
        
        saveToLocalStorage(LS_CONFIG_KEY, updatedConfig);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get all training datasets for a document type
   */
  async getTrainingDatasetsByDocumentType(documentTypeId: string): Promise<TrainingDataset[]> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        return docType?.trainingDatasets || [];
      }

      try {
        // Try using the index first
        const response = await docClient.send(
          new QueryCommand({
            TableName: TRAINING_DATASET_TABLE,
            IndexName: 'documentTypeId-index',
            KeyConditionExpression: 'documentTypeId = :documentTypeId',
            ExpressionAttributeValues: {
              ':documentTypeId': documentTypeId
            }
          })
        );

        return (response.Items || []) as TrainingDataset[];
      } catch (indexError: any) {
        // If the index doesn't exist, fall back to scanning the table
        if (indexError.name === 'ValidationException' && 
            indexError.message.includes('specified index') && 
            indexError.message.includes('does not have')) {
          console.warn(`Index not found, falling back to table scan for training datasets: ${indexError.message}`);
          
          const scanResponse = await docClient.send(
            new ScanCommand({
              TableName: TRAINING_DATASET_TABLE,
              FilterExpression: 'documentTypeId = :documentTypeId',
              ExpressionAttributeValues: {
                ':documentTypeId': documentTypeId
              }
            })
          );
          
          return (scanResponse.Items || []) as TrainingDataset[];
        }
        
        // If it's a different error, rethrow it
        throw indexError;
      }
    } catch (error) {
      console.error(`Error fetching training datasets for document type ${documentTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for training datasets due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        return docType?.trainingDatasets || [];
      }
      
      throw error;
    }
  }

  /**
   * Create a new training dataset
   */
  async createTrainingDataset(documentTypeId: string, dataset: Omit<TrainingDataset, 'id'>): Promise<TrainingDataset> {
    const newDataset: TrainingDataset = {
      ...dataset,
      id: createId(),
      documentTypeId,
      examples: dataset.examples || []
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TRAINING_DATASET_TABLE,
          Item: newDataset
        })
      );

      return newDataset;
    } catch (error) {
      console.error('Error creating training dataset:', error);
      throw error;
    }
  }

  /**
   * Update a training dataset
   */
  async updateTrainingDataset(
    documentTypeId: string, 
    datasetId: string, 
    updates: Partial<TrainingDataset>
  ): Promise<void> {
    try {
      // Create the update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'documentTypeId') {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        return; // Nothing to update
      }

      await docClient.send(
        new UpdateCommand({
          TableName: TRAINING_DATASET_TABLE,
          Key: { id: datasetId },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating training dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a training dataset
   */
  async deleteTrainingDataset(documentTypeId: string, datasetId: string): Promise<void> {
    try {
      // First delete all training examples in this dataset
      const examples = await this.getTrainingExamplesByDataset(documentTypeId, datasetId);
      for (const example of examples) {
        await this.deleteTrainingExample(documentTypeId, datasetId, example.id);
      }

      // Then delete the dataset itself
      await docClient.send(
        new DeleteCommand({
          TableName: TRAINING_DATASET_TABLE,
          Key: { id: datasetId }
        })
      );
    } catch (error) {
      console.error(`Error deleting training dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Get all training examples for a dataset
   */
  async getTrainingExamplesByDataset(documentTypeId: string, datasetId: string): Promise<TrainingExample[]> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        const dataset = docType?.trainingDatasets?.find(ds => ds.id === datasetId);
        return dataset?.examples || [];
      }

      try {
        // Try using the index first
        const response = await docClient.send(
          new QueryCommand({
            TableName: TRAINING_EXAMPLE_TABLE,
            IndexName: 'datasetId-index',
            KeyConditionExpression: 'datasetId = :datasetId',
            ExpressionAttributeValues: {
              ':datasetId': datasetId
            }
          })
        );

        return (response.Items || []) as TrainingExample[];
      } catch (indexError: any) {
        // If the index doesn't exist or we don't have permission, fall back to scanning the table
        if ((indexError.name === 'ValidationException' && 
            indexError.message.includes('specified index') && 
            indexError.message.includes('does not have')) ||
            isPermissionError(indexError)) {
          console.warn(`Index issue or permission error, falling back to table scan for training examples: ${indexError.message}`);
          
          const scanResponse = await docClient.send(
            new ScanCommand({
              TableName: TRAINING_EXAMPLE_TABLE,
              FilterExpression: 'datasetId = :datasetId',
              ExpressionAttributeValues: {
                ':datasetId': datasetId
              }
            })
          );
          
          return (scanResponse.Items || []) as TrainingExample[];
        }
        
        // If it's a different error, rethrow it
        throw indexError;
      }
    } catch (error) {
      console.error(`Error fetching training examples for dataset ${datasetId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for training examples due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        const dataset = docType?.trainingDatasets?.find(ds => ds.id === datasetId);
        return dataset?.examples || [];
      }
      
      throw error;
    }
  }

  /**
   * Create a new training example
   */
  async createTrainingExample(
    documentTypeId: string, 
    datasetId: string, 
    example: Omit<TrainingExample, 'id'>
  ): Promise<TrainingExample> {
    const newExample: TrainingExample & { documentTypeId: string; datasetId: string } = {
      ...example,
      id: createId(),
      documentTypeId,
      datasetId
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TRAINING_EXAMPLE_TABLE,
          Item: newExample
        })
      );

      return newExample;
    } catch (error) {
      console.error('Error creating training example:', error);
      throw error;
    }
  }

  /**
   * Update a training example
   */
  async updateTrainingExample(
    documentTypeId: string, 
    datasetId: string, 
    exampleId: string, 
    updates: Partial<TrainingExample>
  ): Promise<void> {
    try {
      // Create the update expression dynamically
      const updateExpressions = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'documentTypeId' && key !== 'datasetId') {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      }

      if (updateExpressions.length === 0) {
        return; // Nothing to update
      }

      await docClient.send(
        new UpdateCommand({
          TableName: TRAINING_EXAMPLE_TABLE,
          Key: { id: exampleId },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating training example ${exampleId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a training example
   */
  async deleteTrainingExample(documentTypeId: string, datasetId: string, exampleId: string): Promise<void> {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TRAINING_EXAMPLE_TABLE,
          Key: { id: exampleId }
        })
      );
    } catch (error) {
      console.error(`Error deleting training example ${exampleId}:`, error);
      throw error;
    }
  }

  /**
   * Get all retention policies
   */
  async getAllRetentionPolicies(): Promise<RetentionPolicy[]> {
    try {
      if (this.useFallbackStorage) {
        return getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
      }

      const response = await docClient.send(
        new ScanCommand({
          TableName: RETENTION_POLICY_TABLE,
        })
      );

      return response.Items as RetentionPolicy[] || [];
    } catch (error) {
      console.error('Error fetching retention policies:', error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for retention policies due to permission issues');
        this.useFallbackStorage = true;
        return getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
      }
      
      throw error;
    }
  }

  /**
   * Add a new retention policy
   */
  async addRetentionPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicy> {
    try {
      const newPolicy: RetentionPolicy = {
        ...policy,
        id: createId(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      if (this.useFallbackStorage) {
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        policies.push(newPolicy);
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, policies);
        return newPolicy;
      }

      await docClient.send(
        new PutCommand({
          TableName: RETENTION_POLICY_TABLE,
          Item: newPolicy
        })
      );

      return newPolicy;
    } catch (error) {
      console.error('Error adding retention policy:', error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for adding retention policy due to permission issues');
        this.useFallbackStorage = true;
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        const newPolicy: RetentionPolicy = {
          ...policy,
          id: createId(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        policies.push(newPolicy);
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, policies);
        return newPolicy;
      }
      
      throw error;
    }
  }

  /**
   * Update a retention policy
   */
  async updateRetentionPolicy(id: string, updates: Partial<Omit<RetentionPolicy, 'id' | 'createdAt'>>): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        const updatedPolicies = policies.map(policy => 
          policy.id === id 
            ? { ...policy, ...updates, updatedAt: Date.now() }
            : policy
        );
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, updatedPolicies);
        return;
      }

      // Build update expression dynamically based on what fields are provided
      const expressionParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {
        ':updatedAt': Date.now()
      };

      // Always update the updatedAt field
      expressionParts.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';

      // Add other fields conditionally
      if (updates.name !== undefined) {
        expressionParts.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }

      if (updates.description !== undefined) {
        expressionParts.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = updates.description;
      }

      if (updates.duration !== undefined) {
        expressionParts.push('#duration = :duration');
        expressionAttributeNames['#duration'] = 'duration';
        expressionAttributeValues[':duration'] = updates.duration;
      }

      const updateExpression = `SET ${expressionParts.join(', ')}`;
      
      console.log('Updating retention policy with expression:', updateExpression);
      console.log('Attribute names:', expressionAttributeNames);
      console.log('Attribute values:', expressionAttributeValues);

      await docClient.send(
        new UpdateCommand({
          TableName: RETENTION_POLICY_TABLE,
          Key: { id },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
    } catch (error) {
      console.error(`Error updating retention policy ${id}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating retention policy due to permission issues');
        this.useFallbackStorage = true;
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        const updatedPolicies = policies.map(policy => 
          policy.id === id 
            ? { ...policy, ...updates, updatedAt: Date.now() }
            : policy
        );
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, updatedPolicies);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a retention policy
   */
  async deleteRetentionPolicy(id: string): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        const updatedPolicies = policies.filter(policy => policy.id !== id);
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, updatedPolicies);
        return;
      }

      await docClient.send(
        new DeleteCommand({
          TableName: RETENTION_POLICY_TABLE,
          Key: { id }
        })
      );
    } catch (error) {
      console.error(`Error deleting retention policy ${id}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting retention policy due to permission issues');
        this.useFallbackStorage = true;
        const policies = getFromLocalStorage<RetentionPolicy[]>(LS_RETENTION_POLICIES_KEY, []);
        const updatedPolicies = policies.filter(policy => policy.id !== id);
        saveToLocalStorage(LS_RETENTION_POLICIES_KEY, updatedPolicies);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get all prompt categories
   */
  async getAllPromptCategories(): Promise<PromptCategory[]> {
    try {
      if (this.useFallbackStorage) {
        return getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
      }

      // First, get all categories
      const categoriesResponse = await docClient.send(
        new ScanCommand({
          TableName: PROMPT_CATEGORIES_TABLE,
        })
      );

      const categories = (categoriesResponse.Items || []) as PromptCategory[];
      console.log("Fetched categories:", categories);

      // For each category, get its prompts
      for (const category of categories) {
        try {
          const prompts = await this.getPrompts(category.id);
          category.prompts = prompts;
        } catch (error) {
          console.error(`Error fetching prompts for category ${category.id}:`, error);
          category.prompts = [];
        }
      }
      
      console.log("Categories with prompts:", categories);
      return categories;
    } catch (error) {
      console.error('Error fetching prompt categories:', error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for prompt categories due to permission issues');
        this.useFallbackStorage = true;
        return getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
      }
      
      throw error;
    }
  }

  /**
   * Add a new prompt category
   */
  async addPromptCategory(category: Omit<PromptCategory, 'id' | 'prompts'>): Promise<PromptCategory> {
    try {
      const newCategory: PromptCategory = {
        ...category,
        id: createId(),
        prompts: []
      };

      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        categories.push(newCategory);
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, categories);
        return newCategory;
      }

      console.log("Adding new category to DynamoDB:", newCategory);
      await docClient.send(
        new PutCommand({
          TableName: PROMPT_CATEGORIES_TABLE,
          Item: newCategory
        })
      );

      return newCategory;
    } catch (error) {
      console.error('Error adding prompt category:', error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for adding prompt category due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const newCategory: PromptCategory = {
          ...category,
          id: createId(),
          prompts: []
        };
        categories.push(newCategory);
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, categories);
        return newCategory;
      }
      
      throw error;
    }
  }

  /**
   * Update a prompt category
   */
  async updatePromptCategory(id: string, updates: Partial<Omit<PromptCategory, 'id' | 'prompts'>>): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === id ? { ...category, ...updates } : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }

      console.log(`Updating prompt category ${id} with updates:`, updates);
      
      // Build update expression and attribute values dynamically based on provided updates
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};
      
      // Standard fields
      if (updates.name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }
      
      if (updates.description !== undefined) {
        updateExpressions.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = updates.description;
      }
      
      // Model field
      if (updates.model !== undefined) {
        updateExpressions.push('#model = :model');
        expressionAttributeNames['#model'] = 'model';
        expressionAttributeValues[':model'] = updates.model;
      }
      
      // Temperature field
      if (updates.temperature !== undefined) {
        updateExpressions.push('#temperature = :temperature');
        expressionAttributeNames['#temperature'] = 'temperature';
        expressionAttributeValues[':temperature'] = updates.temperature;
      }
      
      // Response format field
      if (updates.responseFormat !== undefined) {
        updateExpressions.push('#responseFormat = :responseFormat');
        expressionAttributeNames['#responseFormat'] = 'responseFormat';
        expressionAttributeValues[':responseFormat'] = updates.responseFormat;
      }
      
      // Only proceed if there are fields to update
      if (updateExpressions.length === 0) {
        console.log('No fields to update for prompt category');
        return;
      }
      
      // Execute the update
      await docClient.send(
        new UpdateCommand({
          TableName: PROMPT_CATEGORIES_TABLE,
          Key: { id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
      
      console.log(`Prompt category ${id} updated successfully`);
    } catch (error) {
      console.error(`Error updating prompt category ${id}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating prompt category due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === id ? { ...category, ...updates } : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a prompt category
   */
  async deletePromptCategory(id: string): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.filter(category => category.id !== id);
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }

      await docClient.send(
        new DeleteCommand({
          TableName: PROMPT_CATEGORIES_TABLE,
          Key: { id }
        })
      );
    } catch (error) {
      console.error(`Error deleting prompt category ${id}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting prompt category due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.filter(category => category.id !== id);
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get prompts for a category
   */
  async getPrompts(categoryId: string): Promise<Prompt[]> {
    try {
      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const category = categories.find(c => c.id === categoryId);
        return category?.prompts || [];
      }

      try {
        // First try using the GSI (which is more efficient)
        const response = await docClient.send(
          new QueryCommand({
            TableName: PROMPTS_TABLE,
            IndexName: 'categoryId-index',
            KeyConditionExpression: 'categoryId = :categoryId',
            ExpressionAttributeValues: {
              ':categoryId': categoryId
            }
          })
        );
        
        console.log(`Fetched prompts for category ${categoryId} using GSI:`, response.Items);
        return response.Items as Prompt[] || [];
      } catch (error) {
        // If permission error using GSI, fall back to scanning the whole table with a filter
        console.warn('Error using GSI for prompt query, falling back to scan with filter:', error);
        
        const response = await docClient.send(
          new ScanCommand({
            TableName: PROMPTS_TABLE,
            FilterExpression: 'categoryId = :categoryId',
            ExpressionAttributeValues: {
              ':categoryId': categoryId
            }
          })
        );
        
        console.log(`Fetched prompts for category ${categoryId} using scan with filter:`, response.Items);
        return response.Items as Prompt[] || [];
      }
    } catch (error) {
      console.error(`Error fetching prompts for category ${categoryId}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for fetching prompts due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const category = categories.find(c => c.id === categoryId);
        return category?.prompts || [];
      }
      
      throw error;
    }
  }

  /**
   * Add a new prompt to a category
   */
  async addPrompt(categoryId: string, prompt: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<Prompt> {
    try {
      const newPrompt: Prompt = {
        ...prompt,
        id: createId(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? { ...category, prompts: [...category.prompts, newPrompt] }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return newPrompt;
      }

      await docClient.send(
        new PutCommand({
          TableName: PROMPTS_TABLE,
          Item: {
            ...newPrompt,
            categoryId
          }
        })
      );

      return newPrompt;
    } catch (error) {
      console.error('Error adding prompt:', error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for adding prompt due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const newPromptForFallback = {
          ...prompt,
          id: createId(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? { ...category, prompts: [...category.prompts, newPromptForFallback] }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return newPromptForFallback;
      }
      
      throw error;
    }
  }

  /**
   * Update a prompt
   */
  async updatePrompt(categoryId: string, promptId: string, updates: Partial<Omit<Prompt, 'id' | 'createdAt'>>): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? {
                ...category,
                prompts: category.prompts.map(prompt =>
                  prompt.id === promptId ? { ...prompt, ...updates, updatedAt: Date.now() } : prompt
                )
              }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }

      console.log(`Updating prompt ${promptId} for category ${categoryId} with updates:`, updates);
      
      // Build the update expression dynamically based on the provided updates
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};
      
      // Always update the timestamp
      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = Date.now();
      
      // Add other fields if they're in the updates
      if (updates.name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updates.name;
      }
      
      if (updates.description !== undefined) {
        updateExpressions.push('#description = :description');
        expressionAttributeNames['#description'] = 'description';
        expressionAttributeValues[':description'] = updates.description;
      }
      
      if (updates.role !== undefined) {
        updateExpressions.push('#role = :role');
        expressionAttributeNames['#role'] = 'role';
        expressionAttributeValues[':role'] = updates.role;
      }
      
      if (updates.content !== undefined) {
        updateExpressions.push('#content = :content');
        expressionAttributeNames['#content'] = 'content';
        expressionAttributeValues[':content'] = updates.content;
      }
      
      if (updates.isActive !== undefined) {
        updateExpressions.push('#isActive = :isActive');
        expressionAttributeNames['#isActive'] = 'isActive';
        expressionAttributeValues[':isActive'] = updates.isActive;
      }
      
      // Only use the id as the key, not categoryId
      await docClient.send(
        new UpdateCommand({
          TableName: PROMPTS_TABLE,
          Key: { id: promptId },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        })
      );
      
      console.log(`Prompt ${promptId} updated successfully`);
    } catch (error) {
      console.error(`Error updating prompt ${promptId}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for updating prompt due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? {
                ...category,
                prompts: category.prompts.map(prompt =>
                  prompt.id === promptId ? { ...prompt, ...updates, updatedAt: Date.now() } : prompt
                )
              }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }
      
      throw error;
    }
  }

  /**
   * Delete a prompt
   */
  async deletePrompt(categoryId: string, promptId: string): Promise<void> {
    try {
      if (this.useFallbackStorage) {
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? {
                ...category,
                prompts: category.prompts.filter(prompt => prompt.id !== promptId)
              }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }

      console.log(`Deleting prompt ${promptId} from category ${categoryId}`);
      await docClient.send(
        new DeleteCommand({
          TableName: PROMPTS_TABLE,
          Key: { id: promptId }
        })
      );
      console.log(`Prompt ${promptId} deleted successfully`);
    } catch (error) {
      console.error(`Error deleting prompt ${promptId}:`, error);
      
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for deleting prompt due to permission issues');
        this.useFallbackStorage = true;
        const categories = getFromLocalStorage<PromptCategory[]>(LS_PROMPT_CATEGORIES_KEY, []);
        const updatedCategories = categories.map(category => 
          category.id === categoryId 
            ? {
                ...category,
                prompts: category.prompts.filter(prompt => prompt.id !== promptId)
              }
            : category
        );
        saveToLocalStorage(LS_PROMPT_CATEGORIES_KEY, updatedCategories);
        return;
      }
      
      throw error;
    }
  }

  private getAppConfigFromLocalStorage(): AppConfig {
    // Get the current config from local storage
    const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
    
    // If this is the first time, initialize with default config
    if (!config || !config.documentTypes) {
      const initialConfig = { ...defaultAppConfig };
      saveToLocalStorage(LS_CONFIG_KEY, initialConfig);
      console.log('Initialized local storage with default app config');
      return initialConfig;
    }
    
    return config;
  }
} 