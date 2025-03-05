import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

export async function GET() {
  try {
    const retentionPolicies = await configService.getAllRetentionPolicies();
    return NextResponse.json(retentionPolicies);
  } catch (error) {
    console.error('Error fetching retention policies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retention policies' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const policy = await request.json();
    const newPolicy = await configService.addRetentionPolicy(policy);
    return NextResponse.json(newPolicy);
  } catch (error) {
    console.error('Error creating retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to create retention policy' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...updates } = await request.json();
    await configService.updateRetentionPolicy(id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to update retention policy' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await configService.deleteRetentionPolicy(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting retention policy:', error);
    return NextResponse.json(
      { error: 'Failed to delete retention policy' },
      { status: 500 }
    );
  }
} 