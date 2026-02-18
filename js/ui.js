/**
 * ui.js - 對話框 UI、互動邏輯模組
 * 負責攝影機對話框的顯示與操作
 */

const UIModule = (() => {
    let currentCamera = null;
    let refreshTimer = null;

    // DOM 元素快取
    const overlay = document.getElementById('camera-overlay');
    const dialogTitle = document.getElementById('dialog-title');
    const dialogImage = document.getElementById('dialog-image');
    const toast = document.getElementById('toast');

    let toastTimer = null;

    /**
     * 顯示攝影機對話框
     */
    /**
     * 顯示攝影機對話框
     */
    function showCameraDialog(camera) {
        currentCamera = camera;

        // 設定標題
        let displayName = camera.name || camera.id;
        const nameClean = displayName
            .replace(/距離[\d.]+(?:公尺|公里)/g, '')
            .replace(/氣溫[\d.]+℃/g, '')
            .trim();
        dialogTitle.textContent = nameClean;

        // 重置圖片狀態
        dialogImage.onload = null;
        dialogImage.onerror = null;
        stopAutoRefresh();

        // 優先嘗試使用即時影像 (Live Feed)
        if (camera.liveFeedUrl) {
            dialogImage.src = camera.liveFeedUrl;
            dialogImage.alt = displayName;

            // 如果即時影像載入失敗，降級回 Snapshot 輪詢
            dialogImage.onerror = () => {
                console.warn('Live feed failed, falling back to snapshot polling');
                dialogImage.onerror = null; // 防止無窮迴圈
                // 立即載入一張靜態圖
                dialogImage.src = CameraModule.getSnapshotUrl(camera.id);
                startAutoRefresh();
            };
        } else {
            // 沒有即時影像，直接使用靜態圖輪詢
            dialogImage.src = CameraModule.getSnapshotUrl(camera.id);
            dialogImage.alt = displayName;
            startAutoRefresh();
        }

        // 顯示 overlay
        overlay.classList.add('active');
    }

    /**
     * 關閉攝影機對話框
     */
    function closeCameraDialog() {
        overlay.classList.remove('active');
        stopAutoRefresh();
        dialogImage.onerror = null; // 清除錯誤處理

        setTimeout(() => {
            dialogImage.src = '';
            currentCamera = null;
        }, 300);
    }

    /**
     * 手動刷新影像
     */
    function refreshImage() {
        if (!currentCamera) return;

        if (currentCamera.liveFeedUrl) {
            // 嘗試重新載入即時影像
            // 加入 timestamp 確保重連
            const timestamp = Date.now();
            const sep = currentCamera.liveFeedUrl.includes('?') ? '&' : '?';
            dialogImage.src = `${currentCamera.liveFeedUrl}${sep}t=${timestamp}`;

            stopAutoRefresh();

            dialogImage.onerror = () => {
                dialogImage.onerror = null;
                dialogImage.src = CameraModule.getSnapshotUrl(currentCamera.id);
                startAutoRefresh();
            };
        } else {
            dialogImage.src = CameraModule.getSnapshotUrl(currentCamera.id);
        }
        showToast('🔄 已重新載入影像');
    }

    /**
     * 開始自動刷新 — 直接更換 src（加時間戳破解快取）
     */
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(() => {
            if (currentCamera) {
                // 直接更換 src，timestamp 確保不使用瀏覽器快取
                dialogImage.src = CameraModule.getSnapshotUrl(currentCamera.id);
            }
        }, 2000);
    }

    /**
     * 停止自動刷新
     */
    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    /**
     * 全螢幕顯示影像
     */
    function openFullscreen() {
        if (!currentCamera) return;
        const imgUrl = CameraModule.getSnapshotUrl(currentCamera.id);
        window.open(imgUrl, '_blank');
    }

    /**
     * 在 twipcam 上查看
     */
    function openInTwipcam() {
        if (!currentCamera) return;
        window.open(`https://www.twipcam.com/cam/${currentCamera.id}`, '_blank');
    }

    /**
     * 顯示 toast 訊息
     */
    function showToast(message, duration = 2000) {
        toast.textContent = message;
        toast.classList.add('visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }

    /**
     * 更新攝影機計數 badge
     */
    function updateCameraCount(count) {
        const badge = document.getElementById('camera-count');
        if (count > 0) {
            badge.textContent = `📷 ${count} 台攝影機`;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    }

    // 事件綁定
    document.getElementById('btn-close').addEventListener('click', closeCameraDialog);

    // 點擊 overlay 背景關閉
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeCameraDialog();
        }
    });

    // 鍵盤 ESC 關閉
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeCameraDialog();
        }
    });

    return {
        showCameraDialog,
        closeCameraDialog,
        showToast,
        updateCameraCount,
    };
})();
