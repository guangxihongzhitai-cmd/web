(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.mount();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // 客户画像: buyer / supplier profiles with full cross-channel history.
  // Data: box CRM snapshot (already masked on the box) served by the Worker behind
  // the same hzt_ui_session login as Clients.  The only write is
  // POST /api/ui/crm/commands (compose a draft, or approve one drafted turn).
  var API = "https://api.hongzhtaichina.com";
  var LIST_PATH = "/api/ui/crm/buyers";
  var COMMANDS_PATH = "/api/ui/crm/commands";
  var COMPOSE_PLACEHOLDER = "写草稿（中文即可），Gbot 会润色翻译后发送";
  var APPROVE_LABEL = "草稿 · 同意发布";
  var OFFLINE_TEXT = "暂无数据 / 后端未上线";
  var EMPTY_TEXT = "暂无客户画像";
  var ID_RE = /^b_[0-9a-z]{4,40}$/;
  var CHANNELS = {tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube",
    whatsapp: "WhatsApp", email: "邮件", phone: "电话", web: "网页", website: "网站聊天", wechat: "微信"};
  var STAGES = {"new": "新客户", engaged: "沟通中", qualified: "需求已确认", quoted: "已报价", negotiating: "议价中",
    won: "已成交", lost: "已流失", dormant: "沉睡", prospect: "潜在客户"};
  var PARTIES = {buyer: "客户", supplier: "供应商", internal: "内部"};
  var KINDS = {buyer: "买家", prospect: "潜在客户", partner: "合作方", supplier: "供应商", internal: "内部", spam: "垃圾信息"};
  var DIRECTIONS = {"in": "对方", out: "我方", note: "备注"};
  var STATUS = {drafted: "草稿", blocked: "被拦截", sent: "已发送", unverified: "未确认送达", pending: "待发送",
    failed: "发送失败", cancelled: "已取消"};
  var INTEREST = {brand: "品牌", model: "型号", boom_m: "臂长(米)", year: "年份", chassis: "底盘", budget: "预算",
    currency: "币种", use: "用途", quantity: "数量", destination: "目的地"};
  // Defence in depth: the box already masks; never let a full private number through.
  var PHONE_RE = /(?<![\w*])\+?\d[\d\s\-().]{6,}\d(?![\w*])/g;
  var DATE_RE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
  var SECRET_RE = /\b(api[_-]?key|token|secret|password|bearer)\b\s*[:=]?\s*[A-Za-z0-9._~+/=-]{12,}/gi;

  function maskPhone(value) {
    var raw = String(value || "");
    var digits = raw.replace(/\D/g, "");
    if (digits.length < 8 || DATE_RE.test(raw.trim())) return raw;
    var plus = raw.trim().charAt(0) === "+";
    var head = plus ? 3 : 4;
    return (plus ? "+" : "") + digits.slice(0, head) + new Array(Math.max(digits.length - head - 3, 3) + 1).join("*") + digits.slice(-3);
  }
  function safeText(value) {
    var text = value == null ? "" : String(value);
    SECRET_RE.lastIndex = 0; PHONE_RE.lastIndex = 0;
    return text.replace(SECRET_RE, "[凭证已隐藏]").replace(PHONE_RE, function (m) { return maskPhone(m); });
  }
  function displayTime(value) {
    var text = String(value || "").trim();
    if (!text) return "—";
    var d = new Date(text);
    if (isNaN(d.getTime())) return text.slice(0, 25);
    var local = new Date(d.getTime() + 7 * 3600 * 1000);   // 越南时间 UTC+7
    return local.toISOString().slice(0, 16).replace("T", " ") + "（UTC+7）";
  }
  function channelLabel(c) { return CHANNELS[c] || String(c || "未知渠道"); }
  function stageLabel(s) { return STAGES[s] || (s ? String(s) : "未设置"); }
  function statusLabel(turn) {
    if (!turn || turn.direction !== "out") return "";
    return turn.status_label || STATUS[turn.status] || "";
  }
  function statusClass(status) {
    return {drafted: "draft", blocked: "blocked", failed: "blocked", cancelled: "muted", unverified: "warn", pending: "warn"}[status] || "ok";
  }
  function listQuery(filters) {
    var q = [];
    var f = filters || {};
    q.push("party=" + encodeURIComponent(f.party || "buyer"));
    if (f.q) q.push("q=" + encodeURIComponent(f.q));
    if (f.channel) q.push("channel=" + encodeURIComponent(f.channel));
    if (f.stage) q.push("stage=" + encodeURIComponent(f.stage));
    if (f.unanswered) q.push("unanswered=1");
    q.push("limit=500");
    return LIST_PATH + "?" + q.join("&");
  }
  function detailPath(id) { return LIST_PATH + "/" + encodeURIComponent(id); }
  function sortTurns(turns) {
    return (Array.isArray(turns) ? turns : []).slice().sort(function (a, b) {
      var x = String(a && a.ts || ""), y = String(b && b.ts || "");
      if (x !== y) return x < y ? -1 : 1;
      return Number(a && a.id || 0) - Number(b && b.id || 0);
    });
  }
  // List order is applied in the browser to whatever /api/ui/crm/buyers already returned.
  var SORT_LATEST = "latest";
  var SORT_FREQUENCY = "frequency";
  var SORT_STORAGE_KEY = "tbot-crm-sort";
  function normalizeSort(value) {
    return String(value || "").trim().toLowerCase() === SORT_FREQUENCY ? SORT_FREQUENCY : SORT_LATEST;
  }
  function readStoredSort(storage) {
    try { return normalizeSort(storage && storage.getItem(SORT_STORAGE_KEY)); }
    catch (e) { return SORT_LATEST; }
  }
  function writeStoredSort(storage, value) {
    var mode = normalizeSort(value);
    try { if (storage && storage.setItem) storage.setItem(SORT_STORAGE_KEY, mode); }
    catch (e) {}
    return mode;
  }
  function stampMs(value) {
    if (value == null || value === "") return NaN;
    if (typeof value === "number") {
      if (!isFinite(value)) return NaN;
      if (value > 1e12) return value;
      if (value > 1e9) return value * 1000;
      return NaN;
    }
    var text = String(value).trim();
    if (!text) return NaN;
    if (/^\d{13}$/.test(text)) return Number(text);
    if (/^\d{10}$/.test(text)) return Number(text) * 1000;
    var ms = Date.parse(text);
    return isNaN(ms) ? NaN : ms;
  }
  function considerStamp(best, value) {
    var ms = stampMs(value);
    if (isNaN(ms)) return best;
    if (isNaN(best) || ms > best) return ms;
    return best;
  }
  function lastInteractionMs(party) {
    var p = party && typeof party === "object" ? party : {};
    var best = NaN;
    var lm = p.last_message;
    if (lm && typeof lm === "object") {
      best = considerStamp(best, lm.ts);
      best = considerStamp(best, lm.timestamp);
      best = considerStamp(best, lm.time);
    } else best = considerStamp(best, lm);
    best = considerStamp(best, p.last_interaction_at);
    best = considerStamp(best, p.last_inbound_at);
    best = considerStamp(best, p.last_outbound_at);
    var turns = Array.isArray(p.turns) ? p.turns : (Array.isArray(p.messages) ? p.messages : null);
    if (turns) {
      for (var i = 0; i < turns.length; i++) {
        var t = turns[i];
        if (t && typeof t === "object") {
          best = considerStamp(best, t.ts);
          best = considerStamp(best, t.timestamp);
          best = considerStamp(best, t.time);
        } else best = considerStamp(best, t);
      }
    }
    if (!isNaN(best)) return best;
    best = considerStamp(best, p.first_seen);
    return considerStamp(best, p.created_at);
  }
  function hasCount(value) {
    if (value == null || value === "") return false;
    var n = Number(value);
    return isFinite(n);
  }
  function partyTurnCount(party) {
    var p = party && typeof party === "object" ? party : {};
    if (hasCount(p.turn_count)) return Number(p.turn_count);
    if (hasCount(p.message_count)) return Number(p.message_count);
    if (Array.isArray(p.turns)) return p.turns.length;
    if (Array.isArray(p.messages)) return p.messages.length;
    return 0;
  }
  function compareId(a, b) {
    var x = String(a && a.id || ""), y = String(b && b.id || "");
    if (x === y) return 0;
    return x < y ? -1 : 1;
  }
  function compareLatest(a, b) {
    var x = lastInteractionMs(a), y = lastInteractionMs(b);
    var xOk = !isNaN(x), yOk = !isNaN(y);
    if (xOk && yOk && x !== y) return y - x;
    if (xOk !== yOk) return xOk ? -1 : 1;
    return compareId(a, b);
  }
  function compareFrequency(a, b) {
    var x = partyTurnCount(a), y = partyTurnCount(b);
    if (x !== y) return y - x;
    return compareLatest(a, b);
  }
  function sortParties(items, mode) {
    var list = (Array.isArray(items) ? items : []).slice();
    list.sort(normalizeSort(mode) === SORT_FREQUENCY ? compareFrequency : compareLatest);
    return list;
  }
  function turnText(turn) {
    if (turn.text_missing || !String(turn.text || "").trim()) {
      var note = safeText(turn.missing_note || "").trim();
      return "[无文字内容" + (note ? "：" + note : "") + "]";
    }
    return safeText(turn.text);
  }
  // Chinese gloss under a bubble. Hidden when missing, blank, or the same as the original.
  function translationText(turn) {
    if (!turn || turn.text_zh == null) return "";
    var zh = String(turn.text_zh);
    if (!zh.trim()) return "";
    var original = turn.text == null ? "" : String(turn.text);
    if (zh.trim() === original.trim()) return "";
    return safeText(zh);
  }
  function commandOutcome(command) {
    var status = String(command && command.status || "").trim().toLowerCase();
    var sent = status === "sent" || status === "delivered" || status === "completed" || status === "done" || status === "已发送";
    var failed = status === "failed" || status === "error" || status === "rejected" || status === "cancelled" || status === "canceled" || status === "失败";
    var note = failed ? safeText(command && command.note || "").trim() : "";
    return {label: failed ? "失败" : (sent ? "已发送" : "已提交"), note: note, pending: !sent && !failed, failed: failed, sent: sent};
  }
  function commandStatusText(command) {
    var outcome = commandOutcome(command || {});
    return outcome.failed && outcome.note ? outcome.label + "：" + outcome.note : outcome.label;
  }
  function commandsFrom(data) {
    if (!data || typeof data !== "object") return [];
    if (Array.isArray(data.commands)) return data.commands;
    if (data.party && Array.isArray(data.party.commands)) return data.party.commands;
    return [];
  }
  function latestCommand(commands, type, turnId) {
    var best = null;
    (Array.isArray(commands) ? commands : []).forEach(function (command) {
      if (!command || command.type !== type) return;
      if (turnId != null && String(command.turn_id) !== String(turnId)) return;
      if (!best) { best = command; return; }
      var next = String(command.created_at || ""), prev = String(best.created_at || "");
      if (next > prev || (next === prev && String(command.id) > String(best.id))) best = command;
    });
    return best;
  }
  function errorNote(error) {
    if (!error) return "";
    return String(error.note || error.message || "");
  }
  // 立即同步: separate from 刷新 (which only re-reads the snapshot).
  var SYNC_PATH = "/api/ui/crm/sync";
  var SYNC_LABEL = "立即同步";
  var SYNC_BUSY_LABEL = "同步中…";
  var SYNC_STALE_MS = 90 * 60 * 1000;
  function syncView(sync, httpError) {
    var s = sync && typeof sync === "object" ? sync : {};
    var state = String(s.state || "idle");
    var last = s.last_sync_at ? "上次同步：" + displayTime(s.last_sync_at) : "尚未手动同步";
    if (state === "pending" || state === "syncing") {
      // Never show 同步中 forever: a run with no result for 90 min is shown as timed out.
      var since = Date.parse(s.started_at || s.requested_at || "");
      if (!(isFinite(since) && Date.now() - since > SYNC_STALE_MS)) return {label: SYNC_BUSY_LABEL, disabled: true, busy: true, text: last};
      state = "timed_out";
    }
    var wait = Number(s.next_allowed_in_s || 0);
    var text = last;
    if (state === "timed_out") text = "同步超时 · " + last;
    else if (state === "failed") text = "同步失败 · " + last;
    if (httpError === 429 || wait > 0) {
      var mins = Math.max(1, Math.ceil(wait / 60));
      return {label: SYNC_LABEL, disabled: wait > 0, busy: false, text: text + " · 10 分钟内只能同步一次（约 " + mins + " 分钟后可再试）"};
    }
    return {label: SYNC_LABEL, disabled: false, busy: false, text: text};
  }
  function syncRequest(method) {
    var fixture = root.__TBOT_CRM_FIXTURE__;
    if (fixture && typeof fixture === "object") {
      if (typeof fixture.sync === "function") return Promise.resolve().then(function () { return fixture.sync(method); });
      return Promise.reject(Object.assign(new Error("offline"), {code: "offline"}));
    }
    var controller = root.AbortController ? new AbortController() : null;
    var timer = controller ? root.setTimeout(function () { controller.abort(); }, 15000) : 0;
    return fetch(API + SYNC_PATH, {method: method, credentials: "include", cache: "no-store",
                                   headers: {"Accept": "application/json"},
                                   signal: controller ? controller.signal : undefined}).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) {
          location.replace("./tbot-login.html");
          throw Object.assign(new Error("unauthorized"), {code: "unauthorized"});
        }
        if (response.status === 404) throw Object.assign(new Error("offline"), {code: "offline"});
        // 409 (already running) and 429 (rate limit) still carry the current record.
        if (data && data.sync && (response.ok || response.status === 409 || response.status === 429))
          return {status: response.status, sync: data.sync};
        throw Object.assign(new Error((data && data.error) || "request_failed"), {code: "failed"});
      });
    }).then(function (data) { if (timer) root.clearTimeout(timer); return data; },
            function (error) { if (timer) root.clearTimeout(timer); throw error; });
  }

  function postCommand(body) {
    var fixture = root.__TBOT_CRM_FIXTURE__;
    if (fixture && typeof fixture === "object") {
      if (fixture.commandsHttp === 404) return Promise.reject(Object.assign(new Error("not_found"), {code: "commands_missing", status: 404}));
      if (typeof fixture.postCommand === "function") return Promise.resolve().then(function () { return fixture.postCommand(body); });
      return Promise.resolve({ok: true, id: "cmd_fixture"});
    }
    var controller = root.AbortController ? new AbortController() : null;
    var timer = controller ? root.setTimeout(function () { controller.abort(); }, 15000) : 0;
    return fetch(API + COMMANDS_PATH, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: {"Accept": "application/json", "Content-Type": "application/json"},
      body: JSON.stringify(body), signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) {
          location.replace("./tbot-login.html");
          throw Object.assign(new Error("unauthorized"), {code: "unauthorized"});
        }
        if (response.status === 404) throw Object.assign(new Error("not_found"), {code: "commands_missing", status: 404});
        if (!response.ok || !data || data.ok === false || data.id == null || data.id === "") {
          throw Object.assign(new Error((data && (data.note || data.error)) || "request_failed"),
            {code: "failed", note: (data && (data.note || data.error)) || ""});
        }
        return data;
      });
    }).then(function (data) { if (timer) root.clearTimeout(timer); return data; },
            function (error) { if (timer) root.clearTimeout(timer); throw error; });
  }

  function mount() {
    var state = {items: [], selected: null, offline: false, loading: false, snapshotAt: null, facets: null, timer: 0,
      party: null, commandsAvailable: true, commands: [], localCommands: [], serverCommands: [], approving: {},
      approveButtons: {}, composing: false, composeNote: "", poll: 0};
    function el(id) { return document.getElementById(id); }
    function setMessage(message, error) {
      var feedback = el("module-feedback");
      if (!feedback) return;
      feedback.textContent = message || "";
      feedback.classList.toggle("is-error", Boolean(error));
    }
    function placeholder(node, text) {
      if (!node) return;
      node.innerHTML = "";
      var box = document.createElement("div");
      box.className = "data-placeholder";
      box.textContent = text;
      node.appendChild(box);
    }
    function moduleActive() {
      if (location.hash === "#crm") return true;
      var panel = document.querySelector('.module-panel[data-panel="crm"]');
      return Boolean(panel && panel.classList.contains("active"));
    }
    function filters() {
      function v(id) { var n = el(id); return n ? String(n.value || "").trim() : ""; }
      var un = el("crm-unanswered");
      return {party: v("crm-party") || "buyer", q: v("crm-search"), channel: v("crm-channel"), stage: v("crm-stage"),
              unanswered: Boolean(un && un.checked)};
    }
    function fillSelect(id, counts, labels, allText) {
      var node = el(id);
      if (!node || !counts) return;
      var keep = node.value;
      node.innerHTML = "";
      var all = document.createElement("option"); all.value = ""; all.textContent = allText; node.appendChild(all);
      Object.keys(counts).sort().forEach(function (k) {
        var o = document.createElement("option"); o.value = k; o.textContent = (labels[k] || k) + "（" + counts[k] + "）";
        node.appendChild(o);
      });
      node.value = keep && counts[keep] ? keep : "";
    }
    function renderSnapshotLine() {
      var line = el("crm-snapshot-at");
      if (!line) return;
      line.textContent = state.snapshotAt ? "数据更新于 " + displayTime(state.snapshotAt) : (state.offline ? "" : "尚未收到数据");
    }
    function browserStorage() {
      try { return root.localStorage; } catch (e) { return null; }
    }
    function currentSort() {
      var node = el("crm-sort");
      if (node) return normalizeSort(node.value);
      return readStoredSort(browserStorage());
    }
    function renderList() {
      state.items = sortParties(state.items, currentSort());
      var list = el("crm-list");
      var count = el("crm-count");
      if (!list) return;
      renderSnapshotLine();
      if (state.offline) { if (count) count.textContent = "0"; placeholder(list, OFFLINE_TEXT); return; }
      if (count) count.textContent = String(state.items.length);
      list.innerHTML = "";
      if (!state.items.length) { placeholder(list, state.snapshotAt ? "没有符合筛选的记录。" : EMPTY_TEXT); return; }
      state.items.forEach(function (p) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "client-row crm-row" + (state.selected === p.id ? " active" : "");
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", state.selected === p.id ? "true" : "false");
        var head = document.createElement("div");
        head.className = "client-row-head";
        var name = document.createElement("strong");
        name.textContent = safeText(p.name || (p.identities && p.identities[0] && p.identities[0].handle) || p.id);
        head.appendChild(name);
        if (p.unanswered) {
          var badge = document.createElement("span"); badge.className = "crm-badge crm-badge-due"; badge.textContent = "待回复";
          head.appendChild(badge);
        }
        if (p.do_not_contact) {
          var dnc = document.createElement("span"); dnc.className = "crm-badge crm-badge-dnc"; dnc.textContent = "勿联系";
          head.appendChild(dnc);
        }
        var meta = document.createElement("span");
        meta.className = "client-row-meta";
        meta.textContent = [(p.channels || []).map(channelLabel).join(" / ") || "无渠道", stageLabel(p.stage),
                            p.country ? safeText(p.country) : ""].filter(Boolean).join(" · ");
        var last = document.createElement("span");
        last.className = "crm-last";
        var lm = p.last_message;
        last.textContent = lm ? (DIRECTIONS[lm.direction] || "") + "：" + safeText(lm.preview || "").slice(0, 80) +
          (lm.direction === "out" && (lm.status_label || STATUS[lm.status]) ? "（" + (lm.status_label || STATUS[lm.status]) + "）" : "") +
          " · " + displayTime(lm.ts) : "暂无消息";
        button.appendChild(head); button.appendChild(meta); button.appendChild(last);
        button.addEventListener("click", function () { selectParty(p.id); });
        list.appendChild(button);
      });
    }
    function addFact(list, name, value) {
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) return;
      var row = document.createElement("div");
      var term = document.createElement("dt"); term.textContent = name;
      var detail = document.createElement("dd"); detail.textContent = Array.isArray(value) ? value.join("、") : String(value);
      row.appendChild(term); row.appendChild(detail); list.appendChild(row);
    }
    function setComposerVisible(on) {
      var node = el("crm-composer");
      if (node) node.hidden = !on;
    }
    function partyCommands() {
      var id = state.selected;
      return (state.commands || []).filter(function (command) {
        if (!command) return false;
        return !command.party_id || command.party_id === id;
      });
    }
    function mergeCommands(serverList) {
      state.serverCommands = Array.isArray(serverList) ? serverList : [];
      var byId = {};
      (state.localCommands || []).forEach(function (command) {
        if (command && command.id != null) byId[String(command.id)] = command;
      });
      state.serverCommands.forEach(function (command) {
        if (!command || command.id == null) return;
        var copy = Object.assign({}, command);
        if (!copy.party_id) copy.party_id = state.selected;
        byId[String(copy.id)] = Object.assign({}, byId[String(copy.id)] || {}, copy);
      });
      state.commands = Object.keys(byId).map(function (key) { return byId[key]; });
    }
    function rememberCommand(command) {
      state.localCommands = (state.localCommands || []).filter(function (item) { return String(item.id) !== String(command.id); });
      state.localCommands.push(command);
      mergeCommands(state.serverCommands || []);
    }
    function renderComposeStatus() {
      var node = el("crm-compose-status");
      if (!node) return;
      var command = state.composeNote ? null : latestCommand(partyCommands(), "compose", null);
      var text = state.composeNote || (command ? commandStatusText(command) : "");
      var failed = state.composeNote ? true : Boolean(command && commandOutcome(command).failed);
      node.textContent = text;
      node.className = "crm-compose-status" + (failed && text ? " is-error" : "");
    }
    function applyLiveCommands() {
      renderComposeStatus();
      var buttons = state.approveButtons || {};
      Object.keys(buttons).forEach(function (turnId) {
        var button = buttons[turnId];
        var command = latestCommand(partyCommands(), "approve_draft", turnId);
        if (!button || !command) return;
        button.disabled = true;
        button.textContent = commandStatusText(command);
      });
    }
    function hasPending() {
      return partyCommands().some(function (command) { return commandOutcome(command).pending; });
    }
    function stopPoll() {
      if (state.poll) root.clearInterval(state.poll);
      state.poll = 0;
      root.__TBOT_CRM_POLL__ = 0;
    }
    function schedulePoll() {
      stopPoll();
      if (!hasPending() || state.commandsAvailable === false || !state.selected) return;
      var id = state.selected;
      state.poll = root.setInterval(function () {
        if (!moduleActive() || state.selected !== id) { stopPoll(); return; }
        refreshCommands(id);
      }, 4000);
      if (state.poll && state.poll.unref) state.poll.unref();
      root.__TBOT_CRM_POLL__ = state.poll;
    }
    function refreshCommands(id) {
      if (!id || state.selected !== id) return Promise.resolve();
      return request(detailPath(id)).then(function (data) {
        if (state.selected !== id || !data) return;
        var prev = JSON.stringify((state.party && state.party.turns) || []);
        var next = JSON.stringify((data.party && data.party.turns) || []);
        if (data.party) state.party = data.party;
        mergeCommands(commandsFrom(data));
        if (data.party && prev !== next) renderDetail(data.party);
        else applyLiveCommands();
        if (hasPending()) { if (!state.poll) schedulePoll(); }
        else stopPoll();
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
      });
    }
    function markCommandsMissing() {
      state.commandsAvailable = false;
      state.composing = false;
      state.composeNote = "";
      stopPoll();
      if (state.party && state.selected) renderDetail(state.party);
      else setComposerVisible(false);
    }
    function submitCompose() {
      var box = el("crm-compose-text");
      var button = el("crm-compose-send");
      if (!box || !button || state.commandsAvailable === false || !state.selected || state.composing) return;
      var text = String(box.value || "").trim();
      if (!text) return;
      var partyId = state.selected;
      state.composing = true;
      button.disabled = true;
      postCommand({type: "compose", party_id: partyId, text: text}).then(function (data) {
        var commandId = data && data.id;
        if (commandId == null || commandId === "") throw Object.assign(new Error("missing_id"), {code: "failed", note: "missing_id"});
        if (state.selected === partyId) box.value = "";
        state.composeNote = "";
        rememberCommand({id: commandId, type: "compose", party_id: partyId, turn_id: null, status: "submitted",
          created_at: new Date().toISOString(), note: ""});
        renderComposeStatus();
        return refreshCommands(partyId);
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        if (error && (error.code === "commands_missing" || error.status === 404)) { markCommandsMissing(); return; }
        state.composeNote = commandStatusText({status: "failed", note: errorNote(error)});
        renderComposeStatus();
      }).then(function () {
        state.composing = false;
        var send = el("crm-compose-send");
        if (send) send.disabled = false;
      });
    }
    function approvalLocked(turnId) {
      if (state.approving[String(turnId)]) return true;
      return Boolean(latestCommand(partyCommands(), "approve_draft", turnId));
    }
    function approveTurn(turn) {
      var turnId = turn && turn.id;
      if (turnId == null || state.commandsAvailable === false || !state.selected) return;
      if (approvalLocked(turnId)) return;
      var agreed = false;
      try { agreed = Boolean(root.confirm && root.confirm("同意发布这条草稿？")); }
      catch (e) { agreed = false; }
      if (!agreed) return;
      if (approvalLocked(turnId)) return;
      var partyId = state.selected;
      state.approving[String(turnId)] = true;
      var button = state.approveButtons[String(turnId)];
      if (button) { button.disabled = true; button.textContent = "已提交"; }
      postCommand({type: "approve_draft", party_id: partyId, turn_id: turnId}).then(function (data) {
        var commandId = data && data.id;
        if (commandId == null || commandId === "") throw Object.assign(new Error("missing_id"), {code: "failed", note: "missing_id"});
        rememberCommand({id: commandId, type: "approve_draft", party_id: partyId, turn_id: turnId, status: "submitted",
          created_at: new Date().toISOString(), note: ""});
        applyLiveCommands();
        return refreshCommands(partyId);
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        if (error && (error.code === "commands_missing" || error.status === 404)) { markCommandsMissing(); return; }
        delete state.approving[String(turnId)];
        var current = state.approveButtons[String(turnId)];
        if (current) {
          current.disabled = false;
          current.textContent = commandStatusText({status: "failed", note: errorNote(error)});
        }
      });
    }
    function renderEmptyDetail(text) {
      ["crm-facts", "crm-identities"].forEach(function (id) { var n = el(id); if (n) n.innerHTML = ""; });
      var title = el("crm-selected-title"); if (title) title.textContent = "选择一位客户";
      var badges = el("crm-selected-badges"); if (badges) badges.innerHTML = "";
      placeholder(el("crm-chat"), text);
      setComposerVisible(false);
    }
    function renderDetail(p) {
      var title = el("crm-selected-title");
      if (title) title.textContent = safeText(p.name || p.id);
      var badges = el("crm-selected-badges");
      if (badges) {
        badges.innerHTML = "";
        [[PARTIES[p.party_type] || "", "party"], [p.unanswered ? "待回复" : "", "due"], [p.do_not_contact ? "勿联系" : "", "dnc"],
         [p.human_takeover ? "人工接管" : "", "takeover"]].forEach(function (b) {
          if (!b[0]) return;
          var s = document.createElement("span"); s.className = "crm-badge crm-badge-" + b[1]; s.textContent = b[0]; badges.appendChild(s);
        });
      }
      var facts = el("crm-facts");
      if (facts) {
        facts.innerHTML = "";
        addFact(facts, "类型", KINDS[p.kind] || p.kind);
        addFact(facts, "阶段", stageLabel(p.stage));
        addFact(facts, "国家", safeText(p.country || ""));
        addFact(facts, "地区", safeText(p.location || ""));
        addFact(facts, "语言", safeText(p.language || ""));
        var interest = p.interest && typeof p.interest === "object" ? p.interest : {};
        var bits = Object.keys(interest).map(function (k) { return (INTEREST[k] || k) + " " + safeText(interest[k]); });
        addFact(facts, "需求", bits);
        addFact(facts, "首次联系", p.first_seen ? displayTime(p.first_seen) : "");
        addFact(facts, "最近来信", p.last_inbound_at ? displayTime(p.last_inbound_at) : "");
        addFact(facts, "最近回复", p.last_outbound_at ? displayTime(p.last_outbound_at) : "");
        addFact(facts, "勿联系原因", safeText(p.dnc_reason || ""));
        addFact(facts, "摘要", safeText(p.summary || ""));
        addFact(facts, "备注", safeText(p.notes || ""));
        if (p.supplier) {
          addFact(facts, "供应商名称", safeText(p.supplier.supplier_name || ""));
          addFact(facts, "供应品牌", (p.supplier.brands || []).map(safeText));
          addFact(facts, "供应型号", (p.supplier.models || []).map(safeText));
          addFact(facts, "所在地区", (p.supplier.regions || []).map(safeText));
          addFact(facts, "价格备注", safeText(p.supplier.price_notes || ""));
          addFact(facts, "可靠性备注", safeText(p.supplier.reliability_notes || ""));
          addFact(facts, "网站", safeText(p.supplier.website || ""));
        }
        addFact(facts, "消息数", String(p.turn_count || (p.turns || []).length));
      }
      var ids = el("crm-identities");
      if (ids) {
        ids.innerHTML = "";
        var h = document.createElement("h3"); h.textContent = "各渠道身份"; ids.appendChild(h);
        var ul = document.createElement("ul");
        (p.identities || []).forEach(function (i) {
          var li = document.createElement("li");
          li.textContent = channelLabel(i.channel) + "：" + safeText(i.handle || "") +
            (i.display_name ? "（" + safeText(i.display_name) + "）" : "") + (i.verified ? " · 已核实" : " · 未核实");
          ul.appendChild(li);
        });
        if (!ul.childNodes.length) { var none = document.createElement("p"); none.textContent = "没有记录的身份。"; ids.appendChild(none); }
        else ids.appendChild(ul);
      }
      var chat = el("crm-chat");
      if (!chat) return;
      chat.innerHTML = "";
      state.approveButtons = {};
      var turns = sortTurns(p.turns);
      turns.forEach(function (t) {
        var item = document.createElement("article");
        var st = statusLabel(t);
        item.className = "client-message crm-msg crm-" + (t.direction === "out" ? "out" : t.direction === "note" ? "note" : "in") +
          (t.direction === "out" ? " crm-status-" + statusClass(t.status) : "");
        var meta = document.createElement("div");
        meta.className = "client-message-meta";
        meta.textContent = [DIRECTIONS[t.direction] || "", channelLabel(t.channel), displayTime(t.ts)].filter(Boolean).join(" · ");
        if (st) {
          var canApprove = state.commandsAvailable !== false && t.direction === "out" && t.status === "drafted" && t.id != null;
          var tag = document.createElement(canApprove ? "button" : "span");
          tag.className = "crm-status crm-status-tag-" + statusClass(t.status) + (canApprove ? " crm-approve" : "");
          if (canApprove) {
            tag.type = "button";
            tag.setAttribute("data-turn-id", String(t.id));
            var existing = latestCommand(partyCommands(), "approve_draft", t.id);
            if (existing || state.approving[String(t.id)]) {
              tag.disabled = true;
              tag.textContent = existing ? commandStatusText(existing) : "已提交";
            } else {
              tag.textContent = APPROVE_LABEL;
              tag.addEventListener("click", function () { approveTurn(t); });
            }
            state.approveButtons[String(t.id)] = tag;
          } else tag.textContent = st;
          meta.appendChild(document.createTextNode(" "));
          meta.appendChild(tag);
        }
        var body = document.createElement("div");
        body.className = "client-message-text";
        body.textContent = turnText(t);
        item.appendChild(meta); item.appendChild(body);
        var zh = translationText(t);
        if (zh) {
          var gloss = document.createElement("div");
          gloss.className = "crm-text-zh";
          gloss.textContent = zh;
          item.appendChild(gloss);
        }
        chat.appendChild(item);
      });
      if (!turns.length) placeholder(chat, "还没有对话记录。");
      else chat.scrollTop = chat.scrollHeight;
      setComposerVisible(state.commandsAvailable !== false);
      var send = el("crm-compose-send");
      if (send) send.disabled = Boolean(state.composing);
      renderComposeStatus();
    }
    function request(path) {
      var fixture = root.__TBOT_CRM_FIXTURE__;
      if (fixture && typeof fixture === "object") {
        if (fixture.offline) return Promise.reject(Object.assign(new Error("offline"), {code: "offline"}));
        return Promise.resolve(fixtureResponse(fixture, path));
      }
      var controller = root.AbortController ? new AbortController() : null;
      var timer = controller ? root.setTimeout(function () { controller.abort(); }, 15000) : 0;
      return fetch(API + path, {credentials: "include", cache: "no-store", headers: {"Accept": "application/json"},
                                signal: controller ? controller.signal : undefined}).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (response.status === 401) {
            location.replace("./tbot-login.html");
            throw Object.assign(new Error("unauthorized"), {code: "unauthorized"});
          }
          var isDetail = String(path).split("?")[0].indexOf(LIST_PATH + "/") === 0;
          if (response.status === 404 && !isDetail) throw Object.assign(new Error("offline"), {code: "offline"});
          if (!response.ok || !data || data.ok === false) throw Object.assign(new Error((data && data.error) || "request_failed"), {code: response.status === 404 ? "missing" : "failed"});
          return data;
        });
      }).then(function (data) { if (timer) root.clearTimeout(timer); return data; },
              function (error) { if (timer) root.clearTimeout(timer); throw error; });
    }
    function loadList() {
      if (!moduleActive() || state.loading) return;
      state.loading = true;
      setMessage("正在加载客户画像…");
      var f = filters();
      request(listQuery(f)).then(function (data) {
        state.offline = false;
        state.items = Array.isArray(data.items) ? data.items : [];
        state.snapshotAt = data.snapshot_at || null;
        state.facets = data.facets || null;
        if (state.facets) {
          fillSelect("crm-channel", state.facets.channels, CHANNELS, "全部渠道");
          fillSelect("crm-stage", state.facets.stages, STAGES, "全部阶段");
          var pt = state.facets.party_types || {};
          var party = el("crm-party");
          if (party) Array.prototype.forEach.call(party.options, function (o) {
            o.textContent = (PARTIES[o.value] || o.value) + (pt[o.value] != null ? "（" + pt[o.value] + "）" : "");
          });
        }
        var keep = state.selected;
        var still = keep && state.items.some(function (p) { return p.id === keep; });
        if (!still) state.selected = null;
        renderList();
        if (still) selectParty(keep);
        else renderEmptyDetail(state.items.length ? "选择一位客户查看画像和完整对话。" : (state.snapshotAt ? "没有符合筛选的记录。" : EMPTY_TEXT));
        setMessage("");
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        state.items = []; state.selected = null;
        state.offline = Boolean(error && error.code === "offline");
        renderList();
        renderEmptyDetail(state.offline ? OFFLINE_TEXT : "客户画像暂时无法加载。");
        setMessage(state.offline ? OFFLINE_TEXT : "客户画像暂时无法加载。", !state.offline);
      }).then(function () { state.loading = false; });
    }
    function selectParty(id) {
      if (!ID_RE.test(String(id || ""))) return;
      var changed = state.selected !== id;
      state.selected = id;
      renderList();
      setMessage("正在加载对话…");
      request(detailPath(id)).then(function (data) {
        if (state.selected !== id) return;
        if (!data || !data.party) throw Object.assign(new Error("missing"), {code: "missing"});
        if (changed) {
          state.composeNote = "";
          var box = el("crm-compose-text");
          if (box) box.value = "";
        }
        state.party = data.party;
        mergeCommands(commandsFrom(data));
        renderDetail(data.party);
        setMessage("");
        if (hasPending()) schedulePoll(); else stopPoll();
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        if (state.selected !== id) return;
        state.party = null;
        renderEmptyDetail(error && error.code === "missing" ? "没有这位客户的记录。" : "对话暂时无法加载。");
        setMessage(error && error.code === "missing" ? "" : "对话暂时无法加载。", !(error && error.code === "missing"));
      });
    }
    function debounced() { root.clearTimeout(state.timer); state.timer = root.setTimeout(loadList, 250); }
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest('.side-link[data-module="crm"]');
      var refresh = event.target.closest && event.target.closest('[data-action="crm-refresh"]');
      if (link || refresh) root.setTimeout(loadList, 0);
    });
    var search = el("crm-search");
    if (search) search.addEventListener("input", debounced);
    ["crm-party", "crm-channel", "crm-stage", "crm-unanswered"].forEach(function (id) {
      var n = el(id); if (n) n.addEventListener("change", function () { state.selected = null; loadList(); });
    });
    var composeBox = el("crm-compose-text");
    if (composeBox) composeBox.placeholder = COMPOSE_PLACEHOLDER;
    var sendButton = el("crm-compose-send");
    if (sendButton) sendButton.addEventListener("click", submitCompose);
    var sortNode = el("crm-sort");
    if (sortNode) {
      var storedSort = readStoredSort(browserStorage());
      var knownSort = false;
      Array.prototype.forEach.call(sortNode.options || [], function (o) { if (o.value === storedSort) knownSort = true; });
      if (knownSort) sortNode.value = storedSort;
      sortNode.addEventListener("change", function () {
        writeStoredSort(browserStorage(), sortNode.value);
        renderList();
      });
    }
    var syncState = {timer: 0, busy: false, wasBusy: false};
    function ensureSyncButton() {
      var btn = el("crm-sync-now");
      if (btn) return btn;
      var refreshBtn = document.querySelector && document.querySelector('[data-action="crm-refresh"]');
      if (!refreshBtn || !refreshBtn.parentNode) return null;
      btn = document.createElement("button");
      btn.className = "module-action"; btn.type = "button"; btn.id = "crm-sync-now";
      btn.setAttribute("data-action", "crm-sync"); btn.textContent = SYNC_LABEL;
      refreshBtn.parentNode.insertBefore(btn, refreshBtn.nextSibling);
      var note = document.createElement("span");
      note.id = "crm-sync-status"; note.className = "crm-sync-status";
      btn.parentNode.insertBefore(note, btn.nextSibling);
      return btn;
    }
    function renderSync(sync, httpError) {
      var btn = ensureSyncButton();
      var v = syncView(sync, httpError);
      if (btn) { btn.textContent = v.label; btn.disabled = v.disabled; btn.setAttribute("aria-busy", v.busy ? "true" : "false"); }
      var note = el("crm-sync-status");
      if (note) note.textContent = v.text;
      root.clearTimeout(syncState.timer);
      if (v.busy) syncState.timer = root.setTimeout(loadSync, 30000);
      else if (v.disabled) syncState.timer = root.setTimeout(loadSync, 60000);
      if (syncState.wasBusy && !v.busy) root.setTimeout(loadList, 0);   // sync finished: re-read the snapshot
      syncState.wasBusy = v.busy;
    }
    function syncReadFailed() {
      // Status could not be read: release the button and keep polling instead of freezing on 同步中.
      var b = ensureSyncButton();
      if (b) { b.textContent = SYNC_LABEL; b.disabled = false; b.setAttribute("aria-busy", "false"); }
      var note = el("crm-sync-status");
      if (note) note.textContent = "同步状态暂时读取失败，稍后自动重试。";
      root.clearTimeout(syncState.timer);
      syncState.timer = root.setTimeout(loadSync, 60000);
    }
    function loadSync() {
      if (!moduleActive()) {
        if (syncState.wasBusy) { root.clearTimeout(syncState.timer); syncState.timer = root.setTimeout(loadSync, 30000); }
        return;
      }
      syncRequest("GET").then(function (r) { renderSync(r.sync); }, function (error) {
        if (error && error.code === "offline") { var b = el("crm-sync-now"); if (b) b.hidden = true; return; }
        syncReadFailed();
      });
    }
    function startSync() {
      var btn = ensureSyncButton();
      if (btn) { btn.disabled = true; btn.textContent = SYNC_BUSY_LABEL; }
      syncRequest("POST").then(function (r) { renderSync(r.sync, r.status); }, function (error) {
        if (btn) { btn.disabled = false; btn.textContent = SYNC_LABEL; }
        if (error && error.code === "unauthorized") return;
        var note = el("crm-sync-status"); if (note) note.textContent = "同步请求未发出，请稍后再试。";
      });
    }
    ensureSyncButton();
    document.addEventListener("click", function (event) {
      var s = event.target.closest && event.target.closest('[data-action="crm-sync"]');
      if (s && !s.disabled) startSync();
      var link = event.target.closest && event.target.closest('.side-link[data-module="crm"]');
      if (link) root.setTimeout(loadSync, 0);
    });
    root.addEventListener("hashchange", function () { if (location.hash === "#crm") loadSync(); });
    if (location.hash === "#crm") loadSync();
    root.addEventListener("hashchange", function () { if (location.hash === "#crm") loadList(); });
    if (location.hash === "#crm") loadList();
  }

  function fixtureResponse(fixture, path) {
    var parts = String(path || "").split("?");
    var clean = parts[0];
    var parties = Array.isArray(fixture.parties) ? fixture.parties : [];
    if (clean === LIST_PATH) {
      var params = {};
      (parts[1] || "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
      var items = parties.filter(function (p) {
        return (params.party === "all" || p.party_type === (params.party || "buyer")) &&
          (!params.channel || (p.channels || []).indexOf(params.channel) !== -1) &&
          (!params.stage || p.stage === params.stage) && (!params.unanswered || p.unanswered) &&
          (!params.q || JSON.stringify(p).toLowerCase().indexOf(params.q.toLowerCase()) !== -1);
      });
      return {ok: true, snapshot_at: fixture.snapshot_at || null, items: items, facets: fixture.facets || null, total: items.length};
    }
    var prefix = LIST_PATH + "/";
    if (clean.indexOf(prefix) !== 0) throw Object.assign(new Error("offline"), {code: "offline"});
    var id = decodeURIComponent(clean.slice(prefix.length));
    var found = null;
    parties.forEach(function (p) { if (p && p.id === id) found = p; });
    if (!found) throw Object.assign(new Error("missing"), {code: "missing"});
    var commands;
    if (fixture.commandsByParty && Object.prototype.hasOwnProperty.call(fixture.commandsByParty, id)) commands = fixture.commandsByParty[id];
    else commands = found.commands;
    return {ok: true, party: found, commands: Array.isArray(commands) ? commands : []};
  }

  return {mount: mount, maskPhone: maskPhone, safeText: safeText, displayTime: displayTime, statusLabel: statusLabel,
          channelLabel: channelLabel, stageLabel: stageLabel, listQuery: listQuery, detailPath: detailPath,
          sortTurns: sortTurns, sortParties: sortParties, partyTurnCount: partyTurnCount,
          lastInteractionMs: lastInteractionMs, normalizeSort: normalizeSort, readStoredSort: readStoredSort,
          writeStoredSort: writeStoredSort, SORT_LATEST: SORT_LATEST, SORT_FREQUENCY: SORT_FREQUENCY,
          SORT_STORAGE_KEY: SORT_STORAGE_KEY, turnText: turnText, translationText: translationText,
          commandOutcome: commandOutcome, commandStatusText: commandStatusText, commandsFrom: commandsFrom,
          latestCommand: latestCommand, postCommand: postCommand, COMMANDS_PATH: COMMANDS_PATH,
          COMPOSE_PLACEHOLDER: COMPOSE_PLACEHOLDER, APPROVE_LABEL: APPROVE_LABEL,
          fixtureResponse: fixtureResponse, STATUS: STATUS,
          syncView: syncView, syncRequest: syncRequest, SYNC_PATH: SYNC_PATH, SYNC_LABEL: SYNC_LABEL,
          SYNC_BUSY_LABEL: SYNC_BUSY_LABEL};
});
