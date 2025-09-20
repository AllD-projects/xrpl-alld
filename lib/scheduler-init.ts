import { runEscrowScheduler } from './escrow-scheduler';

let intervalId: NodeJS.Timeout | null = null;

/**
 * 스케줄러 초기화 및 주기적 실행
 */
export function initScheduler() {
  // 이미 실행 중인 경우 중복 실행 방지
  if (intervalId) {
    console.log('⚠️ Scheduler already running');
    return;
  }

  console.log('🎯 Initializing escrow scheduler...');

  // 즉시 한 번 실행
  runEscrowScheduler().catch(error => {
    console.error('Initial scheduler run failed:', error);
  });

  // 1분마다 실행 (60초 * 1000밀리초)
  intervalId = setInterval(async () => {
    console.log('⏰ Running scheduled escrow check...');
    try {
      await runEscrowScheduler();
    } catch (error) {
      console.error('Scheduled run failed:', error);
    }
  }, 60 * 1000);

  console.log('✅ Escrow scheduler started (runs every 1 minute)');
}

/**
 * 스케줄러 정지
 */
export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Escrow scheduler stopped');
  }
}

// 프로세스 종료 시 스케줄러 정리
if (typeof process !== 'undefined') {
  process.on('SIGINT', () => {
    stopScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopScheduler();
    process.exit(0);
  });
}