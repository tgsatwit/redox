import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DocumentTypeConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

/**
 * GET - Retrieve all document types
 */
export async function GET() {
  try {
    const documentTypes = await configService.getAllDocumentTypes();
    return NextResponse.json(documentTypes);
  } catch (error: any) {
    console.error('Error fetching document types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document types' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new document type
 */
export async function POST(request: NextRequest) {
  try {
    const documentType = await request.json() as Omit<DocumentTypeConfig, 'id'>;
    const newDocType = await configService.createDocumentType(documentType);
    return NextResponse.json(newDocType);
  } catch (error: any) {
    console.error('Error creating document type:', error);
    return NextResponse.json(
      { error: 'Failed to create document type' },
      { status: 500 }
    );
  }
} 