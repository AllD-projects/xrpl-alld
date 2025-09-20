import { NextRequest, NextResponse } from 'next/server';
import { initScheduler, stopScheduler } from '@/lib/scheduler-init';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'start') {
      initScheduler();
      return NextResponse.json({
        success: true,
        message: 'Escrow scheduler started'
      });
    } else if (action === 'stop') {
      stopScheduler();
      return NextResponse.json({
        success: true,
        message: 'Escrow scheduler stopped'
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "start" or "stop"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Scheduler control error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Scheduler API endpoint',
    actions: {
      start: 'POST with { "action": "start" }',
      stop: 'POST with { "action": "stop" }'
    }
  });
}