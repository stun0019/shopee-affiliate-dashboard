import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(testDirectory, "../app.js");

function loadAppDataCore() {
  const noop = () => {};
  const sandbox = vm.createContext({
    AbortController,
    Date,
    FileReader: class FileReader {},
    Intl,
    console,
    document: {
      addEventListener: noop,
      querySelector: () => ({}),
      querySelectorAll: () => [],
    },
    fetch: async () => ({ ok: true, text: async () => "" }),
    window: {
      addEventListener: noop,
      clearTimeout: noop,
      devicePixelRatio: 1,
      setTimeout: noop,
    },
  });

  vm.runInContext(fs.readFileSync(appPath, "utf8"), sandbox, { filename: appPath });
  return vm.runInContext(
    "({ getRecommendedRows, normalizePriority, normalizeRow, normalizeStatus, summarize })",
    sandbox,
  );
}

const {
  getRecommendedRows,
  normalizePriority,
  normalizeRow,
  normalizeStatus,
  summarize,
} = loadAppDataCore();

function candidate({
  product,
  score,
  priority = "中",
  date = "2026-07-18",
  estimatedCommission = 10,
}) {
  return {
    product,
    selectionScore: score,
    priority,
    date,
    estimatedCommission,
    revenue: null,
    status: "待發文",
  };
}

test("優先級 A/B/C 與高/中/低正規化為高/中/低", () => {
  const cases = new Map([
    ["A", "高"],
    ["B", "中"],
    ["C", "低"],
    ["高", "高"],
    ["中", "中"],
    ["低", "低"],
  ]);

  for (const [input, expected] of cases) {
    assert.equal(normalizePriority(input), expected, input);
  }
});

test("待發佈/發布/發文與已發佈/發布/發文正規化", () => {
  for (const input of ["待發佈", "待發布", "待發文"]) {
    assert.equal(normalizeStatus(input), "待發文", input);
  }

  for (const input of ["已發佈", "已發布", "已發文"]) {
    assert.equal(normalizeStatus(input), "已發文", input);
  }
});

test("選品分數優先，巨額預估佣金不能反超", () => {
  const rows = [
    candidate({ product: "高分商品", score: 88, estimatedCommission: 1 }),
    candidate({ product: "巨額佣金商品", score: 87, estimatedCommission: 999999999 }),
  ];

  assert.equal(getRecommendedRows(rows)[0].product, "高分商品");
});

test("選品同分依優先級、日期新鮮度、預估分潤依序決勝", () => {
  const byPriority = getRecommendedRows([
    candidate({ product: "高優先", score: 80, priority: "A", date: "2026-07-01", estimatedCommission: 1 }),
    candidate({ product: "中優先", score: 80, priority: "B", date: "2026-07-18", estimatedCommission: 999999 }),
  ]);
  assert.equal(byPriority[0].product, "高優先");

  const byFreshness = getRecommendedRows([
    candidate({ product: "較舊", score: 80, priority: "A", date: "2026-07-01", estimatedCommission: 999999 }),
    candidate({ product: "較新", score: 80, priority: "A", date: "2026-07-18", estimatedCommission: 1 }),
  ]);
  assert.equal(byFreshness[0].product, "較新");

  const byCommission = getRecommendedRows([
    candidate({ product: "較低預估", score: 80, priority: "A", date: "2026-07-18", estimatedCommission: 10 }),
    candidate({ product: "較高預估", score: 80, priority: "A", date: "2026-07-18", estimatedCommission: 11 }),
  ]);
  assert.equal(byCommission[0].product, "較高預估");
});

test("空白指標保留 null，字串 0 保留為真實 0", () => {
  const missing = normalizeRow({
    商品名稱: "缺值商品",
    曝光數: "",
    點擊數: " ",
    訂單數: "",
    實際分潤: "",
  });
  const zero = normalizeRow({
    商品名稱: "零值商品",
    曝光數: "0",
    點擊數: "0",
    訂單數: "0",
    實際分潤: "0",
  });

  assert.deepEqual(
    [missing.impressions, missing.clicks, missing.orders, missing.revenue],
    [null, null, null, null],
  );
  assert.deepEqual(
    [zero.impressions, zero.clicks, zero.orders, zero.revenue],
    [0, 0, 0, 0],
  );
  assert.equal(summarize([missing]).revenue, null);
  assert.equal(summarize([zero]).revenue, 0);
});

test("實際分潤空白時不以成交額乘佣金率代入", () => {
  const row = normalizeRow({
    商品名稱: "未回填實績商品",
    成交金額: "1000",
    佣金率: "10%",
    實際分潤: "",
  });

  assert.equal(row.revenue, null);
});

test("現有五筆選品依總分排序為 88、83、80、79、78", () => {
  const rows = [78, 88, 79, 83, 80].map((score) => candidate({
    product: `商品 ${score}`,
    score,
    priority: score % 2 ? "高" : "低",
    date: `2026-07-${String(score % 20 + 1).padStart(2, "0")}`,
    estimatedCommission: 1000 - score,
  }));

  assert.deepEqual(
    Array.from(getRecommendedRows(rows), (row) => row.selectionScore),
    [88, 83, 80, 79, 78],
  );
});
