(function () {
  "use strict";
  var API = "https://api.hongzhtaichina.com";
  var state = { rows: [], selected: null, detail: null };
  function el(id) { return document.getElementById(id); }
  function setMessage(message, error) {
    var feedback = el("module-feedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.toggle("is-error", Boolean(error));
  }
  function api(path) {
    return fetch(API + path, { credentials: "include", cache: "no-store", headers: { "Accept": "application/json" } }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) { location.replace("./tbot-login.html"); throw new Error("unauthorized"); }
        if (!response.ok || !data || data.ok === false) throw new Error((data && data.error) || "request_failed");
        return data;
      });
    });
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
      var meta = document.createElement("span"); meta.className = "client-row-meta"; meta.textContent = [row.phone_display || row.phone || row.supplier_ref, row.country, row.status, row.vehicle_summary].filter(Boolean).join(" · ");
      item.appendChild(head); item.appendChild(meta); item.addEventListener("click", function () { selectRow(row.supplier_ref); }); list.appendChild(item);
    });
  }
  function renderDetail(data) {
    state.detail = data;
    var row = data.selected || state.rows.filter(function (item) { return item.supplier_ref === state.selected; })[0];
    var title = el("selected-upstream-title");
    if (title) title.textContent = row ? ((row.name || row.supplier_ref) + " · " + (row.phone_display || row.phone || row.supplier_ref)) : "Select a supplier";
    ["upstream-copy-phone", "upstream-copy-wa"].forEach(function (id) { if (el(id)) el(id).disabled = !row; });
    var box = el("tbot-ui-live-upstream-chat"); if (!box) return;
    box.innerHTML = "";
    var messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) { box.innerHTML = '<div class="data-placeholder">No upstream messages recorded for this supplier.</div>'; return; }
    messages.forEach(function (message) {
      var article = document.createElement("article"); article.className = "client-message " + (message.direction === "outbound" ? "outbound" : "inbound");
      var meta = document.createElement("div"); meta.className = "client-message-meta"; meta.textContent = [message.ts_display || message.ts || "", message.direction || "", message.sender_label || ""].filter(Boolean).join(" · ");
      var text = document.createElement("div"); text.className = "client-message-text"; text.textContent = message.text || "";
      article.appendChild(meta); article.appendChild(text); box.appendChild(article);
    });
    box.scrollTop = box.scrollHeight;
  }
  function selectRow(ref) {
    state.selected = ref; renderRows(); setMessage("Loading upstream conversation…");
    var params = new URLSearchParams({ supplier_ref: ref, max_messages: "400" });
    var filters = {
      country: value("upstream-filter-country"),
      name_query: value("upstream-filter-name"),
      date_from: value("upstream-filter-from"),
      date_to: value("upstream-filter-to"),
      keyword: value("upstream-filter-keyword")
    };
    Object.keys(filters).forEach(function (key) { if (filters[key]) params.set(key, filters[key]); });
    api("/api/ui/upstream?" + params.toString()).then(renderDetail).then(function () { setMessage(""); }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Upstream history is unavailable.", true); });
  }
  function loadUpstream() {
    setMessage("Loading upstream suppliers…");
    var params = new URLSearchParams(); var search = value("upstream-search"); var country = value("upstream-country");
    if (search) params.set("search", search); if (country) params.set("country", country); params.set("refresh", String(Date.now()));
    api("/api/ui/upstream?" + params.toString()).then(function (data) {
      state.rows = Array.isArray(data.upstream) ? data.upstream : [];
      setOptions("upstream-country", data.countries || [], "All countries"); renderRows();
      if (state.selected && state.rows.some(function (row) { return row.supplier_ref === state.selected; })) selectRow(state.selected);
      else { state.selected = null; renderDetail({ messages: [] }); setMessage(""); }
    }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Upstream list is unavailable.", true); });
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
  var search = el("upstream-search"); if (search) search.addEventListener("keydown", function (event) { if (event.key === "Enter") loadUpstream(); });
  if (search) search.placeholder = "Search phone, name or country";
  var country = el("upstream-country"); if (country) country.addEventListener("change", loadUpstream);
  window.addEventListener("hashchange", function () { if (location.hash === "#upstream") loadUpstream(); });
  if (location.hash === "#upstream") loadUpstream();
})();
