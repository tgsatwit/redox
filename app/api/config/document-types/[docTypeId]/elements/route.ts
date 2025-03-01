import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { DataElementConfig } from '@/lib/types';

const configService = new DynamoDBConfigService();

interface RouteParams {
  params: {
    docTypeId: string;
  };
}

/**
 * GET - Retrieve all data elements for a document type
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
    
    const elements = await configService.getDataElementsByDocumentType(docTypeId);
    return NextResponse.json(elements);
  } catch (error: any) {
    console.error(`Error fetching data elements for document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch data elements' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new data element for a document type
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
    
    const dataElement = await request.json() as Omit<DataElementConfig, 'id'>;
    const newElement = await configService.createDataElement(docTypeId, dataElement);
    
    return NextResponse.json(newElement);
  } catch (error: any) {
    console.error(`Error creating data element for document type ${params.docTypeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to create data element' },
      { status: 500 }
    );
  }
} 