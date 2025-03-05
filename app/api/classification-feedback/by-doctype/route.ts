import { NextResponse } from 'next/server';
import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
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

export async function GET(request: Request) {
  try {
    // Get the URL object from the request
    const url = new URL(request.url);
    
    // Get the docTypeId from the query parameters
    const docTypeId = url.searchParams.get('docTypeId');
    
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
    
    let feedbackItems = [];
    
    if (docTypeId) {
      // If docTypeId is provided, use GSI to query for specific doc type
      const scanParams = {
        TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
        FilterExpression: 'contains(correctedDocumentType, :docType)',
        ExpressionAttributeValues: {
          ':docType': { S: docTypeId }
        }
      };
      
      const scanResponse = await dynamoDb.send(
        new ScanCommand(scanParams)
      );
      
      // Process results
      feedbackItems = (scanResponse.Items || []).map(item => unmarshall(item));
    } else {
      // If no docTypeId, get most recent feedback (limited to 100)
      const scanParams = {
        TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
        Limit: 100,
        ScanIndexForward: false
      };
      
      const scanResponse = await dynamoDb.send(
        new ScanCommand(scanParams)
      );
      
      // Process results
      feedbackItems = (scanResponse.Items || []).map(item => unmarshall(item));
    }
    
    // Transform the items for the frontend
    const transformedItems = feedbackItems.map(item => ({
      id: item.id,
      documentId: item.documentId,
      originalType: item.originalClassification?.documentType || null,
      correctedType: item.correctedDocumentType,
      documentSubType: item.documentSubType || 'General',
      trained: item.hasBeenUsedForTraining || false,
      timestamp: item.timestamp,
      confidence: item.originalClassification?.confidence || 0
    }));
    
    // Sort by timestamp (newest first)
    transformedItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Return the feedback items
    return NextResponse.json(transformedItems);
  } catch (error) {
    console.error("Error retrieving classification feedback:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
} 