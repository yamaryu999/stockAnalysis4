# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
COPY tsconfig.json tsconfig.base.json vitest.config.ts .eslintrc.json .prettierrc.json ./
COPY packages ./packages
COPY apps ./apps
COPY config ./config
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm install

FROM deps AS builder
COPY . .
RUN npm run prisma:generate
RUN npm --workspace packages/core run build

FROM builder AS api-builder
RUN npm --workspace apps/api run build

FROM builder AS web-builder
RUN npm --workspace apps/web run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-builder /app /app
EXPOSE 3001
ENV PORT=3001
CMD ["npm", "--workspace", "apps/api", "run", "start"]

FROM node:20-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=web-builder /app /app
ENV PORT=3000
ENV NEXT_PUBLIC_API_URL=http://api:3001
EXPOSE 3000
CMD ["npm", "--workspace", "apps/web", "run", "start"]

FROM python:3.11-slim AS worker
WORKDIR /app
COPY --from=builder /app /app
RUN pip install --no-cache-dir -r jobs/ingest/requirements.txt
ENTRYPOINT ["python", "-m", "jobs.ingest.main"]
