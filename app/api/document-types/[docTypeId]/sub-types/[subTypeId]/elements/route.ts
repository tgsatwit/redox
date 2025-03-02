import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all data elements for a specific sub-type
 */
export async function GET(
  request: Request,
  { params }: { params: { docTypeId: string; subTypeId: string } }
) {
  try {
    const { docTypeId, subTypeId } = params;
    
    if (!docTypeId || !subTypeId) {
      return NextResponse.json(
        { error: 'Document type ID and sub-type ID are required' },
        { status: 400 }
      );
    }
    
    const elements = await configService.getDataElementsBySubType(subTypeId);
    return NextResponse.json(elements);
  } catch (error: any) {
    console.error('Error fetching sub-type data elements:', error);
    
    // Handle not found gracefully
    if (error.message?.includes('not found')) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch sub-type data elements'
      },
      { status: 500 }
    );
  }
} 