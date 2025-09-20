import { initScheduler } from './scheduler-init';

// 서버 초기화 플래그
let isInitialized = false;

/**
 * 서버 시작 시 한 번만 실행되는 초기화 함수
 */
export function initializeServer() {
  if (isInitialized) {
    return;
  }

  console.log('🚀 Initializing XRPL server...');

  // 개발 환경에서만 스케줄러 자동 시작
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode detected, starting escrow scheduler...');
    initScheduler();
  }

  isInitialized = true;
  console.log('✅ Server initialization complete');
}

// 모듈이 처음 로드될 때 자동 실행
initializeServer();