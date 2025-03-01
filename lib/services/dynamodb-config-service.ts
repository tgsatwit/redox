import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  QueryCommand, 
  UpdateCommand, 
  DeleteCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { createId } from '@paralleldrive/cuid2';
import { 
  AppConfig, 
  DocumentTypeConfig, 
  DataElementConfig, 
  DocumentSubTypeConfig,
  TrainingDataset,
  TrainingExample
} from '../types';
import { initialConfig } from '../config-store-db';

// Constants
const CONFIG_TABLE = process.env.DYNAMODB_CONFIG_TABLE || 'document-processor-config';
const DOC_TYPE_TABLE = process.env.DYNAMODB_DOCTYPE_TABLE || 'document-processor-doctypes';
const SUB_TYPE_TABLE = process.env.DYNAMODB_SUBTYPE_TABLE || 'document-processor-subtypes';
const DATA_ELEMENT_TABLE = process.env.DYNAMODB_ELEMENT_TABLE || 'document-processor-elements';
const TRAINING_DATASET_TABLE = process.env.DYNAMODB_DATASET_TABLE || 'document-processor-datasets';
const TRAINING_EXAMPLE_TABLE = process.env.DYNAMODB_EXAMPLE_TABLE || 'document-processor-examples';

// Local storage keys
const LS_CONFIG_KEY = 'document-processor-config';
const LS_DOC_TYPES_KEY = 'document-processor-doctypes';
const LS_SUB_TYPES_KEY = 'document-processor-subtypes';
const LS_DATA_ELEMENTS_KEY = 'document-processor-elements';
const LS_TRAINING_DATASETS_KEY = 'document-processor-datasets';
const LS_TRAINING_EXAMPLES_KEY = 'document-processor-examples';

// Server-side storage for fallback
const serverStorage: Record<string, any> = {};

// Default configuration for local storage
const defaultAppConfig = initialConfig;

// Get DynamoDB configuration
const getDynamoDBConfig = () => {
  const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  
  console.log('AWS Credentials:', {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set'
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
  
  console.log('Using AWS DynamoDB in region:', process.env.AWS_REGION || 'us-east-1');
  return {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
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

      return (response.Items || []) as DocumentTypeConfig[];
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

      return response.Item as DocumentTypeConfig;
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

      await docClient.send(
        new PutCommand({
          TableName: DOC_TYPE_TABLE,
          Item: newDocType
        })
      );

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

      await docClient.send(
        new PutCommand({
          TableName: SUB_TYPE_TABLE,
          Item: newSubType
        })
      );

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

      // First delete any data elements connected to this sub-type
      const dataElements = await this.getDataElementsBySubType(documentTypeId, subTypeId);
      for (const element of dataElements) {
        await this.deleteDataElement(documentTypeId, element.id, subTypeId);
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
        return docType?.dataElements || [];
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

        return (response.Items || []) as DataElementConfig[];
      } catch (indexError: any) {
        // If the index doesn't exist, fall back to scanning the table
        if (indexError.name === 'ValidationException' && 
            indexError.message.includes('specified index') && 
            indexError.message.includes('does not have')) {
          console.warn(`Index not found, falling back to table scan for data elements: ${indexError.message}`);
          
          const scanResponse = await docClient.send(
            new ScanCommand({
              TableName: DATA_ELEMENT_TABLE,
              FilterExpression: 'documentTypeId = :documentTypeId',
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
        return docType?.dataElements || [];
      }
      
      throw error;
    }
  }

  /**
   * Get all data elements for a specific sub-type
   */
  async getDataElementsBySubType(documentTypeId: string, subTypeId: string): Promise<DataElementConfig[]> {
    try {
      // If using fallback storage, get from local storage
      if (this.useFallbackStorage) {
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        const subType = docType?.subTypes?.find(st => st.id === subTypeId);
        return subType?.dataElements || [];
      }

      try {
        // Try using the index first
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

        return (response.Items || []) as DataElementConfig[];
      } catch (indexError: any) {
        // If the index doesn't exist or we don't have permission, fall back to scanning the table
        if ((indexError.name === 'ValidationException' && 
            indexError.message.includes('specified index') && 
            indexError.message.includes('does not have')) ||
            isPermissionError(indexError)) {
          console.warn(`Index issue or permission error, falling back to table scan for sub-type data elements: ${indexError.message}`);
          
          const scanResponse = await docClient.send(
            new ScanCommand({
              TableName: DATA_ELEMENT_TABLE,
              FilterExpression: 'subTypeId = :subTypeId',
              ExpressionAttributeValues: {
                ':subTypeId': subTypeId
              }
            })
          );
          
          return (scanResponse.Items || []) as DataElementConfig[];
        }
        
        // If it's a different error, rethrow it
        throw indexError;
      }
    } catch (error) {
      console.error(`Error fetching data elements for sub-type ${subTypeId}:`, error);
      
      // If permission error, use local storage fallback
      if (isPermissionError(error)) {
        console.log('Using local storage fallback for data elements by sub-type due to permission issues');
        this.useFallbackStorage = true;
        
        const config = getFromLocalStorage<AppConfig>(LS_CONFIG_KEY, defaultAppConfig);
        const docType = config.documentTypes.find(dt => dt.id === documentTypeId);
        const subType = docType?.subTypes?.find(st => st.id === subTypeId);
        return subType?.dataElements || [];
      }
      
      throw error;
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
                    element.id === dataElementId ? { ...element, ...updates } : element
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, update it in the document type
          return {
            ...docType,
            dataElements: docType.dataElements.map(element => 
              element.id === dataElementId ? { ...element, ...updates } : element
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
                    element.id === dataElementId ? { ...element, ...updates } : element
                  )
                };
              }) || []
            };
          }
          
          // Otherwise, update it in the document type
          return {
            ...docType,
            dataElements: docType.dataElements.map(element => 
              element.id === dataElementId ? { ...element, ...updates } : element
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