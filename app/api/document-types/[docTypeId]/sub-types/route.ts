import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all sub-types for a document type
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
    
    const subTypes = await configService.getSubTypesByDocumentType(docTypeId);
    return NextResponse.json(subTypes);
  } catch (error: any) {
    console.error('Error fetching sub-types:', error);
    
    // Handle not found gracefully
    if (error.message?.includes('not found')) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch sub-types'
      },
      { status: 500 }
    );
  }
} 