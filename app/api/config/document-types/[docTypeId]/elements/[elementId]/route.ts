import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DataElementConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

interface RouteParams {
  params: {
    docTypeId: string;
    elementId: string;
  };
}

/**
 * PUT - Update a data element
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId, elementId } = params;
    const updates = await request.json() as Partial<DataElementConfig>;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    await configService.updateDataElement(docTypeId, elementId, updates);
    
    // Return success response
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error updating data element ${params.elementId}:`, error);
    return NextResponse.json(
      { error: 'Failed to update data element' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a data element
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId, elementId } = params;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    await configService.deleteDataElement(docTypeId, elementId);
    
    // Return success response
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error deleting data element ${params.elementId}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete data element' },
      { status: 500 }
    );
  }
} 