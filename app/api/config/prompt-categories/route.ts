import { NextResponse } from 'next/server';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

const configService = new DynamoDBConfigService();

export async function GET() {
  try {
    const categories = await configService.getAllPromptCategories();
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching prompt categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const category = await request.json();
    const newCategory = await configService.addPromptCategory(category);
    return NextResponse.json(newCategory);
  } catch (error) {
    console.error('Error creating prompt category:', error);
    return NextResponse.json(
      { error: 'Failed to create prompt category' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...updates } = await request.json();
    await configService.updatePromptCategory(id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating prompt category:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt category' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await configService.deletePromptCategory(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt category:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt category' },
      { status: 500 }
    );
  }
} 