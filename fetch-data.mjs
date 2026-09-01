#!/usr/bin/env node
/**
 * 抓取全部纳斯达克上市股 + 财报日历，生成 data.js 供本地静态网站使用。
 *
 * 用法： node fetch-data.mjs
 * 输出： data.js  （形如 window.__DATA__ = { generatedAt, companies, earnings }）
 *
 * 数据源（纳斯达克公开 API，免费、无需 Key）：
 *   1) 成分股筛选器  /api/screener/stocks?download=true  → 含 symbol/name/marketCap/sector/industry
 *   2) 财报日历      /api/calendar/earnings?date=YYYY-MM-DD → 当天发布财报的公司（含市值/EPS/盘前盘后）
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// —— 可配置项 ——
const EXCHANGE = "nasdaq";       // 交易所：nasdaq（纳斯达克上市） / nyse / amex
const DAYS_BACK = 7;             // 向前抓取天数（今天往前）
const DAYS_FORWARD = 60;         // 向后抓取天数（财报日期通常只提前 4~8 周公布）
const DELAY_MS = 180;            // 每次请求间隔，避免触发限流
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// —— 工具函数 ——
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 把 "$302,845,854,000" 或 "5,320,798,000,000" 或 "63671539.00" 解析为数字 */
function parseMarketCap(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 财报时间字段 → 统一标记 */
function mapTime(t) {
  if (t === "time-after-hours") return "AMC"; // 盘后
  if (t === "time-pre-market") return "BMO";   // 盘前
  return "TAS"; // time-not-supplied / 待定
}

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(600 * (i + 1));
    }
  }
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// —— 1) 抓取成分股（download=true 返回全字段，含 sector/industry）——
async function fetchCompanies() {
  console.log("抓取成分股列表 …");
  const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&exchange=${EXCHANGE}&download=true`;
  const json = await fetchJson(url);
  const rows = json?.data?.table?.rows ?? json?.data?.rows ?? [];
  const total = json?.data?.totalrecords ?? rows.length;
  console.log(`  交易所 ${EXCHANGE} 共 ${total} 家，实际返回 ${rows.length} 家`);

  const companies = rows
    .map((r) => ({
      symbol: r.symbol,
      name: String(r.name || "").replace(/\s+(Common Stock|Class [A-C]|American Depositary Shares?|Ordinary Shares?|Inc\.?|Corporation|Corp\.?|plc|PLC|Ltd\.?|Limited|Holdings?|Company)$/i, "").trim(),
      marketCap: parseMarketCap(r.marketCap),
      sector: r.sector || "—",
      industry: r.industry || "—",
      country: r.country || "—",
    }))
    .filter((c) => c.symbol && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap);

  // 全部纳斯达克上市股（市值 > 0），不再截取前 N 家
  console.log(`  纳入 ${companies.length} 家：最大 ${companies[0]?.symbol} ${(companies[0]?.marketCap / 1e12).toFixed(2)}T`);
  return companies;
}

// —— 2) 抓取财报日历（逐日）——
async function fetchEarnings(topCompanies) {
  const bySymbol = new Map(topCompanies.map((c) => [c.symbol, c]));
  const today = new Date();
  const events = [];

  const start = new Date(today);
  start.setDate(start.getDate() - DAYS_BACK);
  const end = new Date(today);
  end.setDate(end.getDate() + DAYS_FORWARD);

  console.log(`抓取财报日历 ${fmtDate(start)} ~ ${fmtDate(end)} …`);
  const days = Math.round((end - start) / 86400000) + 1;

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = fmtDate(d);
    try {
      const json = await fetchJson(
        `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`
      );
      const rows = json?.data?.rows ?? [];
      for (const r of rows) {
        const c = bySymbol.get(r.symbol);
        if (!c) continue; // 只保留纳斯达克上市股内的公司
        events.push({
          symbol: r.symbol,
          name: r.name || c.name,
          date: dateStr,
          time: mapTime(r.time),
          epsForecast: r.epsForecast || "—",
          noOfEsts: r.noOfEsts ? parseInt(r.noOfEsts, 10) : 0,
          fiscalQuarterEnding: r.fiscalQuarterEnding || "—",
          marketCap: c.marketCap,
          sector: c.sector,
          industry: c.industry,
        });
      }
      if (i % 10 === 0) process.stdout.write(`.`);
    } catch (e) {
      console.warn(`\n  [warn] ${dateStr} 抓取失败: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n  共命中纳斯达克上市股内财报 ${events.length} 条`);
  return events;
}

// —— 3) 生成 data.js ——
function buildDataJs(companies, earnings) {
  // 按日期分组，组内按市值降序
  const byDate = {};
  for (const e of earnings) {
    (byDate[e.date] ??= []).push(e);
  }
  const earningsByDate = {};
  for (const [date, list] of Object.entries(byDate)) {
    earningsByDate[date] = list.sort((a, b) => b.marketCap - a.marketCap);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    meta: { exchange: EXCHANGE, total: companies.length, daysBack: DAYS_BACK, daysForward: DAYS_FORWARD },
    companies,
    earnings,           // 平铺数组（日期升序）
    earningsByDate,     // { "2026-09-01": [ ...按市值降序 ] }
  };

  const js =
    "// 本文件由 fetch-data.mjs 自动生成，请勿手动编辑。重新抓取：node fetch-data.mjs\n" +
    `window.__DATA__ = ${JSON.stringify(payload)};\n`;

  const out = join(__dirname, "data.js");
  writeFileSync(out, js, "utf8");
  console.log(`已写入 ${out}（${(js.length / 1024).toFixed(0)} KB）`);
}

// —— 主流程 ——
async function main() {
  try {
    const companies = await fetchCompanies();
    const earnings = await fetchEarnings(companies);
    buildDataJs(companies, earnings);
    console.log("✅ 完成。打开 index.html 查看。");
  } catch (e) {
    console.error("❌ 抓取失败：", e);
    process.exit(1);
  }
}

main();
