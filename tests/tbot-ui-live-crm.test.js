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
  assert.doesNotMatch(crm.listQuery({party: "buyer"}), /sort=/);
});

test("buyers sort by latest interaction, then by turn count with time breaking ties", () => {
  const items = [
    {id: "b_old11", turn_count: 2, last_message: {ts: "2026-10-01T00:00:00Z"}},
    {id: "b_new22", turn_count: 2, last_message: {ts: "2026-10-03T01:00:00Z"}},
    {id: "b_busy3", turn_count: 8, last_message: {ts: "2026-10-02T00:00:00Z"}},
    {id: "b_bbb44", turn_count: 4, last_message: {ts: "2026-10-04T00:00:00Z"}},
    {id: "b_aaa55", turn_count: 4, last_message: {ts: "2026-10-04T00:00:00Z"}},
  ];
  const order = items.map((p) => p.id);
  assert.deepEqual(crm.sortParties(items).map((p) => p.id), ["b_aaa55", "b_bbb44", "b_new22", "b_busy3", "b_old11"]);
  assert.deepEqual(crm.sortParties(items, "latest").map((p) => p.id), ["b_aaa55", "b_bbb44", "b_new22", "b_busy3", "b_old11"]);
  assert.deepEqual(crm.sortParties(items, "frequency").map((p) => p.id), ["b_busy3", "b_aaa55", "b_bbb44", "b_new22", "b_old11"]);
  assert.deepEqual(crm.sortParties(items, "nope").map((p) => p.id), ["b_aaa55", "b_bbb44", "b_new22", "b_busy3", "b_old11"]);
  assert.deepEqual(items.map((p) => p.id), order);
  // +07:00 is earlier than the same clock time in UTC, so numeric time wins over string order.
  const utc = crm.lastInteractionMs({last_message: {ts: "2026-10-03T01:00:00Z"}});
  const plus7 = crm.lastInteractionMs({last_outbound_at: "2026-10-03T07:00:00+07:00"});
  assert.ok(utc > plus7);
  assert.equal(crm.partyTurnCount({turn_count: 0, turns: [{}, {}, {}]}), 0);
  assert.equal(crm.normalizeSort("frequency"), "frequency");
  assert.equal(crm.normalizeSort(""), "latest");
});

test("missing turn count and last timestamp are computed from the payload", () => {
  const fromTurns = [
    {id: "b_short", turns: [{ts: "2026-10-06T00:00:00Z"}, {ts: "2026-10-01T00:00:00Z"}]},
    {id: "b_long1", messages: [{ts: "2026-10-02T00:00:00Z"}, {timestamp: "2026-10-03T00:00:00Z"}, {ts: "2026-10-02T12:00:00Z"}]},
    {id: "b_inout", last_inbound_at: "2026-10-01T00:00:00Z", last_outbound_at: "2026-10-08T00:00:00Z"},
    {id: "b_none1"},
  ];
  assert.equal(crm.partyTurnCount(fromTurns[0]), 2);
  assert.equal(crm.partyTurnCount(fromTurns[1]), 3);
  assert.equal(crm.partyTurnCount({message_count: "4"}), 4);
  assert.equal(crm.partyTurnCount(fromTurns[2]), 0);
  assert.equal(crm.lastInteractionMs({last_message: {preview: "x"}, turns: [{ts: "2026-10-04T00:00:00Z"}]}), Date.parse("2026-10-04T00:00:00Z"));
  assert.equal(crm.lastInteractionMs(fromTurns[2]), Date.parse("2026-10-08T00:00:00Z"));
  assert.deepEqual(crm.sortParties(fromTurns, "latest").map((p) => p.id), ["b_inout", "b_short", "b_long1", "b_none1"]);
  assert.deepEqual(crm.sortParties(fromTurns, "frequency").map((p) => p.id), ["b_long1", "b_short", "b_inout", "b_none1"]);
  assert.equal(crm.lastInteractionMs({first_seen: "2026-09-01T00:00:00Z"}), Date.parse("2026-09-01T00:00:00Z"));
});

test("sort choice is remembered in localStorage", () => {
  const mem = {v: null, getItem() { return this.v; }, setItem(k, val) { this.k = k; this.v = val; }};
  assert.equal(crm.SORT_STORAGE_KEY, "tbot-crm-sort");
  assert.equal(crm.readStoredSort(mem), "latest");
  assert.equal(crm.writeStoredSort(mem, "frequency"), "frequency");
  assert.equal(mem.k, "tbot-crm-sort");
  assert.equal(crm.readStoredSort(mem), "frequency");
  assert.equal(crm.writeStoredSort(mem, "garbage"), "latest");
  assert.equal(crm.readStoredSort(null), "latest");
  assert.equal(crm.writeStoredSort(null, "frequency"), "frequency");
  assert.equal(crm.readStoredSort({getItem() { throw new Error("blocked"); }}), "latest");
  assert.equal(crm.writeStoredSort({setItem() { throw new Error("quota"); }}, "frequency"), "frequency");
});

