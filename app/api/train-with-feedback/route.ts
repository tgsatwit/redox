import { NextResponse } from 'next/server';
import { 
  DynamoDBClient, 
  ScanCommand, 
  UpdateItemCommand 
} from '@aws-sdk/client-dynamodb';
import { 
  ComprehendClient, 
  CreateDocumentClassifierCommand 
} from '@aws-sdk/client-comprehend';
import { v4 as uuidv4 } from 'uuid';
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
    region: process.env.APP_REGION || 'ap-southeast-2'
  };
}

interface TrainRequest {
  documentType: string;
  documentSubType?: string;
  count?: number;
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { documentType, documentSubType, count } = body;
    
    // Validate required fields
    if (!documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }
    
    // Check for required environment variables
    if (!process.env.APP_REGION || !process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE) {
      return NextResponse.json(
        { error: 'Missing required environment variables: APP_REGION or DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE' },
        { status: 500 }
      );
    }
    
    // Initialize DynamoDB and Comprehend clients
    const dynamoDb = new DynamoDBClient({
      ...getAwsCredentials(),
      region: process.env.APP_REGION
    });
    
    const comprehendClient = new ComprehendClient({
      ...getAwsCredentials(),
      region: process.env.APP_REGION
    });
    
    // Build the filter expression for scanning
    let filterExpression = 'hasBeenUsedForTraining = :false';
    let expressionAttributeValues: any = {
      ':false': { BOOL: false }
    };
    
    // Add document type to filter if not "all"
    if (documentType !== 'all') {
      // If documentType is "all", we don't filter by type
      filterExpression += ' AND (correctedDocumentType = :docType OR originalClassification.documentType = :docType)';
      expressionAttributeValues[':docType'] = { S: documentType };
    }
    
    // Add sub-type to filter if provided
    if (documentSubType) {
      filterExpression += ' AND documentSubType = :subType';
      expressionAttributeValues[':subType'] = { S: documentSubType };
    }
    
    // Limit the number of items to retrieve if count is specified
    const scanParams: any = {
      TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };
    
    if (count && count > 0) {
      scanParams.Limit = count;
    }
    
    // Scan DynamoDB for feedback items
    const scanResponse = await dynamoDb.send(new ScanCommand(scanParams));
    
    if (!scanResponse.Items || scanResponse.Items.length === 0) {
      return NextResponse.json(
        { message: 'No feedback items found for training' },
        { status: 200 }
      );
    }
    
    // Log the items for debugging
    console.log(`Found ${scanResponse.Items.length} feedback items for training`, scanResponse.Items);
    
    // Process items for training
    const trainingItems = scanResponse.Items.map(item => {
      // Get the document type from corrected type or original classification
      const itemDocType = item.correctedDocumentType?.S || 
        (item.originalClassification?.M?.documentType?.S) || 
        'Unknown';
      
      // Get the sub-type if available
      const itemSubType = item.documentSubType?.S || 'General';
      
      return {
        id: item.id.S,
        documentType: itemDocType,
        documentSubType: itemSubType,
        // Extract other relevant data for training
        // ...
      };
    });
    
    // Generate a unique job ID for this training job
    const trainingJobId = uuidv4();
    
    // In development, we just mark the items as used
    // In production, we would initiate the AWS Comprehend training job
    if (process.env.NODE_ENV === 'development') {
      // For each item, update hasBeenUsedForTraining to true
      for (const item of trainingItems) {
        if (!item.id) continue; // Skip items with undefined IDs
        
        await dynamoDb.send(
          new UpdateItemCommand({
            TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
            Key: {
              id: { S: item.id }
            },
            UpdateExpression: 'SET hasBeenUsedForTraining = :true, trainingJobId = :jobId, trainingTimestamp = :timestamp',
            ExpressionAttributeValues: {
              ':true': { BOOL: true },
              ':jobId': { S: trainingJobId },
              ':timestamp': { N: Date.now().toString() }
            }
          })
        );
      }
      
      return NextResponse.json({
        message: 'Training job initiated (development mode - items marked as used)',
        jobId: trainingJobId,
        processedCount: trainingItems.length,
        documentType,
        documentSubType
      });
    } else {
      // In production, we would:
      // 1. Prepare the training data in the format required by AWS Comprehend
      // 2. Start a training job with AWS Comprehend
      // 3. Update the feedback items with the training job ID
      
      // Example (not implemented):
      /*
      const trainResponse = await comprehendClient.send(
        new CreateDocumentClassifierCommand({
          DocumentClassifierName: `document-classifier-${trainingJobId}`,
          DataAccessRoleArn: process.env.COMPREHEND_ROLE_ARN,
          InputDataConfig: {
            // ... training data configuration
          },
          LanguageCode: 'en'
        })
      );
      
      // Update items with training job ID
      // ...
      */
      
      // For now, just return a simulated response
      return NextResponse.json({
        message: 'Training job would be initiated in production',
        jobId: trainingJobId,
        processedCount: trainingItems.length,
        documentType,
        documentSubType
      });
    }
  } catch (error) {
    console.error('Error training with feedback:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 