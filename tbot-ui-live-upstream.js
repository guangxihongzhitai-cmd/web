(function () {
  "use strict";
  var API = "https://api.hongzhtaichina.com";
  var LIVE_SYNC_MS = 4000;
  var state = { rows: [], selected: null, detail: null, messages: [], messageBefore: 0, messageHasMore: false, messageLoading: false, recoveryTimer: null, recoveryAttempts: 0, liveTimer: null, syncing: false, listFingerprint: "", chatFingerprint: "" };
  function el(id) { return document.getElementById(id); }
  function setMessage(message, error) {
    var feedback = el("module-feedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.toggle("is-error", Boolean(error));
  }
  function api(path) {
    function attempt(number) {
      var controller = window.AbortController ? new AbortController() : null;
      var request = {credentials: "include", cache: "no-store", headers: {"Accept": "application/json"}};
      if (controller) { request.signal = controller.signal; window.setTimeout(function () { controller.abort(); }, 15000); }
      return fetch(API + path, request).then(function (response) { return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) { location.replace("./tbot-login.html"); throw new Error("unauthorized"); }
        if (!response.ok || !data || data.ok === false) {
          var transient = response.status === 404 || response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504 || (data && data.error === "ui_upstream_unavailable");
          if (transient && number < 3) return new Promise(function (resolve) { window.setTimeout(resolve, 350 * number); }).then(function () { return attempt(number + 1); });
          throw new Error((data && data.error) || "request_failed");
        }
        return data;
      }); }).catch(function (error) {
        if (number < 3 && error && (error.name === "AbortError" || error.name === "TypeError")) return new Promise(function (resolve) { window.setTimeout(resolve, 350 * number); }).then(function () { return attempt(number + 1); });
        throw error;
      });
    }
    return attempt(1);
  }
  function value(id) { var node = el(id); return node ? String(node.value || "").trim() : ""; }
  function setOptions(id, values, firstLabel) {
    var node = el(id); if (!node) return;
    var current = node.value;
    node.innerHTML = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = firstLabel || "All countries"; node.appendChild(first);
    (values || []).forEach(function (item) { var option = document.createElement("option"); option.value = item; option.textContent = item; node.appendChild(option); });
    if ([].some.call(node.options, function (option) { return option.value === current; })) node.value = current;
  }
  function renderRows() {
    var list = el("upstream-list"), count = el("upstream-count");
    if (!list) return;
    list.innerHTML = "";
    if (count) count.textContent = String(state.rows.length);
    if (!state.rows.length) { list.innerHTML = '<div class="data-placeholder">No structured upstream supplier records yet.</div>'; return; }
    state.rows.forEach(function (row) {
      var item = document.createElement("button"); item.type = "button"; item.className = "client-row" + (state.selected === row.supplier_ref ? " active" : ""); item.setAttribute("role", "option"); item.setAttribute("aria-selected", state.selected === row.supplier_ref ? "true" : "false");
      var head = document.createElement("div"); head.className = "client-row-head";
      var name = document.createElement("strong"); name.textContent = row.name || row.supplier_ref;
      var stamp = document.createElement("time"); stamp.className = "client-row-time"; stamp.textContent = row.last_activity_display || "--";
      head.appendChild(name); head.appendChild(stamp);
      var meta = document.createElement("span"); meta.className = "client-row-meta"; meta.textContent = [row.phone_display || row.phone || row.supplier_ref, row.country, "供应商·卖方", "Tbot·采购方", row.status, row.vehicle_summary, row.linked_customer_name ? ("客户: " + row.linked_customer_name) : ""].filter(Boolean).join(" · ");
      item.appendChild(head); item.appendChild(meta); item.addEventListener("click", function () { selectRow(row.supplier_ref); }); list.appendChild(item);
    });
  }
  function renderDetail(data, appendOlder) {
    state.detail = data;
    if (!appendOlder) state.messages = Array.isArray(data.messages) ? data.messages : [];
    var page = data.messages_page || {};
    if (!appendOlder) { state.messageBefore = Number(page.next_before || state.messages.length || 0); state.messageHasMore = Boolean(page.has_more); }
    var row = data.selected || state.rows.filter(function (item) { return item.supplier_ref === state.selected; })[0];
    var title = el("selected-upstream-title");
    if (title) title.textContent = row ? ((row.name || row.supplier_ref) + " · 供应商卖方 / Tbot采购方 · " + (row.phone_display || row.phone || row.supplier_ref) + (row.linked_customer_name ? (" · 客户: " + row.linked_customer_name) : "")) : "Select a supplier";
    ["upstream-copy-phone", "upstream-copy-wa"].forEach(function (id) { if (el(id)) el(id).disabled = !row; });
    var box = el("tbot-ui-live-upstream-chat"); if (!box) return;
    box.innerHTML = "";
    if (!state.messages.length) { box.innerHTML = '<div class="data-placeholder">No upstream messages recorded for this supplier.</div>'; return; }
    state.messages.forEach(function (message) {
      var article = document.createElement("article"); article.className = "client-message " + (message.direction === "outbound" ? "outbound" : "inbound");
      var meta = document.createElement("div"); meta.className = "client-message-meta"; meta.textContent = [message.ts_display || message.ts || "", message.direction || "", message.sender_label || ""].filter(Boolean).join(" · ");
      var text = document.createElement("div"); text.className = "client-message-text"; text.textContent = message.text || "";
      article.appendChild(meta); article.appendChild(text); box.appendChild(article);
    });
    if (!appendOlder) box.scrollTop = box.scrollHeight;
  }
  function rowsFingerprint(rows) {
    return (rows || []).map(function (row) {
      return [row.supplier_ref || "", row.last_activity || "", row.status || "", row.linked_customer_phone || ""].join(":");
    }).join("|");
  }
  function messagesFingerprint(rows) {
    if (!rows || !rows.length) return "0";
    var last = rows[rows.length - 1] || {};
    return [rows.length, last.ts || "", last.message_id || "", String(last.text || "").slice(-48)].join("|");
  }
  function selectRow(ref, options) {
    options = options || {};
    var silent = Boolean(options.silent);
    state.selected = ref;
    if (!silent) {
      state.messages = [];
      state.messageBefore = 0;
      state.messageHasMore = false;
      state.chatFingerprint = "";
      renderRows();
      setMessage("Loading latest 10 upstream messages…");
    }
    var params = new URLSearchParams({ supplier_ref: ref, limit: "10", before: "0", refresh: String(Date.now()) });
    var filters = {
      country: value("upstream-filter-country"),
      name_query: value("upstream-filter-name"),
      date_from: value("upstream-filter-from"),
      date_to: value("upstream-filter-to"),
      keyword: value("upstream-filter-keyword")
    };
    Object.keys(filters).forEach(function (key) { if (filters[key]) params.set(key, filters[key]); });
    api("/api/ui/upstream?" + params.toString()).then(function (data) {
      var nextMessages = Array.isArray(data.messages) ? data.messages : [];
      var nextFingerprint = messagesFingerprint(nextMessages);
      if (silent && nextFingerprint === state.chatFingerprint) return;
      state.chatFingerprint = nextFingerprint;
      renderDetail(data, false);
    }).then(function () { if (!silent) setMessage(""); }).catch(function (error) { if (!silent && error.message !== "unauthorized") setMessage("Upstream history is unavailable.", true); });
  }
  function loadOlderUpstreamMessages() {
    var box = el("tbot-ui-live-upstream-chat"); if (!box || !state.selected || state.messageLoading || !state.messageHasMore) return;
    state.messageLoading = true; setMessage("Loading 10 older upstream messages…");
    var oldHeight = box.scrollHeight, oldTop = box.scrollTop;
    var params = new URLSearchParams({ supplier_ref: state.selected, limit: "10", before: String(state.messageBefore) });
    var filters = { country: value("upstream-filter-country"), name_query: value("upstream-filter-name"), date_from: value("upstream-filter-from"), date_to: value("upstream-filter-to"), keyword: value("upstream-filter-keyword") };
    Object.keys(filters).forEach(function (key) { if (filters[key]) params.set(key, filters[key]); });
    api("/api/ui/upstream?" + params.toString()).then(function (data) {
      var older = Array.isArray(data.messages) ? data.messages : [];
      state.messages = older.concat(state.messages);
      var page = data.messages_page || {};
      state.messageBefore = Number(page.next_before || state.messageBefore + older.length);
      state.messageHasMore = Boolean(page.has_more);
      renderDetail({ selected: data.selected, messages_page: page }, true);
      window.requestAnimationFrame(function () { box.scrollTop = Math.max(1, box.scrollHeight - oldHeight + oldTop); });
    }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Older upstream history is unavailable.", true); }).then(function () { state.messageLoading = false; if (!state.messageHasMore) setMessage("Reached the beginning of this conversation."); });
  }
  function scheduleRecovery(load) { if (state.recoveryTimer || state.recoveryAttempts >= 4) return; state.recoveryAttempts += 1; state.recoveryTimer = window.setTimeout(function () { state.recoveryTimer = null; load(); }, 2500); }
  function loadUpstream(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    if (state.syncing) return;
    state.syncing = true;
    if (!silent) setMessage("Loading upstream suppliers…");
    var params = new URLSearchParams();
    var search = value("upstream-search");
    var country = value("upstream-country");
    if (search) params.set("search", search);
    if (country) params.set("country", country);
    params.set("refresh", String(Date.now()));
    api("/api/ui/upstream?" + params.toString()).then(function (data) {
      state.recoveryAttempts = 0;
      var nextRows = Array.isArray(data.upstream) ? data.upstream : [];
      var nextFingerprint = rowsFingerprint(nextRows);
      var listChanged = nextFingerprint !== state.listFingerprint;
      state.rows = nextRows;
      state.listFingerprint = nextFingerprint;
      setOptions("upstream-country", data.countries || [], "All countries");
      if (!silent || listChanged) renderRows();
      if (state.selected && state.rows.some(function (row) { return row.supplier_ref === state.selected; })) {
        selectRow(state.selected, {silent: silent});
      } else if (!silent) {
        state.selected = null;
        state.chatFingerprint = "";
        renderDetail({ messages: [] });
      }
      if (!silent) setMessage("");
    }).catch(function (error) {
      if (!silent && error.message !== "unauthorized") {
        setMessage("Upstream list is unavailable; retrying…", true);
        scheduleRecovery(function () { loadUpstream(); });
      }
    }).then(function () { state.syncing = false; });
  }
  function upstreamModuleActive() {
    if (location.hash === "#upstream") return true;
    var panel = document.querySelector('.module-panel[data-panel="upstream"]');
    if (panel && panel.classList && panel.classList.contains("active")) return true;
    var link = document.querySelector('.side-link[data-module="upstream"].active');
    return Boolean(link);
  }
  function scheduleLiveSync() {
    if (state.liveTimer) window.clearInterval(state.liveTimer);
    state.liveTimer = window.setInterval(function () {
      if (!upstreamModuleActive() || document.hidden) return;
      loadUpstream({silent: true});
    }, LIVE_SYNC_MS);
  }
  function selectedRow() { return state.rows.filter(function (row) { return row.supplier_ref === state.selected; })[0] || (state.detail && state.detail.selected); }
  function copy(text) { if (text && navigator.clipboard) navigator.clipboard.writeText(text).then(function () { setMessage("Copied."); }); }
  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest('.side-link[data-module="upstream"]');
    var refresh = event.target.closest && event.target.closest('[data-action="upstream-refresh"]');
    if (link || refresh) window.setTimeout(loadUpstream, 0);
    if (event.target.closest && event.target.closest('[data-action="upstream-open"]')) { var box = el("tbot-ui-live-upstream-chat"); if (box) box.focus(); }
    if (event.target.id === "upstream-copy-phone") { var row = selectedRow(); if (row) copy(row.phone_display || row.phone); }
    if (event.target.id === "upstream-copy-wa") { var row2 = selectedRow(); if (row2) copy(row2.whatsapp_url || ("https://wa.me/" + String(row2.phone || "").replace(/\D/g, ""))); }
    if (event.target.id === "upstream-filter-apply" && state.selected) selectRow(state.selected);
  });
  var chatBox = el("tbot-ui-live-upstream-chat"); if (chatBox) chatBox.addEventListener("scroll", function () { if (chatBox.scrollTop <= 24) loadOlderUpstreamMessages(); });
  var search = el("upstream-search"); if (search) search.addEventListener("keydown", function (event) { if (event.key === "Enter") loadUpstream(); });
  if (search) search.placeholder = "Search phone, name or country";
  var country = el("upstream-country"); if (country) country.addEventListener("change", loadUpstream);
  window.addEventListener("hashchange", function () { if (location.hash === "#upstream") loadUpstream(); });
  if (location.hash === "#upstream") loadUpstream();
  scheduleLiveSync();
})();
