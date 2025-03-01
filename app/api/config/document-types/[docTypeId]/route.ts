import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DocumentTypeConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

interface RouteParams {
  params: {
    docTypeId: string;
  };
}

/**
 * GET - Retrieve a document type by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId } = params;
    
    // Get the document type
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    // Load associated sub-types
    const subTypes = await configService.getSubTypesByDocumentType(docTypeId);
    documentType.subTypes = subTypes;
    
    // Load associated data elements
    const elements = await configService.getDataElementsByDocumentType(docTypeId);
    documentType.dataElements = elements;
    
    // Load training datasets
    const datasets = await configService.getTrainingDatasetsByDocumentType(docTypeId);
    documentType.trainingDatasets = datasets;
    
    return NextResponse.json(documentType);
  } catch (error: any) {
    console.error(`Error fetching document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch document type' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update a document type
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId } = params;
    const updates = await request.json() as Partial<DocumentTypeConfig>;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    await configService.updateDocumentType(docTypeId, updates);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error updating document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to update document type' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a document type
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
    
    await configService.deleteDocumentType(docTypeId);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error deleting document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete document type' },
      { status: 500 }
    );
  }
} 