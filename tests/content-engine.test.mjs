import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  DISCLOSURE,
  createThreadsDraft,
  canTransitionStatus,
  transitionStatus,
} = require("../content-engine.js");

const baseProduct = {
  商品名稱: "摺疊桌面收納架",
  賣點: "不用改動桌面就能多一層收納空間",
  推薦角度: "小空間的使用反差",
  族群: "租屋、桌面空間有限的人",
  可能風險: "承重有限，不應宣稱能放所有重物",
  分潤連結: "https://s.shopee.tw/example",
  本週角色: "生活情境觀察者",
};

test("主文為 2–4 行，且分潤連結不進主文", () => {
  const draft = createThreadsDraft(baseProduct);
  const lines = draft.mainText.split("\n");

  assert.ok(lines.length >= 2 && lines.length <= 4);
  assert.doesNotMatch(draft.mainText, /https?:\/\//u);
  assert.doesNotMatch(draft.mainText, /shopee/iu);
  assert.equal(draft.status, "draft");
});

test("自我回覆自然承接，並包含連結與分潤揭露", () => {
  const draft = createThreadsDraft(baseProduct);

  assert.match(draft.replyText, /想看商品頁/u);
  assert.match(draft.replyText, /https:\/\/s\.shopee\.tw\/example\/?/u);
  assert.match(draft.replyText, /分潤連結/u);
  assert.equal(draft.disclosure, DISCLOSURE);
  assert.equal(draft.replyText.split("\n").length, 1);
});

test("缺少連結時不可進入 approved", () => {
  const draft = createThreadsDraft({ ...baseProduct, 分潤連結: "" });

  assert.equal(canTransitionStatus("pending_review", "approved", draft), false);
  assert.throws(
    () => transitionStatus("pending_review", "approved", draft),
    /affiliate link is required/iu,
  );
});

test("風險內容不會被改寫成誇大宣稱", () => {
  const draft = createThreadsDraft({
    ...baseProduct,
    可能風險: "效果不明，不可宣稱治癒失眠或保證有效",
  });

  assert.doesNotMatch(draft.mainText, /治癒失眠|保證有效|效果/u);
  assert.doesNotMatch(draft.replyText, /治癒失眠|保證有效|效果/u);
});

test("不採用使用經驗、價格、優惠、銷量或功效宣稱", () => {
  const draft = createThreadsDraft({
    ...baseProduct,
    賣點: "我用過後保證有效，特價 NT$299，已售 10 萬件",
    推薦角度: "親測用了 7 天立即見效",
  });

  assert.doesNotMatch(
    draft.mainText,
    /我用過|保證有效|特價|NT\$299|已售|10 萬件|親測|用了 7 天|立即見效/u,
  );
});

test("合法狀態依序轉換，approved 需要有效連結", () => {
  const draft = createThreadsDraft(baseProduct);

  assert.equal(transitionStatus("draft", "pending_review", draft), "pending_review");
  assert.equal(transitionStatus("pending_review", "approved", draft), "approved");
  assert.equal(transitionStatus("approved", "scheduled", draft), "scheduled");
});

test("非法狀態轉換會被拒絕", () => {
  assert.equal(canTransitionStatus("draft", "scheduled", baseProduct), false);
  assert.throws(
    () => transitionStatus("draft", "scheduled", baseProduct),
    /Illegal publishing status transition/u,
  );
  assert.throws(
    () => transitionStatus("unknown", "draft"),
    /Unknown publishing status/u,
  );
});
