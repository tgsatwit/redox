import { NextResponse } from 'next/server';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ClassificationFeedback, ClassificationResult } from '@/lib/types';
import { marshall } from '@aws-sdk/util-dynamodb';
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

// In-memory storage for fallback (when DynamoDB has issues)
const inMemoryFeedback: ClassificationFeedback[] = [];

interface FeedbackRequestBody {
  documentId: string;
  originalClassification: ClassificationResult | null;
  correctedDocumentType: string | null;
  documentSubType?: string;
  feedbackSource: 'auto' | 'manual' | 'review';
  timestamp: number;
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    const { 
      documentId, 
      originalClassification, 
      correctedDocumentType,
      documentSubType,
      feedbackSource = 'manual',
      timestamp = Date.now() 
    } = body
    
    // Validate required fields
    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      )
    }
    
    // Create feedback item
    const feedbackItem = {
      id: uuidv4(),
      documentId,
      originalClassification,
      correctedDocumentType,
      documentSubType: documentSubType || 'General',
      feedbackSource,
      timestamp,
      hasBeenUsedForTraining: false
    }
    
    // Check for required environment variables
    if (!process.env.APP_REGION || !process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE) {
      return NextResponse.json(
        { error: "Missing required environment variables: APP_REGION or DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE" },
        { status: 500 }
      )
    }
    
    // Initialize DynamoDB client
    const dynamoDb = new DynamoDBClient({
      ...getAwsCredentials(),
      region: process.env.APP_REGION
    })
    
    // Save feedback to DynamoDB
    await dynamoDb.send(
      new PutItemCommand({
        TableName: process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE,
        Item: marshall(feedbackItem)
      })
    )
    
    // Return success
    return NextResponse.json({
      message: "Classification feedback submitted successfully",
      feedbackId: feedbackItem.id
    })
  } catch (error) {
    console.error("Error submitting classification feedback:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    )
  }
} 