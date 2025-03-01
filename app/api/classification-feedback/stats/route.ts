import { NextResponse } from 'next/server';
import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

// Get AWS credentials from environment
const getAwsCredentials = () => {
  const requiredEnvVars = [
    'AWS_REGION', 
    'AWS_ACCESS_KEY_ID', 
    'AWS_SECRET_ACCESS_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} environment variable is not set`);
    }
  }
  
  return {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
  };
};

export async function GET(request: Request) {
  try {
    // Get the DynamoDB table name from environment
    const feedbackTableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE;
    
    if (!feedbackTableName) {
      console.warn('DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE environment variable is not set.');
      return NextResponse.json({ 
        error: 'DynamoDB table not configured',
        counts: {}
      }, { status: 400 });
    }
    
    try {
      // Set up DynamoDB client with AWS credentials
      const dynamoClient = new DynamoDBClient(getAwsCredentials());
      
      // Scan the table to get all feedback items
      const scanCommand = new ScanCommand({
        TableName: feedbackTableName,
        ProjectionExpression: "correctedDocumentType, originalClassificationType, hasBeenUsedForTraining"
      });
      
      const scanResult = await dynamoClient.send(scanCommand);
      
      // Process the results to get counts by document type
      const stats = {
        totalItems: scanResult.Items?.length || 0,
        untrained: 0,
        trained: 0,
        byDocumentType: {} as Record<string, { total: number, untrained: number, trained: number }>
      };
      
      // Process each item
      scanResult.Items?.forEach(item => {
        const isUsedForTraining = item.hasBeenUsedForTraining?.BOOL === true;
        
        // Increment global counters
        if (isUsedForTraining) {
          stats.trained++;
        } else {
          stats.untrained++;
        }
        
        // Get the document type (either corrected or original)
        const docType = item.correctedDocumentType?.S || item.originalClassificationType?.S || 'Unknown';
        
        // Initialize counter for this document type if it doesn't exist
        if (!stats.byDocumentType[docType]) {
          stats.byDocumentType[docType] = { total: 0, untrained: 0, trained: 0 };
        }
        
        // Increment counters for this document type
        stats.byDocumentType[docType].total++;
        if (isUsedForTraining) {
          stats.byDocumentType[docType].trained++;
        } else {
          stats.byDocumentType[docType].untrained++;
        }
      });
      
      return NextResponse.json({
        success: true,
        stats
      });
    } catch (dbError) {
      console.error('DynamoDB Error:', dbError);
      
      return NextResponse.json({
        error: 'Failed to retrieve feedback statistics',
        details: dbError instanceof Error ? dbError.message : String(dbError)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error retrieving feedback statistics:', error);
    
    return NextResponse.json({
      error: 'Failed to retrieve feedback statistics',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 