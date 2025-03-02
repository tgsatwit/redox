import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all training datasets for a document type
 */
export async function GET(
  request: Request,
  { params }: { params: { docTypeId: string } }
) {
  try {
    const { docTypeId } = params;
    
    if (!docTypeId) {
      return NextResponse.json(
        { error: 'Document type ID is required' },
        { status: 400 }
      );
    }
    
    const datasets = await configService.getTrainingDatasetsByDocumentType(docTypeId);
    return NextResponse.json(datasets);
  } catch (error: any) {
    console.error('Error fetching training datasets:', error);
    
    // Handle not found gracefully
    if (error.message?.includes('not found')) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch training datasets'
      },
      { status: 500 }
    );
  }
} 