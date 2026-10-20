(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.mount();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // 客户画像: read-only buyer / supplier profiles with full cross-channel history.
  // Data: box CRM snapshot (already masked on the box) served by the Worker behind
  // the same hzt_ui_session login as Clients.  Nothing here writes anything.
  var API = "https://api.hongzhtaichina.com";
  var LIST_PATH = "/api/ui/crm/buyers";
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

  function mount() {
    var state = {items: [], selected: null, offline: false, loading: false, snapshotAt: null, facets: null, timer: 0};
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
    function renderEmptyDetail(text) {
      ["crm-facts", "crm-identities"].forEach(function (id) { var n = el(id); if (n) n.innerHTML = ""; });
      var title = el("crm-selected-title"); if (title) title.textContent = "选择一位客户";
      var badges = el("crm-selected-badges"); if (badges) badges.innerHTML = "";
      placeholder(el("crm-chat"), text);
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
          var tag = document.createElement("span"); tag.className = "crm-status crm-status-tag-" + statusClass(t.status); tag.textContent = st;
          meta.appendChild(document.createTextNode(" "));
          meta.appendChild(tag);
        }
        var body = document.createElement("div");
        body.className = "client-message-text";
        body.textContent = turnText(t);
        item.appendChild(meta); item.appendChild(body);
        chat.appendChild(item);
      });
      if (!turns.length) placeholder(chat, "还没有对话记录。");
      else chat.scrollTop = chat.scrollHeight;
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
      state.selected = id;
      renderList();
      setMessage("正在加载对话…");
      request(detailPath(id)).then(function (data) {
        if (state.selected !== id) return;
        if (!data || !data.party) throw Object.assign(new Error("missing"), {code: "missing"});
        renderDetail(data.party);
        setMessage("");
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        if (state.selected !== id) return;
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
    return {ok: true, party: found};
  }

  return {mount: mount, maskPhone: maskPhone, safeText: safeText, displayTime: displayTime, statusLabel: statusLabel,
          channelLabel: channelLabel, stageLabel: stageLabel, listQuery: listQuery, detailPath: detailPath,
          sortTurns: sortTurns, sortParties: sortParties, partyTurnCount: partyTurnCount,
          lastInteractionMs: lastInteractionMs, normalizeSort: normalizeSort, readStoredSort: readStoredSort,
          writeStoredSort: writeStoredSort, SORT_LATEST: SORT_LATEST, SORT_FREQUENCY: SORT_FREQUENCY,
          SORT_STORAGE_KEY: SORT_STORAGE_KEY, turnText: turnText, fixtureResponse: fixtureResponse, STATUS: STATUS};
});
