const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");

dotenv.config();

const prisma = new PrismaClient();

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const [headerLine, ...lines] = raw.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return headers.reduce((acc, header, idx) => {
      acc[header] = values[idx];
      return acc;
    }, {});
  });
}

async function seed() {
  await prisma.pick.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.corporateEvent.deleteMany();
  await prisma.dailyPrice.deleteMany();
  await prisma.symbol.deleteMany();

  const symbols = parseCsv(path.join(__dirname, "../data/sample/symbols.csv"));
  for (const symbol of symbols) {
    await prisma.symbol.create({
      data: {
        code: symbol.code,
        name: symbol.name,
        sector: symbol.sector || null,
      },
    });
  }

  const prices = parseCsv(path.join(__dirname, "../data/sample/daily_prices.csv"));
  for (const price of prices) {
    await prisma.dailyPrice.create({
      data: {
        code: price.code,
        date: new Date(price.date),
        open: Number(price.open),
        high: Number(price.high),
        low: Number(price.low),
        close: Number(price.close),
        volume: Number(price.volume),
        vwap: price.vwap ? Number(price.vwap) : null,
      },
    });
  }

  const events = parseCsv(path.join(__dirname, "../data/sample/events.csv"));
  for (const event of events) {
    await prisma.corporateEvent.create({
      data: {
        code: event.code,
        date: new Date(event.date),
        type: event.type,
        title: event.title,
        summary: event.summary || null,
        source: event.source,
        scoreRaw: event.score_raw ? Number(event.score_raw) : null,
      },
    });
  }
}

seed()
  .then(() => {
    console.log("Seed data inserted");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
