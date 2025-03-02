import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { AppConfig } from '@/lib/types';

// Default values from config-store-db.ts
import { initialConfig } from '@/lib/config-store-db';

const configService = new DynamoDBConfigService();

/**
 * Helper function to check if an error is related to AWS permissions
 */
function isPermissionError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || '';
  return (
    errorMessage.includes('AccessDeniedException') || 
    errorMessage.includes('not authorized to perform') ||
    (error.__type && error.__type.includes('AccessDeniedException'))
  );
}

/**
 * Helper function to check if an error is related to missing DynamoDB indexes
 */
function isIndexError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || '';
  return (
    error.name === 'ValidationException' && 
    errorMessage.includes('specified index') && 
    errorMessage.includes('does not have')
  );
}

/**
 * Safely execute a promise and handle permission errors
 * @returns An object with result, error and isPermissionError flags
 */
async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<{ result: T; error: Error | null; isPermissionError: boolean; isIndexError: boolean }> {
  try {
    const result = await operation();
    return { result, error: null, isPermissionError: false, isIndexError: false };
  } catch (error: any) {
    const permissionIssue = isPermissionError(error);
    const indexIssue = isIndexError(error);
    
    console.warn(
      permissionIssue 
        ? `Permission error during operation: ${error.message}` 
        : indexIssue
        ? `Index error during operation: ${error.message}`
        : `Error during operation: ${error.message}`
    );
    
    return { 
      result: fallback, 
      error: error instanceof Error ? error : new Error(error?.message || 'Unknown error'),
      isPermissionError: permissionIssue,
      isIndexError: indexIssue
    };
  }
}

/**
 * POST - Reset configuration to defaults
 */
