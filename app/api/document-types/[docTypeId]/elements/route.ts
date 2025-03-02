import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all data elements for a document type
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
    
    const elements = await configService.getDataElementsByDocumentType(docTypeId);
    return NextResponse.json(elements);
  } catch (error: any) {
    console.error('Error fetching data elements:', error);
    
    // Handle not found gracefully
    if (error.message?.includes('not found')) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch data elements'
      },
      { status: 500 }
    );
  }
} 