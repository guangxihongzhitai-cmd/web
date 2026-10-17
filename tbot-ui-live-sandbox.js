(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.mount();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var API = "https://api.hongzhtaichina.com";
  var LIST_PATH = "/api/ui/sandbox-transcripts";
  var OFFLINE_TEXT = "暂无记录 / 后端未上线";
  var EMPTY_TEXT = "暂无记录";
  var VIN_LABEL = "[车架号已隐藏]";
  var PLATE_LABEL = "[车牌已隐藏]";
  var SECRET_LABEL = "[凭证已隐藏]";
  var SPEAKERS = {"客户": "customer", "Tbot": "tbot", "供应商": "supplier", "Gbot(代Town审批)": "gbot"};
  var OUTCOMES = {"成交": "won", "拒绝": "lost", "中止": "stopped"};
  var VIN_RE = /(?<![A-HJ-NPR-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-HJ-NPR-Z0-9])/g;
  var PLATE_RE = /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][·.\- ]?[A-HJ-NP-Z0-9]{4,6}[挂学警港澳]?(?![A-Z0-9])/g;
  var PEM_RE = /-----BEGIN [A-Z0-9 ]+-----[\s\S]+?-----END [A-Z0-9 ]+-----/g;
  var LABELED_RE = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|x-tbot-token|tbot_token|cursor_api_key|token|sink_auth)\b\s*[:=]\s*[A-Za-z0-9._~+/=-]{4,}/gi;
  var BEARER_RE = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
  var JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
  var PREFIX_RE = /\b(?:sk|pk|rk|ghp|gho|xox[baprs]?)-[A-Za-z0-9_-]{8,}/gi;
  var QUERY_TOKEN_RE = /([?&](?:token|key|secret|password|auth)=)[A-Za-z0-9._~+/=-]{4,}/gi;
  var RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

  function redactText(value) {
    var text = value == null ? "" : String(value);
    if (!text) return "";
    PEM_RE.lastIndex = 0;
    LABELED_RE.lastIndex = 0;
    BEARER_RE.lastIndex = 0;
    JWT_RE.lastIndex = 0;
    PREFIX_RE.lastIndex = 0;
    QUERY_TOKEN_RE.lastIndex = 0;
    VIN_RE.lastIndex = 0;
    PLATE_RE.lastIndex = 0;
    text = text.replace(PEM_RE, SECRET_LABEL);
    text = text.replace(LABELED_RE, SECRET_LABEL);
    text = text.replace(BEARER_RE, SECRET_LABEL);
    text = text.replace(JWT_RE, SECRET_LABEL);
    text = text.replace(PREFIX_RE, SECRET_LABEL);
    text = text.replace(QUERY_TOKEN_RE, "$1" + SECRET_LABEL);
    text = text.replace(VIN_RE, VIN_LABEL);
    text = text.replace(PLATE_RE, PLATE_LABEL);
    return text;
  }

  function safeRunId(value) {
    return RUN_ID_RE.test(String(value || "").trim());
  }

  function displayTime(value) {
    var text = redactText(value).trim();
    if (!text) return "—";
    text = text.replace(/T/g, " ");
    if (text.slice(-1) === "Z") text = text.slice(0, -1) + " UTC";
    return text.slice(0, 40);
  }

  function scenarioLine(scenario) {
    var data = scenario && typeof scenario === "object" ? scenario : {};
    var truck = redactText(data.truck).trim();
    var destination = redactText(data.destination).trim();
    var budget = redactText(data.budget).trim();
    var parts = [];
    if (truck) parts.push(truck);
    if (destination) parts.push(destination);
    var head = parts.length ? parts.join("，") : "未写场景";
    if (budget) return head + "（预算 " + budget + "）";
    return head;
  }

  function outcomeLabel(run) {
    var outcome = run && run.outcome && typeof run.outcome === "object" ? run.outcome : {};
    var label = String(outcome.result || "").trim();
    return Object.prototype.hasOwnProperty.call(OUTCOMES, label) ? label : "—";
  }

  function outcomeClass(label) {
    return OUTCOMES[label] || "stopped";
  }

  function finalPrice(run) {
    var price = redactText(run && run.final_price).trim();
    return price || "—";
  }

  function quotePrice(quote) {
    var price = redactText(quote && quote.price).trim();
    var currency = redactText(quote && quote.currency).trim();
    if (price && currency && price.indexOf(currency) === -1) return price + " " + currency;
    return price;
  }

  function sortRuns(runs) {
    return (runs || []).slice().sort(function (a, b) {
      var aStamp = String((a && (a.ended_at || a.started_at)) || "");
      var bStamp = String((b && (b.ended_at || b.started_at)) || "");
      if (aStamp !== bStamp) return aStamp < bStamp ? 1 : -1;
      var aId = String((a && a.run_id) || "");
      var bId = String((b && b.run_id) || "");
      if (aId === bId) return 0;
      return aId < bId ? 1 : -1;
    });
  }

  function detailPath(runId) {
    return LIST_PATH + "/" + encodeURIComponent(runId);
  }

  function mount() {
    var state = {runs: [], selected: null, offline: false, loading: false};
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
      if (location.hash === "#sandbox") return true;
      var panel = document.querySelector('.module-panel[data-panel="sandbox"]');
      return Boolean(panel && panel.classList.contains("active"));
    }
    function searchQuery() {
      var node = el("sandbox-search");
      return node ? String(node.value || "").trim().toLowerCase() : "";
    }
    function visibleRuns() {
      var query = searchQuery();
      return state.runs.filter(function (run) {
        if (!query) return true;
        var outcome = run && run.outcome && typeof run.outcome === "object" ? run.outcome : {};
        var hay = [scenarioLine(run.scenario), outcomeLabel(run), finalPrice(run), redactText(run.run_id), redactText(outcome.reason)].join(" ").toLowerCase();
        return hay.indexOf(query) !== -1;
      });
    }
    function renderList() {
      var list = el("sandbox-list");
      var count = el("sandbox-count");
      if (!list) return;
      if (state.offline) {
        if (count) count.textContent = "0";
        placeholder(list, OFFLINE_TEXT);
        return;
      }
      var rows = visibleRuns();
      if (count) count.textContent = String(rows.length);
      list.innerHTML = "";
      if (!state.runs.length) {
        placeholder(list, EMPTY_TEXT);
        return;
      }
      if (!rows.length) {
        placeholder(list, "没有符合筛选的沙盘记录。");
        return;
      }
      rows.forEach(function (run) {
        var runId = String(run.run_id || "");
        var button = document.createElement("button");
        button.type = "button";
        button.className = "client-row" + (state.selected === runId ? " active" : "");
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", state.selected === runId ? "true" : "false");
        var head = document.createElement("div");
        head.className = "client-row-head";
        var when = document.createElement("strong");
        when.textContent = displayTime(run.ended_at || run.started_at);
        var badge = document.createElement("span");
        var label = outcomeLabel(run);
        badge.className = "sandbox-outcome sandbox-outcome-" + outcomeClass(label);
        badge.textContent = label;
        head.appendChild(when);
        head.appendChild(badge);
        var meta = document.createElement("span");
        meta.className = "client-row-meta";
        meta.textContent = scenarioLine(run.scenario) + " · 最终价格 " + finalPrice(run);
        var idLine = document.createElement("span");
        idLine.className = "sandbox-run-id";
        idLine.textContent = redactText(runId);
        button.appendChild(head);
        button.appendChild(meta);
        button.appendChild(idLine);
        button.addEventListener("click", function () { selectRun(runId); });
        list.appendChild(button);
      });
    }
    function renderEmptyDetail(text) {
      var title = el("sandbox-selected-title");
      var badge = el("sandbox-selected-outcome");
      var facts = el("sandbox-facts");
      var quotes = el("sandbox-quotes");
      var chat = el("sandbox-chat");
      if (title) title.textContent = "选择一场记录";
      if (badge) badge.textContent = "";
      if (facts) facts.innerHTML = "";
      if (quotes) quotes.innerHTML = "";
      placeholder(chat, text);
    }
    function addFact(list, name, value) {
      var row = document.createElement("div");
      var term = document.createElement("dt");
      term.textContent = name;
      var detail = document.createElement("dd");
      detail.textContent = value;
      row.appendChild(term);
      row.appendChild(detail);
      list.appendChild(row);
    }
    function renderDetail(run) {
      var title = el("sandbox-selected-title");
      var badge = el("sandbox-selected-outcome");
      var facts = el("sandbox-facts");
      var quotes = el("sandbox-quotes");
      var chat = el("sandbox-chat");
      var label = outcomeLabel(run);
      var outcome = run.outcome && typeof run.outcome === "object" ? run.outcome : {};
      if (title) title.textContent = redactText(run.run_id) || "沙盘记录";
      if (badge) {
        badge.className = "sandbox-outcome sandbox-outcome-" + outcomeClass(label);
        badge.textContent = label;
      }
      if (facts) {
        facts.innerHTML = "";
        addFact(facts, "场景", scenarioLine(run.scenario));
        addFact(facts, "开始", displayTime(run.started_at));
        addFact(facts, "结束", displayTime(run.ended_at));
        addFact(facts, "原因", redactText(outcome.reason).trim() || "未写明原因");
        addFact(facts, "最终价格", finalPrice(run));
      }
      if (quotes) {
        quotes.innerHTML = "";
        var heading = document.createElement("h3");
        heading.textContent = "报价版本";
        quotes.appendChild(heading);
        var items = Array.isArray(run.quotes) ? run.quotes : [];
        var list = document.createElement("ol");
        items.forEach(function (quote) {
          if (!quote || typeof quote !== "object") return;
          var price = quotePrice(quote);
          if (!price) return;
          var item = document.createElement("li");
          var version = document.createElement("span");
          version.className = "sandbox-quote-version";
          var versionNo = Number(quote.version);
          version.textContent = versionNo > 0 ? "第 " + versionNo + " 版" : "报价";
          item.appendChild(version);
          item.appendChild(document.createTextNode(" " + price));
          var note = redactText(quote.note).trim();
          if (note) {
            var noteNode = document.createElement("span");
            noteNode.className = "sandbox-quote-note";
            noteNode.textContent = "· " + note;
            item.appendChild(noteNode);
          }
          list.appendChild(item);
        });
        if (!list.childNodes.length) {
          var empty = document.createElement("p");
          empty.className = "sandbox-empty-note";
          empty.textContent = "这次运行没有留下报价版本。";
          quotes.appendChild(empty);
        } else {
          quotes.appendChild(list);
        }
      }
      if (!chat) return;
      chat.innerHTML = "";
      var turns = Array.isArray(run.turns) ? run.turns : [];
      var count = 0;
      turns.forEach(function (turn) {
        if (!turn || typeof turn !== "object") return;
        var speaker = String(turn.speaker || "");
        var css = SPEAKERS[speaker];
        if (!css) return;
        var text = redactText(turn.text).trim();
        if (!text) return;
        var item = document.createElement("article");
        item.className = "client-message sandbox-" + css;
        var meta = document.createElement("div");
        meta.className = "client-message-meta";
        meta.textContent = speaker + " · " + displayTime(turn.timestamp);
        var body = document.createElement("div");
        body.className = "client-message-text";
        body.textContent = text;
        item.appendChild(meta);
        item.appendChild(body);
        chat.appendChild(item);
        count += 1;
      });
      if (!count) placeholder(chat, "这次运行没有留下对话。");
      else chat.scrollTop = chat.scrollHeight;
    }
    function request(path) {
      var fixture = root.__TBOT_SANDBOX_FIXTURE__;
      if (fixture && typeof fixture === "object") {
        if (fixture.offline) return Promise.reject(Object.assign(new Error("offline"), {code: "offline"}));
        return Promise.resolve(fixtureResponse(fixture, path));
      }
      var controller = root.AbortController ? new AbortController() : null;
      var timer = controller ? root.setTimeout(function () { controller.abort(); }, 15000) : 0;
      return fetch(API + path, {
        credentials: "include",
        cache: "no-store",
        headers: {"Accept": "application/json"},
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (response.status === 401) {
            location.replace("./tbot-login.html");
            throw Object.assign(new Error("unauthorized"), {code: "unauthorized"});
          }
          if (response.status === 404) throw Object.assign(new Error("offline"), {code: "offline"});
          if (!response.ok || !data || data.ok === false) throw Object.assign(new Error((data && data.error) || "request_failed"), {code: "failed"});
          return data;
        });
      }).then(function (data) {
        if (timer) root.clearTimeout(timer);
        return data;
      }, function (error) {
        if (timer) root.clearTimeout(timer);
        throw error;
      });
    }
    function loadRuns() {
      if (!moduleActive() || state.loading) return;
      state.loading = true;
      setMessage("正在加载沙盘记录…");
      request(LIST_PATH + "?refresh=" + Date.now()).then(function (data) {
        var keep = state.selected;
        state.offline = false;
        state.runs = sortRuns(Array.isArray(data.runs) ? data.runs : []);
        var stillThere = keep && state.runs.some(function (run) { return String(run.run_id || "") === keep; });
        if (!stillThere) state.selected = null;
        renderList();
        if (!state.runs.length) renderEmptyDetail(EMPTY_TEXT);
        else if (stillThere) selectRun(keep);
        else renderEmptyDetail("选择一场记录查看对话。");
        if (!stillThere) setMessage("");
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        state.runs = [];
        state.selected = null;
        state.offline = Boolean(error && error.code === "offline");
        renderList();
        renderEmptyDetail(state.offline ? OFFLINE_TEXT : "沙盘记录暂时无法加载。");
        setMessage(state.offline ? OFFLINE_TEXT : "沙盘记录暂时无法加载。", !state.offline);
      }).then(function () { state.loading = false; });
    }
    function selectRun(runId) {
      if (!safeRunId(runId)) return;
      state.selected = runId;
      renderList();
      setMessage("正在加载这场对话…");
      request(detailPath(runId)).then(function (data) {
        var run = data && data.run;
        if (!run || typeof run !== "object") throw Object.assign(new Error("missing"), {code: "missing"});
        if (state.selected !== runId) return;
        renderDetail(run);
        setMessage("");
      }).catch(function (error) {
        if (error && error.code === "unauthorized") return;
        if (state.selected !== runId) return;
        renderEmptyDetail(error && error.code === "offline" ? "没有这场沙盘记录。" : "这场对话暂时无法加载。");
        setMessage(error && error.code === "offline" ? "" : "这场对话暂时无法加载。", !(error && error.code === "offline"));
      });
    }
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest('.side-link[data-module="sandbox"]');
      var refresh = event.target.closest && event.target.closest('[data-action="sandbox-refresh"]');
      if (link || refresh) root.setTimeout(loadRuns, 0);
    });
    var search = el("sandbox-search");
    if (search) search.addEventListener("input", function () { if (!state.offline) renderList(); });
    root.addEventListener("hashchange", function () { if (location.hash === "#sandbox") loadRuns(); });
    if (location.hash === "#sandbox") loadRuns();
  }

  function fixtureResponse(fixture, path) {
    var clean = String(path || "").split("?")[0];
    if (clean === LIST_PATH) return {ok: true, runs: fixture.runs || []};
    var prefix = LIST_PATH + "/";
    if (clean.indexOf(prefix) !== 0) throw Object.assign(new Error("offline"), {code: "offline"});
    var runId = decodeURIComponent(clean.slice(prefix.length));
    var details = Array.isArray(fixture.details) ? fixture.details : [];
    var run = null;
    details.forEach(function (item) { if (item && item.run_id === runId) run = item; });
    if (!run) throw Object.assign(new Error("offline"), {code: "offline"});
    return {ok: true, run: run};
  }

  return {
    redactText: redactText,
    safeRunId: safeRunId,
    displayTime: displayTime,
    scenarioLine: scenarioLine,
    outcomeLabel: outcomeLabel,
    finalPrice: finalPrice,
    quotePrice: quotePrice,
    sortRuns: sortRuns,
    mount: mount
  };
});
