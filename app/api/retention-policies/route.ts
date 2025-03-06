import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

// Initialize the config service
console.log('Initializing DynamoDBConfigService for retention policies API');
const configService = new DynamoDBConfigService();

// This ensures the route doesn't use static optimization, which might cause issues with DynamoDB
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET - Retrieve all retention policies
 */
export async function GET(req: NextRequest) {
  console.log('GET /api/retention-policies - Request received', req.url);
  try {
    console.log('GET /api/retention-policies - Fetching all retention policies');
    const retentionPolicies = await configService.getAllRetentionPolicies();
    console.log(`GET /api/retention-policies - Fetched ${retentionPolicies.length} policies`);
    
    // Add CORS headers
    const response = NextResponse.json(retentionPolicies);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return response;
  } catch (error) {
    console.error('Error fetching retention policies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retention policies', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new retention policy
 */
export async function POST(req: NextRequest) {
  console.log('POST /api/retention-policies - Request received', req.url);
  try {
    console.log('POST /api/retention-policies - Creating new retention policy');
    const policy = await req.json();
    console.log('Policy data received:', policy);
    
    const newPolicy = await configService.addRetentionPolicy(policy);
    console.log('New policy created:', newPolicy);
    
    return NextResponse.json(newPolicy);
  } catch (error) {
    console.error('Error creating retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to create retention policy', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update an existing retention policy
 */
export async function PUT(req: NextRequest) {
  console.log('PUT /api/retention-policies - Request received', req.url);
  try {
    console.log('PUT /api/retention-policies - Updating retention policy');
    const data = await req.json();
    console.log('PUT data received:', data);
    
    const { id, ...updates } = data;
    
    if (!id) {
      console.error('PUT /api/retention-policies - Missing ID in request');
      return NextResponse.json(
        { error: 'Policy ID is required for updates' },
        { status: 400 }
      );
    }
    
    console.log(`Updating policy with ID: ${id}`, updates);
    await configService.updateRetentionPolicy(id, updates);
    console.log(`Successfully updated policy ${id}`);
    
    // Return the updated policy
    const updatedPolicies = await configService.getAllRetentionPolicies();
    const updatedPolicy = updatedPolicies.find(p => p.id === id);
    
    return NextResponse.json({ success: true, policy: updatedPolicy });
  } catch (error) {
    console.error('Error updating retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to update retention policy', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a retention policy
 */
export async function DELETE(req: NextRequest) {
  console.log('DELETE /api/retention-policies - Request received', req.url);
  try {
    console.log('DELETE /api/retention-policies - Deleting retention policy');
    const data = await req.json();
    console.log('DELETE data received:', data);
    
    const { id } = data;
    
    if (!id) {
      console.error('DELETE /api/retention-policies - Missing ID in request');
      return NextResponse.json(
        { error: 'Policy ID is required for deletion' },
        { status: 400 }
      );
    }
    
    console.log(`Deleting policy with ID: ${id}`);
    await configService.deleteRetentionPolicy(id);
    console.log(`Successfully deleted policy ${id}`);
    
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to delete retention policy', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS - Handle preflight requests for CORS
 */
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 }); // No content
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
} 