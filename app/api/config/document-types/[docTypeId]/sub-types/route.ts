import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DocumentSubTypeConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

interface RouteParams {
  params: {
    docTypeId: string;
  };
}

/**
 * GET - Retrieve all sub-types for a document type
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId } = params;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    const subTypes = await configService.getSubTypesByDocumentType(docTypeId);
    
    // For each sub-type, load its elements
    for (const subType of subTypes) {
      const elements = await configService.getDataElementsBySubType(subType.id);
      subType.dataElements = elements;
    }
    
    return NextResponse.json(subTypes);
  } catch (error: any) {
    console.error(`Error fetching sub-types for document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-types' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new sub-type for a document type
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId } = params;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    const subType = await request.json() as Omit<DocumentSubTypeConfig, 'id'>;
    const newSubType = await configService.createSubType(docTypeId, subType);
    
    return NextResponse.json(newSubType);
  } catch (error: any) {
    console.error(`Error creating sub-type for document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to create sub-type' },
      { status: 500 }
    );
  }
} 