export async function POST() {
  let hasPermissionIssues = false;
  let hasIndexIssues = false;
  let successfulOperations = false;
  const warnings: string[] = [];
  
  try {
    // Get the default configuration from initialConfig imported above
    const defaultConfig: AppConfig = initialConfig;
    
    // Update the overall app configuration (now with empty document types)
    const { error: configUpdateError, isPermissionError: configUpdatePermissionError, isIndexError: configUpdateIndexError } = 
      await safeExecute(() => configService.updateAppConfig(defaultConfig), null);
    
    if (configUpdateError) {
      if (configUpdatePermissionError) {
        hasPermissionIssues = true;
        warnings.push('Limited permissions: Unable to update app configuration in DynamoDB');
      } else if (configUpdateIndexError) {
        hasIndexIssues = true;
        warnings.push('Schema issue: Unable to update app configuration in DynamoDB due to missing index');
      } else {
        throw configUpdateError;
      }
    } else {
      successfulOperations = true;
    }
    
    // Sync with existing document types from the document-types table
    const { result: documentTypes, error: docTypesError, isPermissionError: docTypesPermissionError, isIndexError: docTypesIndexError } = 
      await safeExecute(() => configService.getAllDocumentTypes(), []);
    
    if (docTypesError && !docTypesPermissionError) {
      throw docTypesError;
    }
    
    if (docTypesPermissionError) {
      hasPermissionIssues = true;
      warnings.push('Limited permissions: Unable to retrieve document types from DynamoDB');
    }
    
    if (docTypesIndexError) {
      hasIndexIssues = true;
      warnings.push('Schema issue: Unable to retrieve document types from DynamoDB due to missing index');
    }
    
    if (documentTypes && documentTypes.length > 0) {
      // If we have document types in the table, include them in the config
      defaultConfig.documentTypes = documentTypes;
      successfulOperations = true;
      
      // For each document type, load its sub-types and elements
      for (const docType of documentTypes) {
        // Load sub-types
        const { result: subTypes, error: subTypesError, isPermissionError: subTypesPermissionError, isIndexError: subTypesIndexError } = 
          await safeExecute(() => configService.getSubTypesByDocumentType(docType.id), []);
        
        if (subTypesPermissionError) {
          hasPermissionIssues = true;
          warnings.push(`Limited permissions: Unable to retrieve sub-types for document type ${docType.name}`);
        } else if (subTypesIndexError) {
          hasIndexIssues = true;
          warnings.push(`Schema issue: Unable to retrieve sub-types for document type ${docType.name} due to missing index`);
        } else if (subTypesError) {
          console.warn(`Error fetching sub-types for document type ${docType.id}:`, subTypesError.message);
        } else {
          docType.subTypes = subTypes;
          successfulOperations = true;
          
          // For each sub-type, load its elements
          if (docType.subTypes && docType.subTypes.length > 0) {
            for (const subType of docType.subTypes) {
              const { result: subTypeElements, error: elementsError, isPermissionError: elementsPermissionError, isIndexError: elementsIndexError } = 
                await safeExecute(() => configService.getDataElementsBySubType(subType.id), []);
              
              if (elementsPermissionError) {
                hasPermissionIssues = true;
                warnings.push(`Limited permissions: Unable to retrieve elements for sub-type ${subType.name}`);
              } else if (elementsIndexError) {
                hasIndexIssues = true;
                warnings.push(`Schema issue: Unable to retrieve elements for sub-type ${subType.name} due to missing index`);
              } else if (elementsError) {
                console.warn(`Error fetching elements for sub-type ${subType.id}:`, elementsError.message);
              } else {
                subType.dataElements = subTypeElements;
                successfulOperations = true;
              }
            }
          }
        }
        
        // Load document type data elements
        const { result: docElements, error: docElementsError, isPermissionError: docElementsPermissionError, isIndexError: docElementsIndexError } = 
          await safeExecute(() => configService.getDataElementsByDocumentType(docType.id), []);
        
        if (docElementsPermissionError) {
          hasPermissionIssues = true;
          warnings.push(`Limited permissions: Unable to retrieve elements for document type ${docType.name}`);
        } else if (docElementsIndexError) {
          hasIndexIssues = true;
          warnings.push(`Schema issue: Unable to retrieve elements for document type ${docType.name} due to missing index`);
        } else if (docElementsError) {
          console.warn(`Error fetching elements for document type ${docType.id}:`, docElementsError.message);
        } else {
          docType.dataElements = docElements;
          successfulOperations = true;
        }
        
        // Load training datasets
        const { result: datasets, error: datasetsError, isPermissionError: datasetsPermissionError, isIndexError: datasetsIndexError } = 
          await safeExecute(() => configService.getTrainingDatasetsByDocumentType(docType.id), []);
        
        if (datasetsPermissionError) {
          hasPermissionIssues = true;
          warnings.push(`Limited permissions: Unable to retrieve training datasets for document type ${docType.name}`);
        } else if (datasetsIndexError) {
          hasIndexIssues = true;
          warnings.push(`Schema issue: Unable to retrieve training datasets for document type ${docType.name} due to missing index`);
        } else if (datasetsError) {
          console.warn(`Error fetching training datasets for document type ${docType.id}:`, datasetsError.message);
        } else {
          docType.trainingDatasets = datasets;
          successfulOperations = true;
          
          // For each dataset, load examples
          if (docType.trainingDatasets && docType.trainingDatasets.length > 0) {
            for (const dataset of docType.trainingDatasets) {
              const { result: examples, error: examplesError, isPermissionError: examplesPermissionError, isIndexError: examplesIndexError } = 
                await safeExecute(() => configService.getTrainingExamplesByDataset(docType.id, dataset.id), []);
              
              if (examplesPermissionError) {
                hasPermissionIssues = true;
                warnings.push(`Limited permissions: Unable to retrieve training examples for dataset ${dataset.name}`);
              } else if (examplesIndexError) {
                hasIndexIssues = true;
                warnings.push(`Schema issue: Unable to retrieve training examples for dataset ${dataset.name} due to missing index`);
              } else if (examplesError) {
                console.warn(`Error fetching training examples for dataset ${dataset.id}:`, examplesError.message);
              } else {
                dataset.examples = examples;
                successfulOperations = true;
              }
            }
          }
        }
      }
      
      // Final update of the app config
      const { error: finalUpdateError, isPermissionError: finalUpdatePermissionError, isIndexError: finalUpdateIndexError } = 
        await safeExecute(() => configService.updateAppConfig(defaultConfig), null);
      
      if (finalUpdateError) {
        if (finalUpdatePermissionError) {
          hasPermissionIssues = true;
          warnings.push('Limited permissions: Unable to update final app configuration in DynamoDB');
        } else if (finalUpdateIndexError) {
          hasIndexIssues = true;
          warnings.push('Schema issue: Unable to update final app configuration in DynamoDB due to missing index');
        } else {
          throw finalUpdateError;
        }
      } else {
        successfulOperations = true;
      }
    }
    
    // Return appropriate response based on operation results
    if (hasPermissionIssues || hasIndexIssues) {
      if (successfulOperations) {
        return NextResponse.json({ 
          success: true, 
          partialSuccess: true,
          warning: hasPermissionIssues 
            ? 'Some operations completed successfully, but permission issues prevented full synchronization'
            : 'Some operations completed successfully, but missing DynamoDB indexes prevented full synchronization',
          details: warnings
        });
      } else {
        return NextResponse.json({
          success: false,
          warning: hasPermissionIssues 
            ? 'Unable to complete any synchronization operations due to permission issues'
            : 'Unable to complete any synchronization operations due to missing DynamoDB indexes',
          details: warnings
        }, { status: hasPermissionIssues ? 403 : 400 });
      }
    } else {
      return NextResponse.json({ success: true });
    }
  } catch (error: any) {
    console.error('Error resetting configuration to defaults:', error);
    
    // Check if this is a permission issue that wasn't caught earlier
    if (isPermissionError(error)) {
      return NextResponse.json({
        success: false,
        partialSuccess: successfulOperations,
        warning: 'Configuration sync failed due to permission issues',
        error: error.message || 'Access denied'
      }, { status: 403 });
    }
    
    // Check if this is an index issue that wasn't caught earlier
    if (isIndexError(error)) {
      return NextResponse.json({
        success: false,
        partialSuccess: successfulOperations,
        warning: 'Configuration sync failed due to missing DynamoDB indexes',
        error: error.message || 'Schema validation failed'
      }, { status: 400 });
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to reset configuration'
      },
      { status: 500 }
    );
  }
} 