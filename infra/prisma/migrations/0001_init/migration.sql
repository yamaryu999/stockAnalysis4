-- CreateTable
CREATE TABLE "Symbol" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyPrice" (
    "code" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" NUMERIC NOT NULL,
    "high" NUMERIC NOT NULL,
    "low" NUMERIC NOT NULL,
    "close" NUMERIC NOT NULL,
    "volume" INTEGER NOT NULL,
    "vwap" NUMERIC,
    CONSTRAINT "DailyPrice_pkey" PRIMARY KEY ("code", "date"),
    CONSTRAINT "DailyPrice_code_fkey" FOREIGN KEY ("code") REFERENCES "Symbol" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CorporateEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "scoreRaw" REAL,
    CONSTRAINT "CorporateEvent_code_fkey" FOREIGN KEY ("code") REFERENCES "Symbol" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feature" (
    "code" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "value" REAL NOT NULL,
    CONSTRAINT "Feature_code_fkey" FOREIGN KEY ("code") REFERENCES "Symbol" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Feature_pkey" PRIMARY KEY ("code", "date", "name")
);

-- CreateTable
CREATE TABLE "Pick" (
    "date" DATETIME NOT NULL,
    "code" TEXT NOT NULL,
    "scoreFinal" REAL NOT NULL,
    "reasons" TEXT NOT NULL,
    "stats" TEXT,
    CONSTRAINT "Pick_pkey" PRIMARY KEY ("date", "code"),
    CONSTRAINT "Pick_code_fkey" FOREIGN KEY ("code") REFERENCES "Symbol" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "DailyPrice_date_idx" ON "DailyPrice" ("date");
CREATE INDEX "CorporateEvent_code_date_idx" ON "CorporateEvent" ("code", "date");
CREATE INDEX "CorporateEvent_date_type_idx" ON "CorporateEvent" ("date", "type");
CREATE INDEX "Feature_date_name_idx" ON "Feature" ("date", "name");
CREATE INDEX "Pick_scoreFinal_idx" ON "Pick" ("scoreFinal");
