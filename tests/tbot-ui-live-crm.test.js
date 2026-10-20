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
  for (const id of ["crm-search", "crm-party", "crm-channel", "crm-stage", "crm-unanswered", "crm-sort", "crm-list", "crm-count", "crm-chat", "crm-facts", "crm-identities", "crm-composer", "crm-compose-text", "crm-compose-send", "crm-compose-status"]) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /<select id="crm-sort" aria-label="排序"><option value="latest"[^>]*>按最新时间<\/option><option value="frequency">按互动频率<\/option><\/select>/);
  assert.match(html, /id="crm-compose-text"[^>]*placeholder="写草稿（中文即可），Gbot 会润色翻译后发送"/);
  assert.match(html, /id="crm-compose-send"[^>]*>发送给 Gbot<\/button>/);
  assert.match(html, /id="crm-composer"[^>]*hidden/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-modules.css"), "utf8"), /\.crm-text-zh\{[^}]*font-size:11px/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-nav-20260810.js"), "utf8"), /"crm":\["客户画像"/);
  assert.match(fs.readFileSync(path.join(root, "tbot-ui-refresh-guard.js"), "utf8"), /install\('crm', 'crm-count', 'crm-refresh'/);
  // the only write is POST /api/ui/crm/commands; text still goes through textContent
  const js = fs.readFileSync(path.join(root, "tbot-ui-live-crm.js"), "utf8");
  assert.match(js, /sortParties\(state\.items/);
  assert.match(js, /tbot-crm-sort/);
  assert.match(js, /\/api\/ui\/crm\/commands/);
  assert.equal((js.match(/method:\s*"POST"/g) || []).length, 1);
  assert.doesNotMatch(js, /method:\s*"(PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(js, /innerHTML\s*=(?!\s*""\s*;)/);   // only innerHTML = "" (clears); text goes through textContent
});

test("text_zh is shown only when it differs, and command status maps to 已提交 / 已发送 / 失败", () => {
  assert.equal(crm.translationText({text: "Need a pump", text_zh: "需要一台泵车"}), "需要一台泵车");
  assert.equal(crm.translationText({text: "你好", text_zh: "  你好  "}), "");
  assert.equal(crm.translationText({text: "你好", text_zh: ""}), "");
  assert.equal(crm.translationText({text: "你好"}), "");
  assert.equal(crm.translationText({text: "hi", text_zh: "电话 +254 700 111 222"}), "电话 +254******222");
  assert.equal(crm.translationText({text: "hi", text_zh: "<b>token=abcdefghijklmnop1234</b>"}), "<b>[凭证已隐藏]</b>");
  assert.equal(crm.commandStatusText({status: "submitted"}), "已提交");
  assert.equal(crm.commandStatusText({status: "queued"}), "已提交");
  assert.equal(crm.commandStatusText({status: "sent"}), "已发送");
  assert.equal(crm.commandStatusText({status: "failed", note: "线路不通 +254 700 111 222"}), "失败：线路不通 +254******222");
  assert.equal(crm.commandStatusText({status: "failed", note: ""}), "失败");
  assert.equal(crm.commandOutcome({status: "done"}).pending, false);
  assert.equal(crm.commandOutcome({status: "accepted"}).pending, true);
  assert.deepEqual(crm.commandsFrom({commands: [{id: "a"}], party: {commands: [{id: "b"}]}}).map((c) => c.id), ["a"]);
  assert.deepEqual(crm.commandsFrom({party: {commands: [{id: "b"}]}}).map((c) => c.id), ["b"]);
  assert.deepEqual(crm.commandsFrom({party: {}}), []);
  const latest = crm.latestCommand([
    {id: "c1", type: "approve_draft", turn_id: 7, created_at: "2026-10-01T00:00:00Z"},
    {id: "c2", type: "approve_draft", turn_id: "7", created_at: "2026-10-02T00:00:00Z"},
    {id: "c3", type: "compose", created_at: "2026-10-03T00:00:00Z"},
  ], "approve_draft", 7);
  assert.equal(latest.id, "c2");
  const fx = {parties: [{id: "b_bbbb2", party_type: "supplier", commands: [{id: "on-party", type: "compose", status: "sent"}]}],
    commandsByParty: {"b_bbbb2": [{id: "override", type: "compose", status: "failed", note: "x"}]}};
  assert.equal(crm.fixtureResponse(fx, "/api/ui/crm/buyers/b_bbbb2").commands[0].id, "override");
});

test("postCommand uses the session cookie and treats a missing route as 404", async () => {
  const prev = {fetch: global.fetch, location: global.location, fixture: global.__TBOT_CRM_FIXTURE__};
  const calls = [];
  delete global.__TBOT_CRM_FIXTURE__;
  global.location = {replace(url) { this.replaced = url; }};
  global.fetch = async (url, opts) => {
    calls.push({url, opts});
    const body = opts && opts.body && JSON.parse(opts.body);
    if (body && body.type === "approve_draft") {
      return {status: 200, ok: true, json: async () => ({id: "cmd_9"})};
    }
    if (body && body.text === "missing") {
      return {status: 404, ok: false, json: async () => ({ok: false, error: "not_found"})};
    }
    if (body && body.text === "boom") {
      return {status: 500, ok: false, json: async () => ({ok: false, note: "客户拒收 <b>"})};
    }
    return {status: 401, ok: false, json: async () => ({ok: false, error: "unauthorized"})};
  };
  try {
    assert.equal(crm.COMMANDS_PATH, "/api/ui/crm/commands");
    const created = await crm.postCommand({type: "approve_draft", party_id: "b_aaaa1", turn_id: 3});
    assert.equal(created.id, "cmd_9");
    assert.equal(calls[0].opts.method, "POST");
    assert.equal(calls[0].opts.credentials, "include");
    assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
    assert.match(calls[0].url, /\/api\/ui\/crm\/commands$/);
    assert.deepEqual(JSON.parse(calls[0].opts.body), {type: "approve_draft", party_id: "b_aaaa1", turn_id: 3});
    await assert.rejects(crm.postCommand({type: "compose", party_id: "b_aaaa1", text: "missing"}), (error) => error.code === "commands_missing" && error.status === 404);
    await assert.rejects(crm.postCommand({type: "compose", party_id: "b_aaaa1", text: "boom"}), (error) => error.code === "failed" && error.note === "客户拒收 <b>");
    await assert.rejects(crm.postCommand({type: "compose", party_id: "b_aaaa1", text: "nope"}), (error) => error.code === "unauthorized");
    assert.equal(global.location.replaced, "./tbot-login.html");
  } finally {
    if (prev.fetch === undefined) delete global.fetch; else global.fetch = prev.fetch;
    if (prev.location === undefined) delete global.location; else global.location = prev.location;
    if (prev.fixture === undefined) delete global.__TBOT_CRM_FIXTURE__; else global.__TBOT_CRM_FIXTURE__ = prev.fixture;
  }
});

function walk(node, pred, out) {
  out = out || [];
  if (!node || typeof node !== "object") return out;
  if (pred(node)) out.push(node);
  for (const child of node.children || []) walk(child, pred, out);
  return out;
}

async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

test("composer posts a draft, approve publishes once, and a 404 hides both", async () => {
  const ids = {};
  function makeEl() {
    return {
      children: [], attrs: {}, className: "", textContent: "", value: "", checked: false, options: [], listeners: {},
      hidden: false, disabled: false, type: "", placeholder: "", tagName: "",
      classList: {toggle() {}},
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      set innerHTML(value) { this._html = value; if (value === "") this.children.length = 0; },
      get innerHTML() { return this._html || ""; },
      get childNodes() { return this.children; },
    };
  }
  function register(id, extra) {
    const node = Object.assign(makeEl(), extra || {});
    ids[id] = node;
    return node;
  }
  register("crm-sort", {value: "latest", options: [{value: "latest"}, {value: "frequency"}]});
  register("crm-party", {value: "buyer"});
  register("crm-search"); register("crm-channel"); register("crm-stage"); register("crm-unanswered");
  const list = register("crm-list");
  register("crm-count"); register("crm-snapshot-at"); register("crm-facts"); register("crm-identities");
  register("crm-selected-title"); register("crm-selected-badges");
  const chat = register("crm-chat");
  register("module-feedback");
  const composer = register("crm-composer", {hidden: true});
  const textarea = register("crm-compose-text");
  const send = register("crm-compose-send");
  const status = register("crm-compose-status");
  const prev = {document: global.document, location: global.location, addEventListener: global.addEventListener, localStorage: global.localStorage, fixture: global.__TBOT_CRM_FIXTURE__, confirm: global.confirm, fetch: global.fetch};
  const posted = [];
  const confirms = [];
  let release = null;
  global.document = {
    getElementById(id) { return ids[id] || null; },
    addEventListener() {},
    createElement(tag) { const node = makeEl(); node.tagName = String(tag || "").toUpperCase(); return node; },
    createTextNode(text) { return {nodeType: 3, textContent: String(text), children: []}; },
    querySelector() { return null; },
  };
  global.location = {hash: "#crm", replace() { throw new Error("unexpected redirect"); }};
  global.addEventListener = () => {};
  global.localStorage = {v: "latest", getItem() { return this.v; }, setItem(k, val) { this.k = k; this.v = val; }};
  global.confirm = (message) => { confirms.push(message); return global.confirmAnswer; };
  global.confirmAnswer = true;
  global.fetch = () => { throw new Error("fixture should handle CRM requests"); };
  const partyId = "b_buyer1";
  global.__TBOT_CRM_FIXTURE__ = {
    snapshot_at: "2026-10-17T17:00:00+07:00",
    commandsByParty: {[partyId]: []},
    postCommand(body) {
      posted.push(JSON.parse(JSON.stringify(body)));
      if (body.type === "compose" && body.text === "hold") {
        return new Promise((resolve) => { release = () => resolve({id: "cmd_hold"}); });
      }
      if (body.type === "approve_draft" && body.turn_id === 2) {
        return new Promise((resolve) => { release = () => resolve({id: "cmd_approve"}); });
      }
      return {id: body.type === "compose" ? "cmd_1" : "cmd_approve"};
    },
    parties: [{
      id: partyId, party_type: "buyer", name: "Acme <b>", turn_count: 3,
      last_message: {ts: "2026-10-02T00:00:00Z", direction: "in", preview: "call +254 700 111 222"},
      turns: [
        {id: 1, ts: "2026-10-01T00:00:00Z", direction: "in", channel: "whatsapp", text: "Need a 38m pump", text_zh: "需要一台38米泵车 <b>x</b>"},
        {id: 2, ts: "2026-10-02T00:00:00Z", direction: "out", channel: "whatsapp", status: "drafted", text: "We have one", text_zh: "We have one"},
        {id: 3, ts: "2026-10-02T01:00:00Z", direction: "out", channel: "whatsapp", status: "sent", text: "Sent already", text_zh: "已发出 +254 700 111 222"},
      ],
    }],
  };
  function glosses() { return walk(chat, (node) => node.className === "crm-text-zh"); }
  function approveButtons() { return walk(chat, (node) => String(node.className || "").indexOf("crm-approve") !== -1); }
  try {
    crm.mount();
    await flush();
    assert.equal(composer.hidden, true);
    assert.equal(textarea.placeholder, "写草稿（中文即可），Gbot 会润色翻译后发送");
    list.children[0].listeners.click();
    await flush();
    assert.equal(composer.hidden, false);
    const lines = glosses();
    assert.equal(lines.length, 2);
    assert.equal(lines[0].textContent, "需要一台38米泵车 <b>x</b>");
    assert.equal(lines[0].children.length, 0);
    assert.equal(lines[1].textContent, "已发出 +254******222");
    assert.doesNotMatch(lines[1].textContent, /700 111/);
    const approve = approveButtons();
    assert.equal(approve.length, 1);
    assert.equal(approve[0].tagName, "BUTTON");
    assert.equal(approve[0].textContent, "草稿 · 同意发布");
    assert.equal(approve[0].disabled, false);

    textarea.value = "   ";
    send.listeners.click();
    await flush();
    assert.equal(posted.length, 0);
    assert.equal(send.disabled, false);

    textarea.value = "  请报38米价格  ";
    send.listeners.click();
    await flush();
    assert.equal(send.disabled, false);
    assert.equal(textarea.value, "");
    assert.deepEqual(posted[0], {type: "compose", party_id: partyId, text: "请报38米价格"});
    assert.equal(status.textContent, "已提交");

    global.__TBOT_CRM_FIXTURE__.commandsByParty[partyId] = [
      {id: "cmd_1", type: "compose", status: "sent", created_at: "2099-01-01T00:00:00Z", note: ""},
    ];
    list.children[0].listeners.click();
    await flush();
    assert.equal(status.textContent, "已发送");
    assert.equal(composer.hidden, false);

    global.__TBOT_CRM_FIXTURE__.commandsByParty[partyId] = [
      {id: "cmd_1", type: "compose", status: "failed", created_at: "2099-01-01T00:00:00Z", note: "失败原因 <img>"},
    ];
    list.children[0].listeners.click();
    await flush();
    assert.equal(status.textContent, "失败：失败原因 <img>");
    assert.match(status.className, /is-error/);

    textarea.value = "hold";
    send.listeners.click();
    assert.equal(send.disabled, true);
    send.listeners.click();
    await flush();
    assert.equal(send.disabled, true);
    assert.equal(posted.filter((body) => body.text === "hold").length, 1);
    release();
    await flush();
    assert.equal(send.disabled, false);
    assert.equal(textarea.value, "");

    const button = approveButtons()[0];
    global.confirmAnswer = false;
    button.listeners.click();
    await flush();
    assert.deepEqual(confirms, ["同意发布这条草稿？"]);
    assert.equal(posted.filter((body) => body.type === "approve_draft").length, 0);
    assert.equal(button.textContent, "草稿 · 同意发布");
    assert.equal(button.disabled, false);

    global.confirmAnswer = true;
    button.listeners.click();
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, "已提交");
    button.listeners.click();
    assert.equal(confirms.length, 2);
    await flush();
    assert.equal(posted.filter((body) => body.type === "approve_draft").length, 1);
    assert.deepEqual(posted.filter((body) => body.type === "approve_draft")[0], {type: "approve_draft", party_id: partyId, turn_id: 2});
    release();
    await flush();
    button.listeners.click();
    assert.equal(confirms.length, 2);
    assert.equal(posted.filter((body) => body.type === "approve_draft").length, 1);

    global.__TBOT_CRM_FIXTURE__.commandsByParty[partyId].push({
      id: "cmd_approve", type: "approve_draft", turn_id: 2, status: "sent", created_at: "2099-02-01T00:00:00Z", note: "",
    });
    list.children[0].listeners.click();
    await flush();
    const published = approveButtons()[0];
    assert.equal(published.disabled, true);
    assert.equal(published.textContent, "已发送");
    assert.equal(published.listeners.click, undefined);

    global.__TBOT_CRM_FIXTURE__.commandsByParty[partyId] = global.__TBOT_CRM_FIXTURE__.commandsByParty[partyId].map((command) => (
      command.id === "cmd_approve" ? Object.assign({}, command, {status: "failed", note: "对方拒收 +254 700 111 222"}) : command
    ));
    list.children[0].listeners.click();
    await flush();
    const failed = approveButtons()[0];
    assert.equal(failed.disabled, true);
    assert.equal(failed.textContent, "失败：对方拒收 +254******222");
    assert.equal(failed.listeners.click, undefined);

    global.__TBOT_CRM_FIXTURE__.commandsHttp = 404;
    textarea.value = "这条不该发出去";
    const before = posted.length;
    send.listeners.click();
    await flush();
    assert.equal(posted.length, before);
    assert.equal(composer.hidden, true);
    assert.equal(approveButtons().length, 0);
    assert.equal(walk(chat, (node) => node.tagName === "SPAN" && node.textContent === "草稿").length, 1);
  } finally {
    if (global.__TBOT_CRM_POLL__) clearInterval(global.__TBOT_CRM_POLL__);
    if (prev.document === undefined) delete global.document; else global.document = prev.document;
    if (prev.location === undefined) delete global.location; else global.location = prev.location;
    if (prev.addEventListener === undefined) delete global.addEventListener; else global.addEventListener = prev.addEventListener;
    if (prev.localStorage === undefined) delete global.localStorage; else global.localStorage = prev.localStorage;
    if (prev.fixture === undefined) delete global.__TBOT_CRM_FIXTURE__; else global.__TBOT_CRM_FIXTURE__ = prev.fixture;
    if (prev.confirm === undefined) delete global.confirm; else global.confirm = prev.confirm;
    if (prev.fetch === undefined) delete global.fetch; else global.fetch = prev.fetch;
  }
});
