// node --test tests/   (no dependencies)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crm = require("../tbot-ui-live-crm.js");

test("private numbers are partially masked, dates are not", () => {
  assert.equal(crm.maskPhone("+8619912345777"), "+861*******777");
  assert.equal(crm.safeText("call +254 700 111 222 on 2026-10-01"), "call +254******222 on 2026-10-01");
  assert.equal(crm.safeText("already +861*******777"), "already +861*******777");
  assert.match(crm.safeText("token=abcdefghijklmnop1234"), /\[凭证已隐藏\]/);
});

test("drafted shows 草稿, blocked shows 被拦截, inbound has no status", () => {
  assert.equal(crm.statusLabel({direction: "out", status: "drafted"}), "草稿");
  assert.equal(crm.statusLabel({direction: "out", status: "blocked"}), "被拦截");
  assert.equal(crm.statusLabel({direction: "out", status: "sent"}), "已发送");
  assert.equal(crm.statusLabel({direction: "in", status: "blocked"}), "");
});

test("labels are Chinese", () => {
  assert.equal(crm.channelLabel("website"), "网站聊天");
  assert.equal(crm.stageLabel("negotiating"), "议价中");
  assert.equal(crm.stageLabel(""), "未设置");
});

test("turns sort oldest first; missing text is explained", () => {
  const t = crm.sortTurns([{id: 2, ts: "2026-10-02T00:00:00Z"}, {id: 1, ts: "2026-10-01T00:00:00Z"}]);
  assert.deepEqual(t.map((x) => x.id), [1, 2]);
  assert.equal(crm.turnText({text: "", text_missing: true, missing_note: "sticker"}), "[无文字内容：sticker]");
});

test("query strings and detail paths are encoded", () => {
  assert.equal(crm.listQuery({party: "supplier", q: "三一 38m", channel: "whatsapp", stage: "new", unanswered: true}),
    "/api/ui/crm/buyers?party=supplier&q=%E4%B8%89%E4%B8%80%2038m&channel=whatsapp&stage=new&unanswered=1&limit=500");
  assert.equal(crm.detailPath("b_abc"), "/api/ui/crm/buyers/b_abc");
});

test("fixture hook filters like the Worker", () => {
  const fx = {parties: [{id: "b_aaaa1", party_type: "buyer", channels: ["tiktok"], unanswered: true},
                        {id: "b_bbbb2", party_type: "supplier", channels: ["email"]}]};
  assert.deepEqual(crm.fixtureResponse(fx, "/api/ui/crm/buyers?party=buyer&unanswered=1").items.map((p) => p.id), ["b_aaaa1"]);
  assert.equal(crm.fixtureResponse(fx, "/api/ui/crm/buyers/b_bbbb2").party.id, "b_bbbb2");
});

test("page wiring: sidebar link next to 沙盘记录, panel, script, nav title, refresh guard", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "tbot-ui.html"), "utf8");
  assert.match(html, /data-module="sandbox"[^>]*>沙盘记录<\/a><a class="side-link" data-module="crm" href="#crm">客户画像<\/a>/);
  assert.match(html, /data-panel="crm"/);
  assert.match(html, /<script src="\.\/tbot-ui-live-crm\.js\?v=[^"]+"><\/script>/);
  for (const id of ["crm-search", "crm-party", "crm-channel", "crm-stage", "crm-unanswered", "crm-list", "crm-count", "crm-chat", "crm-facts", "crm-identities"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-nav-20260810.js"), "utf8"), /"crm":\["客户画像"/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-refresh-guard.js"), "utf8"), /install\('crm', 'crm-count', 'crm-refresh'/);
  // the module never writes: only GETs, credentials included, no inline script added
  const js = fs.readFileSync(path.join(root, "tbot-ui-live-crm.js"), "utf8");
  assert.doesNotMatch(js, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(js, /innerHTML\s*=(?!\s*""\s*;)/);   // only innerHTML = "" (clears); text goes through textContent
});
