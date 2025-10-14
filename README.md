# kabu4 – イベント・ドリブン銘柄レーダー (MVP)

個人開発でも再現しやすい最小構成のイベントドリブン日本株レーダーです。決算・適時開示・ニュース・出来高急増といったイベントを日次バッチで取り込み、統計指標とスコア付きで候補銘柄を提示します。フロントエンドとAPIを Next.js 14、バッチ処理を Python 3.11 で実装しています。

## 主な構成

```
apps/
  api/   - Next.js API Routes (REST)
  web/   - Next.js App Router + Tailwind UI
jobs/
  ingest/ - Python 日次インジェスト（アダプター・特徴量・スコアリング）
packages/
  core/  - TypeScript ドメイン型とスコア計算ユーティリティ
infra/
  docker-compose.yml, Dockerfile, prisma migrations
config/
  weights.json (スコア重み)
```

## 依存技術と選定理由

- **Next.js 14 + React 18**: App Router によるサーバーコンポーネント活用と API Routes を同スタックで統一。
- **Tailwind CSS**: 少ないカスタム CSS でダッシュボード UI を高速構築。
- **lightweight-charts**: 取引所データ向けに軽量な WebGL チャート。
- **Prisma + SQLite**: スキーマ駆動で Postgres へ移行しやすい ORM。ローカルでは SQLite 単体で完結。
- **Zod**: API 入出力と設定のバリデーション。
- **python-dotenv (任意)**: ジョブで .env を簡易ロード。
- **Vitest / Pytest**: TypeScript と Python 双方で軽量なユニットテスト環境。

## セットアップ

前提: Node.js 20.x, npm 9+, Python 3.11, SQLite3 が利用可能であること。

```bash
# 1. 依存インストール
npm install

# 2. 環境変数
cp .env.example .env

# 3. Prisma クライアント生成とマイグレーション
npm run prisma:generate
npm run prisma:migrate

# 4. サンプルデータ投入
node scripts/seed.js

# 5. 日次インジェスト実行（サンプルデータを特徴量・イベント化）
python -m jobs.ingest.main
```

**開発サーバー起動**

```bash
# API (http://localhost:3001)
npm run dev:api

# Web UI (http://localhost:3000)
npm run dev:web
```

`web` アプリは `NEXT_PUBLIC_API_URL` に API のベース URL を参照します（.env で上書き可）。

## docker-compose での動作確認

```
cd infra
docker compose build
docker compose up
```

- `api`: ポート 3001 で Next.js API Routes。
- `web`: ポート 3000 でダッシュボード。
- `worker`: 日次インジェスト ジョブ（起動時に1度実行）。
- SQLite データベースは `prisma-data` ボリュームとして永続化されます。

## テスト

TypeScript 側 (Vitest):

```bash
npm test
```

Python ルールの正規表現 (Pytest):

```bash
PYTHONPATH=. pytest tests/regex
```

## データフロー概要

1. `jobs/ingest` がサンプル CSV / JSON から OHLCV とイベントを読み込み。
2. 特徴量（出来高 Z スコア、ギャップ率、需給 proxy、高値乖離など）を計算し `Feature` テーブルに格納。
3. ルールベースでイベントを検出し `CorporateEvent` に保存。
4. TypeScript/Prisma 定義と同じ重み (`config/weights.json`) を使ってスコアを計算し `Pick` に保存。
5. API `/api/picks` が日付とスコア閾値で候補を返却。
6. フロント `/dashboard` がテーブル表示とドロワー（チャート、イベントタイムライン）を提供。`/settings` ではローカル保存の重み調整 UI を提供。

## スコアリング設定

- `config/weights.json` がデフォルト。
- `.env` で `WEIGHT_EVENT_GUIDE_UP` 等を定義すると上書き。
- UI の設定画面で調整した重み・閾値はブラウザ `localStorage` に保存され、ダッシュボードのデフォルト閾値に反映されます。

## 主要スクリプト

- `jobs/ingest/adapters/*`: 将来の API 置き換えを前提としたモック実装。
- `jobs/ingest/rules.py`: 正規表現と閾値によるイベント検出。
- `packages/core/src/scoring.ts`: イベント／テープ要素の加重平均スコア算出（0–100 正規化）。
- `apps/api/...`: Prisma 経由で DB を問い合わせ、JSON レスポンスを返却。
- `apps/web/...`: Next.js App Router、Tailwind、lightweight-charts による UI。

## 注意事項

- 推奨・売買指示は行わず、スコアと指標のみ表示します。
- SQLite ファイルは `prisma/dev.db` に生成されます。Postgres への移行時は `.env` の `DATABASE_URL` を差し替えて `prisma migrate deploy` を実行してください。
- LLM を使う処理は未搭載ですが、`jobs/ingest` のアダプター構成で差し替え容易です。

