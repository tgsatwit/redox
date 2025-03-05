import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

export async function GET(
  request: Request,
  { params }: { params: { categoryId: string } }
) {
  try {
    const prompts = await configService.getPrompts(params.categoryId);
    return NextResponse.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { categoryId: string } }
) {
  try {
    const prompt = await request.json();
    const newPrompt = await configService.addPrompt(params.categoryId, prompt);
    return NextResponse.json(newPrompt);
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { categoryId: string; promptId: string } }
) {
  try {
    const { promptId, ...updates } = await request.json();
    await configService.updatePrompt(params.categoryId, promptId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { categoryId: string; promptId: string } }
) {
  try {
    const { promptId } = await request.json();
    await configService.deletePrompt(params.categoryId, promptId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
} 