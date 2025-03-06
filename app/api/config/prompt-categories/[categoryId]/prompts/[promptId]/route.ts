import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

export async function GET(
  request: Request,
  { params }: { params: { categoryId: string; promptId: string } }
) {
  try {
    const prompts = await configService.getPrompts(params.categoryId);
    const prompt = prompts.find(p => p.id === params.promptId);
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(prompt);
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { categoryId: string; promptId: string } }
) {
  try {
    const updates = await request.json();
    await configService.updatePrompt(params.categoryId, params.promptId, updates);
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
    await configService.deletePrompt(params.categoryId, params.promptId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
} 