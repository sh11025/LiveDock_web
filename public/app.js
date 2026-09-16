// ==========================================================================
// LiveDock Web · 실시간 스트리밍 서버 모니터링 (초미니멀)
// 가로모드 최적화, 기기 오프라인 감지, 직관적 컬러 그라데이션 탑재
// ==========================================================================

const REFRESH_INTERVAL = 10000; // 10초 주기 자동 갱신
let isFetching = false;
let wakeLockSentinel = null;

// DOM 엘리먼트 참조
const overallBadge = document.getElementById('overall-status');
const overallText = document.getElementById('overall-status-text');
const lastUpdatedTimeEl = document.getElementById('last-updated-time');

/**
 * 스마트폰 화면 항상 켜짐 유지 (Screen Wake Lock API)
 */
async function enableWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (e) {
      // 절전 모드 또는 권한 제한
    }
  }
}

/**
 * 스마트폰 진동 알림 (Vibration API)
 */
function triggerVibration(pattern) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

/**
 * 지연시간(ms) 및 상태에 따른 직관적 컬러 반환 (색상만으로 쾌적도 체감)
 * @param {number} latency 지연시간(ms)
 * @param {string} state 'healthy' | 'warning' | 'error'
 * @returns {string} HEX 색상 코드
 */
function getLatencyColor(latency, state) {
  if (state === 'error' || latency <= 0) return '#EF4444'; // 오류 / 단절 (레드)
  if (latency < 80) return '#00FFA3';   // 80ms 미만 (초고속 네온 에메랄드)
  if (latency < 250) return '#10B981';  // 80~250ms (쾌적 그린)
  if (latency < 600) return '#06B6D4';  // 250~600ms (안정 시안/스카이블루)
  if (latency < 1200) return '#F59E0B'; // 600~1200ms (주의 오렌지)
  return '#EF4444';                     // 1200ms 이상 (심한 지연 레드)
}

// 이전 상태 추적 (장애 발생 시 진동 알림용)
const previousStates = {
  YOUTUBE: null,
  SOOP: null,
  CHZZK: null
};

/**
 * 개별 플랫폼 카드 UI 업데이트
 */
function updateCardUI(key, info) {
  const card = document.getElementById(`card-${key}`);
  if (!card) return;

  card.classList.remove('loading', 'healthy', 'warning', 'error');
  card.classList.add(info.state);

  // 상태 인디케이터 텍스트
  const indicatorText = card.querySelector('.indicator-text');
  if (indicatorText) {
    if (info.state === 'healthy') indicatorText.textContent = '원활';
    else if (info.state === 'warning') indicatorText.textContent = '지연 감지';
    else indicatorText.textContent = '장애 / 단절';
  }

  // 지연 시간 (Latency) 및 동적 컬러 반영
  const dynamicColor = getLatencyColor(info.latency, info.state);
  const latencyEl = card.querySelector('.latency-val');
  if (latencyEl) {
    latencyEl.textContent = info.latency > 0 ? info.latency : 'ERR';
    latencyEl.style.color = dynamicColor;
  }

  // HTTP 상태 코드
  const httpCodeEl = card.querySelector('.http-status-code');
  if (httpCodeEl) {
    httpCodeEl.textContent = info.statusCode ? `HTTP ${info.statusCode}` : 'ERR';
  }

  // 게이지 바 계산 (0 ~ 2000ms 기준) 및 컬러 반영
  const gaugeBar = card.querySelector('.gauge-bar');
  if (gaugeBar) {
    const percent = Math.min(100, Math.max(8, (info.latency / 2000) * 100));
    gaugeBar.style.width = `${percent}%`;
    gaugeBar.style.backgroundColor = dynamicColor;
  }

  // 상태 메시지
  const messageEl = card.querySelector('.status-message');
  if (messageEl) {
    messageEl.textContent = info.message;
  }

  // 상태 변경 감지 시 진동 피드백
  const prevState = previousStates[key];
  if (prevState && prevState !== info.state) {
    if (info.state === 'error') {
      triggerVibration([200, 100, 200, 100, 300]);
    } else if (info.state === 'warning') {
      triggerVibration([180]);
    }
  }
  previousStates[key] = info.state;
}

/**
 * 실시간 서버 상태 API 조회 메인 함수
 */
async function fetchHealthData() {
  if (!navigator.onLine) {
    handleOfflineState();
    return;
  }

  if (isFetching) return;
  isFetching = true;

  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error(`API 오류: ${res.status}`);

    const data = await res.json();
    const { summary, servers } = data;

    // 상단 종합 상태 배지 업데이트
    if (overallBadge && overallText) {
      overallBadge.className = `overall-badge ${summary.state}`;
      overallText.textContent = summary.state === 'healthy' ? '서버 정상' : (summary.state === 'warning' ? '지연 감지' : '장애 발생');
    }

    // 카드 업데이트
    Object.entries(servers).forEach(([key, info]) => {
      updateCardUI(key, info);
    });

    // 마지막 갱신 시간
    if (lastUpdatedTimeEl) {
      const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      lastUpdatedTimeEl.textContent = `${timeStr} 갱신`;
    }

  } catch (err) {
    console.error('서버 상태 조회 실패:', err);
    if (overallBadge && overallText) {
      overallBadge.className = 'overall-badge error';
      overallText.textContent = '연결 실패';
    }
  } finally {
    isFetching = false;
  }
}

/**
 * 오프라인 상태 처리
 */
function handleOfflineState() {
  document.body.classList.add('is-offline');
  if (overallBadge && overallText) {
    overallBadge.className = 'overall-badge error';
    overallText.textContent = '내 기기 오프라인';
  }
}

/**
 * 온라인 복구 처리
 */
function handleOnlineState() {
  document.body.classList.remove('is-offline');
  if (overallText) overallText.textContent = '인터넷 재연결됨';
  fetchHealthData();
}

// 스마트폰 네트워크 연결 상태 실시간 감지
window.addEventListener('online', handleOnlineState);
window.addEventListener('offline', handleOfflineState);

/**
 * 10초 주기 자동 갱신 타이머 시작
 */
function startTimer() {
  setInterval(() => {
    fetchHealthData();
  }, REFRESH_INTERVAL);
}

// 화면 복귀 감지 (스마트폰 화면 켜지면 즉시 갱신 & 화면 켜짐 유지 재요청)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    enableWakeLock();
    fetchHealthData();
  }
});

// 초기 실행
window.addEventListener('DOMContentLoaded', () => {
  if (!navigator.onLine) {
    handleOfflineState();
  }
  enableWakeLock();
  fetchHealthData();
  startTimer();
});
