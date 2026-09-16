// ==========================================
// 치지직 · SOOP · 유튜브 실시간 서버 헬스체크 API
// Vercel Serverless Function (/api/health)
// ==========================================

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8'
};

/**
 * 개별 스트리밍 플랫폼 서버 상태 확인 함수
 * @param {string} key 서버 키 (CHZZK, SOOP, YOUTUBE)
 * @param {object} config 서버 대상 정보
 * @returns {Promise<object>} 측정 결과 객체
 */
async function checkServerHealth(key, config) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4초 타임아웃

  try {
    const fetchOptions = {
      method: config.method,
      headers: {
        ...HEADERS,
        ...(config.headers || {})
      },
      signal: controller.signal,
      cache: 'no-store'
    };

    if (config.body) {
      fetchOptions.body = config.body;
    }

    const response = await fetch(config.url, fetchOptions);
    clearTimeout(timeoutId);

    const latency = Date.now() - startTime;
    const statusCode = response.status;

    let state = 'healthy';
    let message = `중계 원활 (${latency}ms)`;

    if (statusCode >= 400) {
      state = 'error';
      message = `세션 오류 (HTTP ${statusCode})`;
    } else if (latency > 1500) {
      state = 'warning';
      message = `중계 지연 (${latency}ms)`;
    }

    return {
      key,
      name: config.name,
      state,
      message,
      latency,
      statusCode,
      mainUrl: config.mainUrl,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const isTimeout = error.name === 'AbortError';

    return {
      key,
      name: config.name,
      state: 'error',
      message: isTimeout ? '타임아웃 (세션 무응답)' : '중계 서버 연결 불가',
      latency: isTimeout ? 4000 : latency,
      statusCode: 0,
      mainUrl: config.mainUrl,
      updatedAt: new Date().toISOString()
    };
  }
}

// 대상 스트리밍 서버 정의
const TARGET_SERVERS = {
  CHZZK: {
    name: '치지직',
    method: 'GET',
    url: 'https://api.chzzk.naver.com/service/v1/channels/common',
    mainUrl: 'https://chzzk.naver.com'
  },
  SOOP: {
    name: 'SOOP',
    method: 'POST',
    url: 'https://live.sooplive.com/afreeca/player_live_api.php',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'bid=afbroad&mode=landing&player_type=html5',
    mainUrl: 'https://www.sooplive.com'
  },
  YOUTUBE: {
    name: '유튜브',
    method: 'GET',
    url: 'https://redirector.googlevideo.com/report_mapping',
    mainUrl: 'https://www.youtube.com'
  }
};

/**
 * Vercel Serverless 요청 핸들러
 */
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 3개 플랫폼을 병렬로 동시에 상태 측정
    const checkPromises = Object.entries(TARGET_SERVERS).map(([key, config]) =>
      checkServerHealth(key, config)
    );

    const resultsArray = await Promise.all(checkPromises);
    const servers = {};
    let healthyCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    resultsArray.forEach(item => {
      servers[item.key] = item;
      if (item.state === 'healthy') healthyCount++;
      else if (item.state === 'warning') warningCount++;
      else errorCount++;
    });

    const totalCount = resultsArray.length;
    let overallState = 'healthy';
    let overallMessage = '모든 스트리밍 서버가 정상 가동 중입니다.';

    if (errorCount > 0) {
      overallState = 'error';
      overallMessage = `${errorCount}개 플랫폼 서버에 세션 장애가 감지되었습니다.`;
    } else if (warningCount > 0) {
      overallState = 'warning';
      overallMessage = `${warningCount}개 플랫폼 서버에 중계 지연이 발생하고 있습니다.`;
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      summary: {
        state: overallState,
        message: overallMessage,
        healthyCount,
        warningCount,
        errorCount,
        totalCount
      },
      servers
    });
  } catch (err) {
    return res.status(500).json({
      error: '서버 상태 측정 중 오류가 발생했습니다.',
      details: err.message
    });
  }
}
