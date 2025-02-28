import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    // Just return a success response to verify connectivity
    return NextResponse.json({
      status: "success",
      message: "API connectivity test successful",
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Test endpoint error:", error)
    
    return NextResponse.json(
      { error: "Test endpoint error" },
      { status: 500 }
    )
  }
} 