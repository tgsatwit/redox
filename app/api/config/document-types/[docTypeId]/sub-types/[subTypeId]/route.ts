import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DocumentSubTypeConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

interface RouteParams {
  params: {
    docTypeId: string;
    subTypeId: string;
  };
}

/**
 * GET - Retrieve a specific sub-type
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId, subTypeId } = params;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    // Get the sub-type
    const subType = await configService.getSubType(subTypeId);
    if (!subType) {
      return NextResponse.json(
        { error: 'Sub-type not found' },
        { status: 404 }
      );
    }
    
    // Load elements for this sub-type
    const elements = await configService.getDataElementsBySubType(subTypeId);
    subType.dataElements = elements;
    
    return NextResponse.json(subType);
  } catch (error: any) {
    console.error(`Error fetching sub-type ${params.subTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-type' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update a sub-type
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId, subTypeId } = params;
    const updates = await request.json() as Partial<DocumentSubTypeConfig>;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    // Check if sub-type exists
    const subType = await configService.getSubType(subTypeId);
    if (!subType) {
      return NextResponse.json(
        { error: 'Sub-type not found' },
        { status: 404 }
      );
    }
    
    await configService.updateSubType(docTypeId, subTypeId, updates);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error updating sub-type ${params.subTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to update sub-type' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a sub-type
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { docTypeId, subTypeId } = params;
    
    // Check if document type exists
    const documentType = await configService.getDocumentType(docTypeId);
    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type not found' },
        { status: 404 }
      );
    }
    
    // Check if sub-type exists
    const subType = await configService.getSubType(subTypeId);
    if (!subType) {
      return NextResponse.json(
        { error: 'Sub-type not found' },
        { status: 404 }
      );
    }
    
    await configService.deleteSubType(docTypeId, subTypeId);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Error deleting sub-type ${params.subTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete sub-type' },
      { status: 500 }
    );
  }
} 