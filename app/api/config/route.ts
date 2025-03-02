import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { AppConfig, DocumentTypeConfig, DocumentSubTypeConfig, DataElementConfig } from '@/lib/types';
import { createId } from '@paralleldrive/cuid2';

const configService = new DynamoDBConfigService();

/**
 * GET - Retrieve app configuration
 */
export async function GET() {
  try {
    // First try to get app config
    let appConfig = await configService.getAppConfig();
    
    // If no app config exists yet, we need to load document types from separate tables
    if (!appConfig) {
      const documentTypes = await configService.getAllDocumentTypes();
      
      // For each document type, load its sub-types and elements
      for (const docType of documentTypes) {
        // Load sub-types
        docType.subTypes = await configService.getSubTypesByDocumentType(docType.id);
        
        // For each sub-type, load its elements
        if (docType.subTypes) {
          for (const subType of docType.subTypes) {
            // Load data elements for sub-type
            try {
              const subTypeElements = await configService.getDataElementsBySubType(subType.id);
              subType.dataElements = subTypeElements;
            } catch (error) {
              console.error('Error loading data elements for sub-type:', error);
            }
          }
        }
        
        // Load document type data elements
        docType.dataElements = await configService.getDataElementsByDocumentType(docType.id);
        
        // Load training datasets
        docType.trainingDatasets = await configService.getTrainingDatasetsByDocumentType(docType.id);
        
        // For each dataset, load examples
        if (docType.trainingDatasets) {
          for (const dataset of docType.trainingDatasets) {
            const examples = await configService.getTrainingExamplesByDataset(docType.id, dataset.id);
            dataset.examples = examples;
          }
        }
      }
      
      // Create initial app config
      appConfig = {
        documentTypes,
        defaultRedactionSettings: {
          redactPII: true,
          redactFinancial: true
        }
      };
      
      // Store the assembled config for future use
      await configService.updateAppConfig(appConfig);
    }
    
    // If appConfig is an object with a config property, return the config property
    // This handles the case where DynamoDB returns {id, config, updatedAt}
    if (appConfig && typeof appConfig === 'object' && 'config' in appConfig) {
      return NextResponse.json(appConfig.config);
    }
    
    // Otherwise return the appConfig directly
    return NextResponse.json(appConfig);
  } catch (error: any) {
    console.error('Error fetching app configuration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch app configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST - Update app configuration
 */
export async function POST(request: NextRequest) {
  try {
    const appConfig = await request.json() as AppConfig;
    await configService.updateAppConfig(appConfig);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating app configuration:', error);
    return NextResponse.json(
      { error: 'Failed to update app configuration' },
      { status: 500 }
    );
  }
} 