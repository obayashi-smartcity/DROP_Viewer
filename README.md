# DROP Viewer

DROP 投稿（画像＋フレーズ）を閲覧するための静的ビューワーです。GitHub Pages でそのまま公開できます（ビルド不要）。

## 機能

- **ギャラリー**: サムネイル＋フレーズのカード一覧（スクロールで順次読み込み）
- **テナント切り替え**: 複合テナント（例 `nakanoshima-ikefes`）は構成テナントの両方に表示
- **フレーズ絞り込み**: スペース区切りで AND 検索（全角/半角・ひらがな/カタカナを同一視、投稿者名も対象）
- **モーダル**: サムネイルクリックで拡大表示。←/→ で前後の投稿へ、「地図で見る」で該当ピンへ移動
- **マップ**: 絞り込み結果をピン表示（Leaflet + CARTO。設定は `config.js`）
- 絞り込み状態は URL（`#tenant=...&q=...&view=map`）に保持され、共有できます

## 構成

| ファイル | 内容 |
| --- | --- |
| `index.html` / `style.css` / `app.js` | ビューワー本体 |
| `config.js` | 地図設定、テナント表示名（`tenantLabels`） |
| `data/drops.json` | 正規化済みデータ（生成物・コミット対象） |
| `scripts/build_data.py` | `.memo/source.csv` → `data/drops.json` |

## データ更新

```
python scripts/build_data.py
```

`.memo/source.csv`（Git 管理外）を読み、`data/drops.json` を上書きします。

## ローカル確認

```
python -m http.server 8000
```

→ http://localhost:8000/ （`file://` で直接開くと JSON を読み込めません）

## 公開

GitHub の Settings → Pages で `main` ブランチのルートを指定してください。
