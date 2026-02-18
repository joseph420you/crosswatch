/**
 * camera.js - 攝影機資料載入 & HTML 解析模組
 * 負責從 twipcam API 抓取攝影機列表並解析 HTML
 */

const CameraModule = (() => {
  // CORS Proxy
  const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
  const TWIPCAM_BASE = 'https://www.twipcam.com';
  const SNAPSHOT_BASE = 'https://c01.twipcam.com/cam/snapshot/';

  // 快取已抓取的攝影機資料
  const cameraCache = new Map();
  // 快取已解析座標的攝影機
  const coordCache = new Map();
  // 正在進行的請求（防止重複）
  const pendingRequests = new Map();

  /**
   * 從座標 API HTML 中解析攝影機列表
   */
  function parseCameraListHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cameras = [];

    const containers = doc.querySelectorAll('.cam-list-container');
    containers.forEach((container) => {
      const link = container.querySelector('a');
      const img = container.querySelector('img');
      const desc = container.querySelector('.w3-display-bottomright');

      if (!link || !img) return;

      const href = link.getAttribute('href') || '';
      const camIdMatch = href.match(/\/cam\/(.+)$/);
      if (!camIdMatch) return;

      const camId = camIdMatch[1];
      const name = desc ? desc.textContent.trim() : camId;
      const snapshotUrl = img.getAttribute('src') || `${SNAPSHOT_BASE}${camId}.jpg`;
      const dataSrc = img.getAttribute('data-src') || '';

      cameras.push({
        id: camId,
        name: name,
        snapshotUrl: snapshotUrl,
        liveFeedUrl: dataSrc,
      });
    });

    return cameras;
  }

  /**
   * 從單一攝影機頁面 HTML 中解析座標
   */
  function parseCameraDetailHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let lat = null;
    let lon = null;
    let name = '';

    // 從頁面中的文字擷取經緯度
    const allDivs = doc.querySelectorAll('div');
    allDivs.forEach((div) => {
      const text = div.textContent.trim();
      const latMatch = text.match(/^緯度:\s*([\d.]+)/);
      const lonMatch = text.match(/^經度:\s*([\d.]+)/);
      if (latMatch) lat = parseFloat(latMatch[1]);
      if (lonMatch) lon = parseFloat(lonMatch[1]);
    });

    // 從 title 取得名稱
    const h1 = doc.querySelector('h1');
    if (h1) {
      name = h1.textContent.replace('即時影像', '').trim();
    }

    // 從 img data-src 取得即時影像 URL
    const imgEl = doc.querySelector('.video_obj');
    const liveFeedUrl = imgEl ? (imgEl.getAttribute('data-src') || '') : '';

    return { lat, lon, name, liveFeedUrl };
  }

  /**
   * 透過 CORS proxy 抓取 URL
   */
  async function fetchWithProxy(url) {
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  }

  /**
   * 抓取座標附近的攝影機列表
   */
  async function fetchCamerasByCoordinate(lat, lon) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;

    // 防止重複請求
    if (pendingRequests.has(key)) {
      return pendingRequests.get(key);
    }

    const promise = (async () => {
      try {
        const url = `${TWIPCAM_BASE}/api/v1/query-cam-list-by-coordinate?lat=${lat}&lon=${lon}`;
        const html = await fetchWithProxy(url);
        const cameras = parseCameraListHTML(html);

        // 將攝影機存入快取
        cameras.forEach((cam) => {
          if (!cameraCache.has(cam.id)) {
            cameraCache.set(cam.id, cam);
          }
        });

        return cameras;
      } finally {
        pendingRequests.delete(key);
      }
    })();

    pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * 抓取單一攝影機詳細資訊（含座標）
   */
  async function fetchCameraDetail(camId) {
    // 檢查快取
    if (coordCache.has(camId)) {
      return coordCache.get(camId);
    }

    // 防止重複請求
    const reqKey = `detail_${camId}`;
    if (pendingRequests.has(reqKey)) {
      return pendingRequests.get(reqKey);
    }

    const promise = (async () => {
      try {
        const url = `${TWIPCAM_BASE}/cam/${camId}`;
        const html = await fetchWithProxy(url);
        const detail = parseCameraDetailHTML(html);

        if (detail.lat && detail.lon) {
          const cameraData = {
            id: camId,
            lat: detail.lat,
            lon: detail.lon,
            name: detail.name || camId,
            liveFeedUrl: detail.liveFeedUrl,
            snapshotUrl: `${SNAPSHOT_BASE}${camId}.jpg`,
          };
          coordCache.set(camId, cameraData);

          // 更新 cache
          if (cameraCache.has(camId)) {
            const existing = cameraCache.get(camId);
            existing.lat = detail.lat;
            existing.lon = detail.lon;
            if (detail.liveFeedUrl) existing.liveFeedUrl = detail.liveFeedUrl;
            if (detail.name) existing.name = detail.name;
          }

          return cameraData;
        }
        return null;
      } finally {
        pendingRequests.delete(reqKey);
      }
    })();

    pendingRequests.set(reqKey, promise);
    return promise;
  }

  /**
   * 取得攝影機即時影像 URL（加上隨機參數避免快取）
   */
  function getSnapshotUrl(camId) {
    return `${SNAPSHOT_BASE}${camId}.jpg?t=${Date.now()}`;
  }

  /**
   * 取得快取的攝影機資料
   */
  function getCachedCamera(camId) {
    return coordCache.get(camId) || cameraCache.get(camId) || null;
  }

  return {
    fetchCamerasByCoordinate,
    fetchCameraDetail,
    getSnapshotUrl,
    getCachedCamera,
    SNAPSHOT_BASE,
  };
})();
