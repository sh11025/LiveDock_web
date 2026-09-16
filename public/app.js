// ==========================================================================
// LiveDock Web · 실시간 스트리밍 서버 모니터링 (클라이언트 직접 핑 모드)
// GitHub Pages 완전 호환 (외부 백엔드 서버 불필요)
// 스마트폰 가로모드 최적화, 기기 오프라인 감지, 직관적 지연시간(ms) 시각화
// ==========================================================================

const REFRESH_INTERVAL = 10000; // 10초 주기 자동 갱신
let isFetching = false;
let wakeLockSentinel = null;

// 대상 스트리밍 플랫폼 엔드포인트 (CORS 제한 없이 브라우저에서 직접 핑 측정)
const TARGET_SERVERS = {
  YOUTUBE: {
    name: '유튜브',
    serviceName: 'Google CDN Relay',
    pingUrl: 'https://www.youtube.com/favicon.ico'
  },
  SOOP: {
    name: 'SOOP',
    serviceName: 'SOOP Live Edge',
    pingUrl: 'https://www.sooplive.com/favicon.ico'
  },
  CHZZK: {
    name: '치지직',
    serviceName: 'NAVER Cloud CDN',
    pingUrl: 'https://chzzk.naver.com/favicon.ico'
  }
};

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
      // 절전 모드 또는 브라우저 권한 정책으로 제한된 경우
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
 * 지연시간(ms) 및 상태에 따른 직관적 컬러 반환
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

// 이전 상태 추적 (상태 악화 시 진동 알림용)
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
    else indicatorText.textContent = '단절 / 장애';
  }

  // 지연 시간 (Latency) 및 동적 컬러 반영
  const dynamicColor = getLatencyColor(info.latency, info.state);
  const latencyEl = card.querySelector('.latency-val');
  if (latencyEl) {
    latencyEl.textContent = info.latency > 0 ? info.latency : 'ERR';
    latencyEl.style.color = dynamicColor;
  }

  // 연결 상태 표시 (ONLINE / OFFLINE)
  const httpCodeEl = card.querySelector('.http-status-code');
  if (httpCodeEl) {
    httpCodeEl.textContent = info.statusCode;
    httpCodeEl.style.color = info.state === 'error' ? '#EF4444' : '#10B981';
  }

  // 게이지 바 계산 (0 ~ 1500ms 기준) 및 컬러 반영
  const gaugeBar = card.querySelector('.gauge-bar');
  if (gaugeBar) {
    if (info.state === 'error' || info.latency <= 0) {
      gaugeBar.style.width = '0%';
    } else {
      const percent = Math.min(100, Math.max(8, (info.latency / 1500) * 100));
      gaugeBar.style.width = `${percent}%`;
      gaugeBar.style.backgroundColor = dynamicColor;
    }
  }

  // 상태 상세 메시지
  const messageEl = card.querySelector('.status-message');
  if (messageEl) {
    messageEl.textContent = info.message;
  }

  // 상태 악화 감지 시 진동 피드백
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
 * 개별 스트리밍 플랫폼 브라우저 직접 핑(Ping) 측정 함수
 * @param {string} key 서버 키 (YOUTUBE, SOOP, CHZZK)
 * @param {object} config 대상 서버 정보
 * @returns {Promise<object>} 측정 결과 객체
 */
async function pingServer(key, config) {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4초 타임아웃

  // 캐시 방지 쿼리 파라미터 적용
  const url = `${config.pingUrl}?_t=${Date.now()}`;

  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const latency = Math.round(performance.now() - startTime);

    let state = 'healthy';
    let message = `중계 원활 (${latency}ms)`;

    if (latency > 1200) {
      state = 'error';
      message = `심각한 지연 (${latency}ms)`;
    } else if (latency > 450) {
      state = 'warning';
      message = `지연 감지 (${latency}ms)`;
    }

    return {
      key,
      name: config.name,
      state,
      message,
      latency,
      statusCode: 'ONLINE'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    const isTimeout = error.name === 'AbortError';

    return {
      key,
      name: config.name,
      state: 'error',
      message: isTimeout ? '응답 시간 초과 (4.0s)' : '서버 연결 단절',
      latency: 0,
      statusCode: isTimeout ? 'TIMEOUT' : 'OFFLINE'
    };
  }
}

/**
 * 전체 플랫폼 실시간 핑 측정 및 대시보드 갱신
 */
async function fetchHealthData() {
  if (!navigator.onLine) {
    handleOfflineState();
    return;
  }

  if (isFetching) return;
  isFetching = true;

  try {
    // 3대 플랫폼 병렬 직접 핑 측정
    const promises = Object.entries(TARGET_SERVERS).map(([key, config]) =>
      pingServer(key, config)
    );

    const results = await Promise.all(promises);

    let healthyCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    results.forEach(info => {
      if (info.state === 'healthy') healthyCount++;
      else if (info.state === 'warning') warningCount++;
      else errorCount++;

      updateCardUI(info.key, info);
    });

    // 종합 상태 배지 업데이트
    if (overallBadge && overallText) {
      if (errorCount > 0) {
        overallBadge.className = 'overall-badge error';
        overallText.textContent = `${errorCount}개 단절/오류`;
      } else if (warningCount > 0) {
        overallBadge.className = 'overall-badge warning';
        overallText.textContent = `${warningCount}개 지연 감지`;
      } else {
        overallBadge.className = 'overall-badge healthy';
        overallText.textContent = '모든 서버 원활';
      }
    }

    // 마지막 갱신 시간 반영
    if (lastUpdatedTimeEl) {
      const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      lastUpdatedTimeEl.textContent = `${timeStr} 갱신`;
    }

  } catch (err) {
    console.error('측정 도중 오류 발생:', err);
    if (overallBadge && overallText) {
      overallBadge.className = 'overall-badge error';
      overallText.textContent = '측정 오류';
    }
  } finally {
    isFetching = false;
  }
}

/**
 * 스마트폰 오프라인 상태 처리
 */
function handleOfflineState() {
  document.body.classList.add('is-offline');
  if (overallBadge && overallText) {
    overallBadge.className = 'overall-badge error';
    overallText.textContent = '내 기기 오프라인';
  }
}

/**
 * 스마트폰 온라인 복구 처리
 */
function handleOnlineState() {
  document.body.classList.remove('is-offline');
  if (overallText) overallText.textContent = '인터넷 재연결됨';
  fetchHealthData();
}

// 스마트폰 네트워크 상태 실시간 감지
window.addEventListener('online', handleOnlineState);
window.addEventListener('offline', handleOfflineState);

/**
 * 주기적 자동 갱신 타이머 시작
 */
function startTimer() {
  setInterval(() => {
    fetchHealthData();
  }, REFRESH_INTERVAL);
}

// 화면 복귀 감지 (스마트폰 화면 켜지면 즉시 측정 & 화면 켜짐 유지 재요청)
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
