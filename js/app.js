/**
 * app.js - 主程式邏輯、Leaflet + OpenStreetMap 初始化
 * 管理地圖、攝影機 markers、GPS 定位、圖磚樣式切換
 */

const App = (() => {
    // Leaflet 地圖物件
    let map = null;
    let markers = new Map(); // camId -> L.marker
    let currentTileLayer = null;

    // 攝影機 icon
    const CAMERA_ICON = L.icon({
        iconUrl: 'assets/camera-icon.svg',
        iconSize: [36, 43],
        iconAnchor: [18, 43],
        popupAnchor: [0, -43],
    });

    // 設定
    const DEFAULT_CENTER = [22.6273, 120.3014]; // 高雄市中心
    const DEFAULT_ZOOM = 15;
    const LOAD_DEBOUNCE_MS = 800;

    // 狀態
    let loadTimer = null;
    let isLoading = false;
    let userLocationMarker = null;
    let userLocationCircle = null;

    // ========== 初始化 ==========

    function init() {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false,       // 使用自訂控制列
            attributionControl: true,
        });

        // 套用標準彩色圖磚 (OSM)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(map);

        // 地圖移動/縮放完成後載入攝影機
        map.on('moveend', () => {
            debouncedLoadCameras();
        });

        // 地圖載入完成
        map.once('load', () => hideLoadingOverlay());
        setTimeout(() => hideLoadingOverlay(), 2000);

        // 綁定自訂控制列
        initControls();

        // 初始載入攝影機
        loadCamerasInView();
    }

    // ========== 自訂控制列 ==========

    function initControls() {
        // 放大
        document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
            map.zoomIn();
        });

        // 縮小
        document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
            map.zoomOut();
        });

        // GPS 定位
        document.getElementById('ctrl-locate').addEventListener('click', locateUser);
    }

    // ========== Camera Loading ==========

    function debouncedLoadCameras() {
        if (loadTimer) clearTimeout(loadTimer);
        loadTimer = setTimeout(() => {
            loadCamerasInView();
        }, LOAD_DEBOUNCE_MS);
    }

    async function loadCamerasInView() {
        if (isLoading || !map) return;

        const center = map.getCenter();
        const zoom = map.getZoom();

        if (zoom < 13) {
            UIModule.showToast('請放大地圖以查看攝影機');
            return;
        }

        isLoading = true;

        try {
            const lat = center.lat;
            const lng = center.lng;
            const cameras = await CameraModule.fetchCamerasByCoordinate(lat, lng);

            if (cameras.length === 0) {
                UIModule.updateCameraCount(0);
                return;
            }

            let loadedCount = 0;
            const batchSize = 4;

            for (let i = 0; i < cameras.length; i += batchSize) {
                const batch = cameras.slice(i, i + batchSize);
                const promises = batch.map(async (cam) => {
                    try {
                        if (markers.has(cam.id)) {
                            loadedCount++;
                            return;
                        }
                        const detail = await CameraModule.fetchCameraDetail(cam.id);
                        if (detail && detail.lat && detail.lon) {
                            addCameraMarker(detail);
                            loadedCount++;
                        }
                    } catch (err) {
                        // 靜默處理
                    }
                });
                await Promise.all(promises);
            }

            UIModule.updateCameraCount(markers.size);
        } catch (err) {
            UIModule.showToast('⚠️ 載入攝影機資料時發生錯誤');
        } finally {
            isLoading = false;
        }
    }

    function addCameraMarker(camera) {
        if (markers.has(camera.id)) return;

        const marker = L.marker([camera.lat, camera.lon], {
            icon: CAMERA_ICON,
            title: camera.name,
        }).addTo(map);

        marker.on('click', () => {
            const camData = CameraModule.getCachedCamera(camera.id) || camera;
            UIModule.showCameraDialog(camData);
        });

        markers.set(camera.id, marker);
    }

    // ========== GPS 定位 ==========

    function locateUser() {
        const btn = document.getElementById('ctrl-locate');

        if (!navigator.geolocation) {
            UIModule.showToast('⚠️ 您的瀏覽器不支援定位功能');
            return;
        }

        btn.classList.add('locating');
        UIModule.showToast('📍 正在取得您的位置...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                btn.classList.remove('locating');
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy;

                map.setView([lat, lng], 16);

                if (userLocationMarker) {
                    userLocationMarker.setLatLng([lat, lng]);
                    userLocationCircle.setLatLng([lat, lng]);
                    userLocationCircle.setRadius(accuracy);
                } else {
                    userLocationCircle = L.circle([lat, lng], {
                        radius: accuracy,
                        color: '#4285F4',
                        fillColor: '#4285F4',
                        fillOpacity: 0.12,
                        weight: 1,
                    }).addTo(map);

                    userLocationMarker = L.circleMarker([lat, lng], {
                        radius: 8,
                        color: '#ffffff',
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        weight: 3,
                    }).addTo(map);
                }

                UIModule.showToast('✅ 已定位到您的位置');
            },
            (error) => {
                btn.classList.remove('locating');
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        UIModule.showToast('⚠️ 請允許定位權限');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        UIModule.showToast('⚠️ 無法取得位置資訊');
                        break;
                    case error.TIMEOUT:
                        UIModule.showToast('⚠️ 定位逾時，請重試');
                        break;
                    default:
                        UIModule.showToast('⚠️ 定位失敗');
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000,
            }
        );
    }

    // ========== Utility ==========

    function hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500);
        }
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
