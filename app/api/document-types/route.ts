import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

/**
 * GET - Fetch all document types
 */
export async function GET() {
  try {
    const documentTypes = await configService.getAllDocumentTypes();
    return NextResponse.json(documentTypes);
  } catch (error: any) {
    console.error('Error fetching document types:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch document types'
      },
      { status: 500 }
    );
  }
} 