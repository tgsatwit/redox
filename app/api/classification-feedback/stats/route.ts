import { NextResponse } from 'next/server';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { fromEnv } from '@aws-sdk/credential-providers';

// Function to get AWS credentials
function getAwsCredentials() {
  // In production, AWS credentials will be available from the environment
  if (process.env.NODE_ENV === 'production') {
    return fromEnv();
  }
  
  // In development, use local credentials from environment variables
  return {
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
    },
    region: process.env.APP_REGION || 'us-east-1'
  };
}

export async function GET() {
  try {
    // Check for required environment variables
    if (!process.env.APP_REGION || !process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE) {
      return NextResponse.json(
        { error: "Missing required environment variables: APP_REGION or DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE" },
        { status: 500 }
      );
    }
    
    // Initialize DynamoDB client with credentials
    const dynamoDb = new DynamoDBClient({
      ...getAwsCredentials(),
      region: process.env.APP_REGION
    });
    
    // Scan the table to get all feedback items
    const scanResponse = await dynamoDb.send(
      new ScanCommand({
        TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
        // Get additional attributes to group by sub-type
        ProjectionExpression: "id, correctedDocumentType, originalClassification, hasBeenUsedForTraining, documentSubType",
      })
    );
    
    console.log("DynamoDB scan response:", JSON.stringify(scanResponse, null, 2));
    
    // Process items into usable stats
    const items = scanResponse.Items || [];
    
    // Count stats:
    // - Total items
    // - Items already used for training
    // - Items not yet used for training
    // - Group by document type
    const stats = {
      total: items.length,
      trained: 0,
      untrained: 0,
      byDocumentType: {} as Record<string, {
        total: number,
        trained: number,
        untrained: number,
        bySubType: Record<string, {
          total: number,
          trained: number,
          untrained: number
        }>
      }>,
    };
    
    // Process each feedback item
    items.forEach(item => {
      // Check if the item has been used for training
      const hasBeenUsed = item.hasBeenUsedForTraining?.BOOL === true;
      
      // Update the global counts
      if (hasBeenUsed) {
        stats.trained++;
      } else {
        stats.untrained++;
      }
      
      // Get the document type from the corrected type, or the original classification if available
      let documentType = item.correctedDocumentType?.S || 
        (item.originalClassification?.M?.documentType?.S) || 
        'Unknown';
      
      // Get the document sub-type if available
      const documentSubType = item.documentSubType?.S || 'General';
      
      // Initialize the document type and sub-type stats if they don't exist
      if (!stats.byDocumentType[documentType]) {
        stats.byDocumentType[documentType] = {
          total: 0,
          trained: 0,
          untrained: 0,
          bySubType: {} 
        };
      }
      
      if (!stats.byDocumentType[documentType].bySubType[documentSubType]) {
        stats.byDocumentType[documentType].bySubType[documentSubType] = {
          total: 0,
          trained: 0,
          untrained: 0
        };
      }
      
      // Update the document type counts
      stats.byDocumentType[documentType].total++;
      if (hasBeenUsed) {
        stats.byDocumentType[documentType].trained++;
      } else {
        stats.byDocumentType[documentType].untrained++;
      }
      
      // Update the sub-type counts
      stats.byDocumentType[documentType].bySubType[documentSubType].total++;
      if (hasBeenUsed) {
        stats.byDocumentType[documentType].bySubType[documentSubType].trained++;
      } else {
        stats.byDocumentType[documentType].bySubType[documentSubType].untrained++;
      }
    });
    
    // Return the stats as JSON
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error retrieving classification feedback stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
} 