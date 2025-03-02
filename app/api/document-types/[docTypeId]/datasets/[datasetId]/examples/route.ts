import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all training examples for a specific dataset
 */
export async function GET(
  request: Request,
  { params }: { params: { docTypeId: string; datasetId: string } }
) {
  try {
    const { docTypeId, datasetId } = params;
    
    if (!docTypeId || !datasetId) {
      return NextResponse.json(
        { error: 'Document type ID and dataset ID are required' },
        { status: 400 }
      );
    }
    
    const examples = await configService.getTrainingExamplesByDataset(docTypeId, datasetId);
    return NextResponse.json(examples);
  } catch (error: any) {
    console.error('Error fetching training examples:', error);
    
    // Handle not found gracefully
    if (error.message?.includes('not found')) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch training examples'
      },
      { status: 500 }
    );
  }
} 