test("the sort control reorders the loaded list without another request", async () => {
  const ids = {};
  function makeEl() {
    return {
      children: [], attrs: {}, className: "", textContent: "", value: "", checked: false, options: [], listeners: {},
      classList: {toggle() {}},
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      set innerHTML(value) { this._html = value; if (value === "") this.children.length = 0; },
      get innerHTML() { return this._html || ""; },
    };
  }
  function register(id, extra) {
    const node = Object.assign(makeEl(), extra || {});
    ids[id] = node;
    return node;
  }
  const sort = register("crm-sort", {value: "latest", options: [{value: "latest"}, {value: "frequency"}]});
  register("crm-party", {value: "buyer"});
  register("crm-search"); register("crm-channel"); register("crm-stage"); register("crm-unanswered");
  const list = register("crm-list");
  register("crm-count"); register("crm-snapshot-at"); register("crm-facts"); register("crm-identities");
  register("crm-selected-title"); register("crm-selected-badges"); register("crm-chat"); register("module-feedback");
  const prev = {document: global.document, location: global.location, addEventListener: global.addEventListener, localStorage: global.localStorage, fixture: global.__TBOT_CRM_FIXTURE__};
  global.document = {
    getElementById(id) { return ids[id] || null; },
    addEventListener() {},
    createElement() { return makeEl(); },
    querySelector() { return null; },
  };
  global.location = {hash: "#crm", replace() { throw new Error("unexpected redirect"); }};
  global.addEventListener = () => {};
  const storage = {v: "frequency", getItem() { return this.v; }, setItem(k, val) { this.k = k; this.v = val; }};
  global.localStorage = storage;
  global.__TBOT_CRM_FIXTURE__ = {snapshot_at: "2026-10-17T17:00:00+07:00", parties: [
    {id: "b_old11", party_type: "buyer", name: "Old", turn_count: 1, last_message: {ts: "2026-10-01T00:00:00Z", preview: "call +254 700 111 222"}},
    {id: "b_new22", party_type: "buyer", name: "New", turn_count: 1, last_message: {ts: "2026-10-05T00:00:00Z", preview: "new"}},
    {id: "b_busy3", party_type: "buyer", name: "Busy", turn_count: 9, last_message: {ts: "2026-10-03T00:00:00Z", preview: "busy"}},
  ]};
  function names() {
    return list.children.map((row) => row.children[0].children[0].textContent);
  }
  try {
    crm.mount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sort.value, "frequency");
    assert.deepEqual(names(), ["Busy", "New", "Old"]);
    assert.match(list.children[2].children[2].textContent, /\+254\*{6}222/);
    sort.value = "latest";
    sort.listeners.change();
    assert.equal(storage.v, "latest");
    assert.equal(storage.k, "tbot-crm-sort");
    assert.deepEqual(names(), ["New", "Busy", "Old"]);
  } finally {
    if (prev.document === undefined) delete global.document; else global.document = prev.document;
    if (prev.location === undefined) delete global.location; else global.location = prev.location;
    if (prev.addEventListener === undefined) delete global.addEventListener; else global.addEventListener = prev.addEventListener;
    if (prev.localStorage === undefined) delete global.localStorage; else global.localStorage = prev.localStorage;
    if (prev.fixture === undefined) delete global.__TBOT_CRM_FIXTURE__; else global.__TBOT_CRM_FIXTURE__ = prev.fixture;
  }
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
  for (const id of ["crm-search", "crm-party", "crm-channel", "crm-stage", "crm-unanswered", "crm-sort", "crm-list", "crm-count", "crm-chat", "crm-facts", "crm-identities"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /<select id="crm-sort" aria-label="排序"><option value="latest"[^>]*>按最新时间<\/option><option value="frequency">按互动频率<\/option><\/select>/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-nav-20260810.js"), "utf8"), /"crm":\["客户画像"/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-refresh-guard.js"), "utf8"), /install\('crm', 'crm-count', 'crm-refresh'/);
  // the module never writes: only GETs, credentials included, no inline script added
  const js = fs.readFileSync(path.join(root, "tbot-ui-live-crm.js"), "utf8");
  assert.match(js, /sortParties\(state\.items/);
  assert.match(js, /tbot-crm-sort/);
  assert.doesNotMatch(js, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(js, /innerHTML\s*=(?!\s*""\s*;)/);   // only innerHTML = "" (clears); text goes through textContent
});
