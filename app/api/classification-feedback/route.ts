import { NextResponse } from 'next/server';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ClassificationFeedback, ClassificationResult } from '@/lib/types';

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

// In-memory storage for fallback (when DynamoDB has issues)
const inMemoryFeedback: ClassificationFeedback[] = [];

interface FeedbackRequestBody {
  documentId: string;
  originalClassification: ClassificationResult | null;
  correctedDocumentType: string | null;
  feedbackSource: 'auto' | 'manual' | 'review';
  timestamp: number;
}

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body: FeedbackRequestBody = await request.json();
    
    // Validate required fields
    if (!body.documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    // Create the feedback record
    const feedbackId = uuidv4();
    const feedbackRecord: ClassificationFeedback = {
      id: feedbackId,
      documentId: body.documentId,
      originalClassification: body.originalClassification,
      correctedDocumentType: body.correctedDocumentType,
      feedbackSource: body.feedbackSource,
      timestamp: body.timestamp || Date.now(),
      hasBeenUsedForTraining: false
    };

    // Get the DynamoDB table name from environment
    const feedbackTableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE;
    
    if (!feedbackTableName) {
      console.warn('DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE environment variable is not set.');
      
      // Use in-memory storage as fallback
      inMemoryFeedback.push(feedbackRecord);
      
      return NextResponse.json({
        success: true,
        message: 'Feedback received (stored in memory - table name not configured)',
        feedbackId,
        inMemory: true
      });
    }
    
    try {
      // Log what we're doing for diagnostics
      console.log(`Attempting to store feedback in DynamoDB table: ${feedbackTableName}`);
      
      // Set up DynamoDB client with AWS credentials
      const dynamoClient = new DynamoDBClient(getAwsCredentials());
      
      // Prepare the item for DynamoDB
      const item = {
        id: { S: feedbackRecord.id },
        documentId: { S: feedbackRecord.documentId },
        originalClassificationType: feedbackRecord.originalClassification 
          ? { S: feedbackRecord.originalClassification.documentType } 
          : { NULL: true },
        originalClassificationConfidence: feedbackRecord.originalClassification 
          ? { N: feedbackRecord.originalClassification.confidence.toString() } 
          : { NULL: true },
        originalClassificationModelId: feedbackRecord.originalClassification?.modelId 
          ? { S: feedbackRecord.originalClassification.modelId } 
          : { NULL: true },
        correctedDocumentType: feedbackRecord.correctedDocumentType 
          ? { S: feedbackRecord.correctedDocumentType } 
          : { NULL: true },
        feedbackSource: { S: feedbackRecord.feedbackSource },
        timestamp: { N: feedbackRecord.timestamp.toString() },
        hasBeenUsedForTraining: { BOOL: feedbackRecord.hasBeenUsedForTraining }
      };
      
      // Store in DynamoDB
      console.log('Sending PutItemCommand to DynamoDB...');
      const result = await dynamoClient.send(
        new PutItemCommand({
          TableName: feedbackTableName,
          Item: item
        })
      );
      
      console.log('Classification feedback stored in DynamoDB successfully:', feedbackId);
      
      return NextResponse.json({
        success: true,
        message: 'Feedback stored successfully in DynamoDB',
        feedbackId
      });
    } catch (dbError) {
      console.error('DynamoDB Error:', dbError);
      
      // Store in memory as fallback on error
      inMemoryFeedback.push(feedbackRecord);
      
      return NextResponse.json({
        success: true,
        message: 'Feedback received (stored in memory due to DynamoDB error)',
        feedbackId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
        inMemory: true
      });
    }
  } catch (error) {
    console.error('Error processing classification feedback:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process classification feedback', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 