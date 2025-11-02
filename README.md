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

## クイックスタート（最短手順）

このリポジトリでは pnpm を推奨します。初回セットアップ済みであれば、次回以降は次の2コマンドだけでOKです。

```bash
# 依存が未インストールの場合のみ
pnpm install

# 2ターミナルで起動
pnpm run dev:api   # → http://localhost:3001
pnpm run dev:web   # → http://localhost:3000
```

- すでに seed/ingest 済みのサンプルDBが `prisma/dev.db` に含まれています。
- `.env` の `DATABASE_URL` はこのPCに合わせた絶対パスに設定済みです。プロジェクトの場所を移動した場合は更新してください。

## 外部データ（銘柄・イベント）の取得

このMVPはローカルのサンプルCSV/JSONを同梱していますが、.env を設定すると「ネット上の情報から銘柄を選定」できます。

- 銘柄ユニバース（内部のリストではなくネット情報を優先）
  - `SYMBOLS_CSV_URL`: `code,name[,sector]` を持つCSVのURL
  - `SYMBOLS_JSON_URL`: `["7203", ...]` または `[{"code":"7203","name":"トヨタ自動車"}, ...]`
  - いずれも未設定の場合は、直近のTDNET/ニュース/決算イベントに登場したコードから自動生成します
- TDNET（適時開示）
  - `TDNET_RSS_URL` を指定すると当該ページを取得し、4桁コードを抽出してイベント候補にします
- ニュース（リアルタイム）
  - 既定で `NEWS_FEED_URL=https://kabutan.jp/news/?b=k250` を参照し、最新の決算ニュースをスクレイピングしてイベント化します
  - 追加のメディアも参照可能です。環境変数 `NEWS_FEEDS` にカンマ区切りで複数のフィードURLを指定してください（JSON/HTMLどちらでも可。JSONは `code,title,date[,summary,url]` 形式を想定）。
  - 記事タイトルから極性を推定し、ポジティブ／ネガティブ／ニュートラルでスコアに反映します
  - フィードを差し替えたい場合は JSON 配列（`[{code,title,summary,date,polarity}]`）の URL を設定してください
- 決算/ニュース（任意のJSONフィード）
  - `EARNINGS_FEED_URL` / `NEWS_FEED_URL` にJSON配列URLを指定（各要素: `code,title,summary,date[,polarity]`）

設定後はインジェストを実行:

```bash
. .venv/bin/activate
PYTHONPATH=. python -m jobs.ingest.main
```

## よくあるトラブルと対処

- ポート競合: `apps/api/package.json` / `apps/web/package.json` の `dev` スクリプトの `-p` を変更。
- APIがDBを開けない: `.env` の `DATABASE_URL` が現在のパスに合っているか確認。
- Web→APIの接続: `NEXT_PUBLIC_API_URL` を `http://localhost:3001` に設定（既定値も同じ）。

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

### E2E (Playwright)

Playwright による E2E を追加しました。

- ブラウザ取得: `npm run playwright:install`（権限問題がある場合は `npx playwright install chromium`）
- サーバーを Playwright に起動させる: `npm run test:e2e`
- 既存サーバーを使う（推奨・高速）:
  - `pnpm --filter @kabu4/api dev`（ポート 3001）
  - `pnpm --filter @kabu4/web dev`（ポート 3000）
  - `E2E_EXTERNAL_SERVERS=1 npm run test:e2e`

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

## MCP: Tavily 検索サーバーの利用

エージェントからウェブ検索・抽出を使える Tavily MCP Server をワークスペースに追加しました（VS Code 連携）。

- 追加した設定: `.vscode/mcp.json`
- 起動方法: VS Code が MCP クライアントに対応していれば、自動で `tavily` サーバーを `npx` で起動します。
- API キー: プロンプトで Tavily API Key の入力を求められます（入力はローカルにのみ保持）。

他クライアントでの利用例（参考）:

- Cursor/Claude Desktop などの `mcpServers` 設定で、以下のいずれかを追加します。
  - ローカル起動: `npx -y tavily-mcp@latest`（環境変数 `TAVILY_API_KEY` を設定）
  - リモート接続: `npx -y mcp-remote https://mcp.tavily.com/mcp/?tavilyApiKey=<あなたのAPIキー>`

Tavily の API キーは https://www.tavily.com/ から取得できます。

## MCP: Browser（Playwright）

ローカルのヘッドレスChromiumでページ表示・スクレイピングを行う Browser MCP を追加しました。

- 設定ファイル: `.vscode/mcp.json` の `browser` エントリ（`playwright-mcp-server`）
- 事前準備（ブラウザ未インストールの環境）:

```bash
pnpm exec playwright install chromium
```

- IDEがMCPクライアント対応の場合、起動時に自動で `npx -y playwright-mcp-server@latest` を立ち上げます。
- うまく起動しない場合は、`AGENTS.md` のトラブルシューティングも参照してください。

---

人間向けの詳細手順は本READMEに、エージェント（AI）向けの運用メモは `AGENTS.md` にまとめています。
