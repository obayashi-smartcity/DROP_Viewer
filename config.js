// 地図リソースは DROP_Dashboard_NakaEast1.0 と同じ設定（Leaflet + CARTO）を流用
window.VIEWER_CONFIG = {
  dataUrl: "data/drops.json",
  // テナントIDに表示名を付けたい場合はここに追記（未指定はIDをそのまま表示）
  tenantLabels: {
    // "nakanoshima": "中之島",
  },
  pageSize: 60,
  map: {
    cartoApiKey: "cb1_3mnu_1_9357092faaed80e557d7e696",
    tile: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    center: [34.6905, 135.5023],
    zoom: 14,
  },
};
