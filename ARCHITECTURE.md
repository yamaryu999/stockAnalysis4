# アーキテクチャ概要

## システム構成

```
┌──────────┐      ┌──────────────┐      ┌────────────┐
│ cron / CLI│ ---> │ jobs/ingest  │ ---> │ SQLite/Prisma│
└──────────┘      └──────┬───────┘      └─────┬──────┘
                          │                     │
                          │                     │
                    ┌─────▼────┐          ┌────▼─────┐
                    │ API (Next)│ <──────> │ Web (Next)│
                    └──────────┘          └──────────┘
```

- 日次インジェスト (`python -m jobs.ingest.main`) がサンプルデータから特徴量とイベントを作成。
- Prisma 経由で `Pick`・`CorporateEvent`・`Feature` テーブルを更新。
- API サービス (Next.js) が REST エンドポイント `/api/picks` と `/api/symbols/:code/...` を提供。
- Web ダッシュボード (Next.js App Router) が API を呼び出し UI を表示。

## データモデル

| テーブル | 主キー | 主なカラム | 説明 |
|---------|--------|------------|------|
| `Symbol` | `code` | `name`, `sector` | 取り扱い銘柄マスタ |
| `DailyPrice` | `code + date` | `open`, `high`, `low`, `close`, `volume`, `vwap` | 日足 OHLCV |
| `CorporateEvent` | `id` | `code`, `date`, `type`, `title`, `summary`, `source`, `scoreRaw` | TDnet / 決算 / ニュース / 出来高イベント |
| `Feature` | `code + date + name` | `value` | volume_z などの特徴量 |
| `Pick` | `date + code` | `scoreFinal`, `reasons`(JSON), `stats`(JSON) | 日次スコアと理由タグ |

`Prisma` スキーマは `prisma/schema.prisma` にあり、`infra/prisma/migrations` に初期マイグレーション SQL を同梱しています。

## スコアリング

1. **イベントスコア**: `config/weights.json.event` で定義した重みに、イベント自体のスコア (0–1) を乗算。
   - 例: GUIDE_UP = 1.0, EARNINGS_POSITIVE = 0.8, VOL_SPIKE = 0.6 など。
   - 環境変数 `WEIGHT_EVENT_*` で上書き可能。
2. **テープ指標**: 出来高 Z スコア (0〜5 → 0〜1 正規化)、ギャップ率 (最大 +5% で 1)、需給 proxy (0〜2 → 0〜1) をそれぞれ重み付け。
3. **加重平均**: `score = (Σ weight_i * normalized_i) / Σ weight_i`。ペナルティ (`recent_negative`) を差し引き、0〜1 にクリップ。
4. **フィルタ**:
   - `high20d_dist_pct >= -0.15`
   - `close >= 100`
   条件を満たさない場合は `passedFilters=false` としてスコアを 0 に。
5. **最終スコア**: `score_final = score * 100` (0〜100)。閾値は `weights.minScore`（デフォルト 60）。
6. **理由 JSON**: イベントタグ・テープ指標・フィルタ・ペナルティを配列で格納し UI に表示。

## インジェスト処理

1. `adapters/` 各モジュールがサンプルデータを読み込み、将来の外部 API に差し替え可能な構成。
2. `FeatureCalculator` が 20 日・5 日移動窓を用いて指標を計算。
3. `rules.py` がタイトル正規表現・閾値でイベントを分類。
4. `scoring.py` が TypeScript 実装と揃えたロジックで `Pick` を作成。
5. `utils/db.py` の `replace_many` が SQLite に UPSERT (REPLACE) を実施。

## API インターフェース

### GET `/api/picks`

クエリ: `date=YYYY-MM-DD`, `minScore` (任意), `type` (GUIDE_UP / EARNINGS 等)。

レスポンス例:

```json
{
  "date": "2024-02-06",
  "items": [
    {
      "code": "9984",
      "name": "ソフトバンクグループ",
      "score": 78.2,
      "reasons": [...],
      "stats": {
        "volume_z": 2.8,
        "gap_pct": 0.013,
        "supply_demand_proxy": 1.4
      },
      "lastClose": 6800,
      "high20dDistPct": 0.08,
      "events": [...]
    }
  ],
  "weights": {...}
}
```

### GET `/api/symbols/:code/events`

指定銘柄のイベント履歴 (最新 20 件がデフォルト)。

### GET `/api/symbols/:code/prices`

直近 30 営業日の OHLCV を返却。軽量チャート描画に使用。

## Web ダッシュボード

- `/dashboard`: App Router のサーバーコンポーネントで初期データを取得し、クライアント側でフィルター・ドロワー・チャートを制御。
- `/settings`: サーバーで `loadWeights()` を参照し、クライアントのフォームでローカル保存。
- UI テキストは `apps/web/i18n/ja.json` に集約し、`t()` ヘルパーで参照。

## 今後の拡張ポイント

- adapters の実 API 化 (TDnet RSS, ニュース API, PDF 解析等)。
- LLM ベースの要約・極性判定の差し替え。
- `Pick` 作成時の履歴保持（現在は日次リプレース）。
- API での Webhook や通知連携（本 MVP では非対応）。
- Postgres 移行時は `DATABASE_URL` を置き換え、`prisma migrate deploy` を実行するだけで互換。

