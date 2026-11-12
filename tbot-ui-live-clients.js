(function () {
  "use strict";
  // Ops Clients page. The Data API list is {ok, clients, countries}. Staff rows
  // add role/role_label and a masked phone_display/whatsapp_url (****last4).
  // A throw while painting used to reject the load after #clients-list was
  // cleared, so the panel stayed empty even though the API had rows.
  var API = "https://api.hongzhtaichina.com";
  var LIVE_SYNC_MS = 4000;
  var state = {clients: [], selected: null, detail: null, messages: [], messageBefore: 0, messageHasMore: false, messageLoading: false, recoveryTimer: null, recoveryAttempts: 0, liveTimer: null, syncing: false, listFingerprint: "", chatFingerprint: ""};
  function el(id) { return document.getElementById(id); }
  function setMessage(message, error) { var feedback = el("module-feedback"); if (!feedback) return; feedback.textContent = message || ""; feedback.classList.toggle("is-error", Boolean(error)); }
  function asText(value) { return value == null ? "" : String(value); }
  function isStaff(client) { return !!(client && (client.role === "staff" || client.role_label === "Staff")); }
  function shownPhone(client) {
    if (!client || typeof client !== "object") return "";
    if (isStaff(client)) return asText(client.phone_display) || "****";
    return asText(client.phone_display || client.phone);
  }
  function shownName(client) { return asText(client && (client.name || shownPhone(client))) || "Client"; }
  function waCopyValue(client) {
    var url = asText(client && client.whatsapp_url);
    // Never build wa.me from the raw phone. Staff urls are the ****last4 mask.
    if (isStaff(client) || !/^https:\/\/wa\.me\/\d+$/.test(url)) return shownPhone(client);
    return url;
  }
  function api(path, options) {
    options = options || {}; options.credentials = "include"; options.cache = "no-store";
    options.headers = Object.assign({"Accept": "application/json"}, options.headers || {});
    var retryable = !options.method || String(options.method).toUpperCase() === "GET";
    function attempt(number) {
      var controller = window.AbortController ? new AbortController() : null;
      var request = Object.assign({}, options);
      if (controller) { request.signal = controller.signal; window.setTimeout(function () { controller.abort(); }, 15000); }
      return fetch(API + path, request).then(function (response) { return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) { location.replace("./tbot-login.html"); throw new Error("unauthorized"); }
        if (!response.ok || !data || data.ok === false) {
          var transient = response.status === 404 || response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504 || (data && data.error === "ui_upstream_unavailable");
          if (retryable && transient && number < 3) return new Promise(function (resolve) { window.setTimeout(resolve, 350 * number); }).then(function () { return attempt(number + 1); });
          throw new Error((data && data.error) || "request_failed");
        }
        return data;
      }); }).catch(function (error) {
        if (retryable && number < 3 && error && (error.name === "AbortError" || error.name === "TypeError")) return new Promise(function (resolve) { window.setTimeout(resolve, 350 * number); }).then(function () { return attempt(number + 1); });
        throw error;
      });
    }
    return attempt(1);
  }
  function value(id) { var node = el(id); return node ? String(node.value || "").trim() : ""; }
  function setOptions(id, values, firstLabel) { var node = el(id); if (!node) return; var current = node.value; node.innerHTML = ""; var first = document.createElement("option"); first.value = ""; first.textContent = firstLabel; node.appendChild(first); (Array.isArray(values) ? values : []).forEach(function (item) { if (item == null || typeof item === "object") return; var option = document.createElement("option"); option.value = String(item); option.textContent = String(item); node.appendChild(option); }); if ([].some.call(node.options, function (o) { return o.value === current; })) node.value = current; }
  function placeholder(list, text) { list.innerHTML = ""; var node = document.createElement("div"); node.className = "data-placeholder"; node.textContent = text; list.appendChild(node); }
  function renderClients() { var list = el("clients-list"), count = el("clients-count"); if (!list) return; var rows = state.clients.filter(function (client) { return client && typeof client === "object"; }); if (count) count.textContent = String(rows.length); if (!rows.length) { placeholder(list, "No clients match this search."); return; } list.innerHTML = ""; rows.forEach(function (client) { try { var row = document.createElement("button"); row.type = "button"; var phoneKey = asText(client.phone); row.className = "client-row" + (state.selected === phoneKey ? " active" : ""); row.setAttribute("role", "option"); row.setAttribute("aria-selected", state.selected === phoneKey ? "true" : "false"); var head = document.createElement("div"); head.className = "client-row-head"; var name = document.createElement("strong"); name.textContent = shownName(client); var stamp = document.createElement("time"); stamp.className = "client-row-time"; stamp.textContent = asText(client.last_activity_display) || "—"; head.appendChild(name); head.appendChild(stamp); if (isStaff(client)) { var badge = document.createElement("span"); badge.className = "crm-badge crm-badge-party"; badge.textContent = "Staff"; head.appendChild(badge); } var meta = document.createElement("span"); meta.className = "client-row-meta"; meta.textContent = [shownPhone(client), asText(client.country)].filter(Boolean).join(" · "); row.appendChild(head); row.appendChild(meta); row.addEventListener("click", function () { if (phoneKey) selectClient(phoneKey); }); list.appendChild(row); } catch (ignore) {} }); if (!list.childNodes.length) placeholder(list, "No clients match this search."); }
  function renderDetail(data, appendOlder) { data = data && typeof data === "object" ? data : {}; state.detail = data; var client = data.selected || state.clients.filter(function (item) { return item && asText(item.phone) === state.selected; })[0]; var title = el("selected-client-title"); if (title) title.textContent = client ? (shownName(client) + " · " + shownPhone(client)) : "Select a client"; ["client-copy-name", "client-copy-phone", "client-copy-wa", "client-edit-name"].forEach(function (id) { if (el(id)) el(id).disabled = !client; }); if (!appendOlder) state.messages = (Array.isArray(data.messages) ? data.messages : []).filter(function (message) { return message && typeof message === "object"; }); var page = data.messages_page || {}; if (!appendOlder) { state.messageBefore = Number(page.next_before || state.messages.length || 0); state.messageHasMore = Boolean(page.has_more); } var box = el("tbot-ui-live-client-chat"); if (!box) return; var oldHeight = box.scrollHeight; var oldTop = box.scrollTop; box.innerHTML = ""; if (!state.messages.length) { box.innerHTML = '<div class="data-placeholder">No messages match the current filters.</div>'; return; } state.messages.forEach(function (message) { if (!message || typeof message !== "object") return; var item = document.createElement("article"); item.className = "client-message " + (message.direction === "outbound" ? "outbound" : "inbound"); var meta = document.createElement("div"); meta.className = "client-message-meta"; meta.textContent = [asText(message.ts_display || message.ts), asText(message.direction), asText(message.sender_label), message.dispatch_id ? ("dispatch=" + asText(message.dispatch_id)) : "", message.message_id ? ("msg=" + asText(message.message_id)) : ""].filter(Boolean).join(" · "); var text = document.createElement("div"); text.className = "client-message-text"; text.textContent = asText(message.text); item.appendChild(meta); item.appendChild(text); box.appendChild(item); }); if (appendOlder) box.scrollTop = Math.max(1, box.scrollHeight - oldHeight + oldTop); else box.scrollTop = box.scrollHeight; }
  function currentFilters() { return {country: value("chat-filter-country"), name_query: value("chat-filter-name"), date_from: value("chat-filter-from"), date_to: value("chat-filter-to"), keyword: value("chat-filter-keyword")}; }
  function clientsFingerprint(rows) {
    return (rows || []).map(function (row) {
      if (!row || typeof row !== "object") return "";
      return [asText(row.phone), asText(row.last_activity), asText(row.name), asText(row.linked_customer_phone), asText(row.role)].join(":");
    }).join("|");
  }
  function messagesFingerprint(rows) {
    if (!rows || !rows.length) return "0";
    var first = rows[0] || {};
    var last = rows[rows.length - 1] || {};
    return [rows.length, asText(first.ts), asText(last.ts), asText(last.message_id), asText(last.dispatch_id), asText(first.text).slice(-24), asText(last.text).slice(-48)].join("|");
  }
  function selectClient(phone, options) {
    options = options || {};
    var silent = Boolean(options.silent);
    state.selected = asText(phone);
    if (!state.selected) return;
    if (!silent) {
      state.messages = [];
      state.messageBefore = 0;
      state.messageHasMore = false;
      state.chatFingerprint = "";
      renderClients();
      setMessage("Loading latest 10 messages…");
    }
    var filters = currentFilters();
    var params = new URLSearchParams({phone: state.selected, limit: "10", before: "0", refresh: String(Date.now())});
    Object.keys(filters).forEach(function (key) { if (filters[key]) params.set(key, filters[key]); });
    api("/api/ui/clients?" + params.toString()).then(function (data) {
      var nextMessages = (Array.isArray(data.messages) ? data.messages : []).filter(function (message) { return message && typeof message === "object"; });
      var nextFingerprint = messagesFingerprint(nextMessages);
      if (silent && nextFingerprint === state.chatFingerprint) return;
      state.chatFingerprint = nextFingerprint;
      renderDetail(data, false);
    }).then(function () { if (!silent) setMessage(""); }).catch(function (error) { if (!silent && error.message !== "unauthorized") setMessage("Client history is unavailable.", true); });
  }
  function loadOlderClientMessages() { var box = el("tbot-ui-live-client-chat"); if (!box || !state.selected || state.messageLoading || !state.messageHasMore) return; state.messageLoading = true; setMessage("Loading 10 older messages…"); var oldHeight = box.scrollHeight; var oldTop = box.scrollTop; var params = new URLSearchParams({phone: state.selected, limit: "10", before: String(state.messageBefore), refresh: String(Date.now())}); var filters = currentFilters(); Object.keys(filters).forEach(function (key) { if (filters[key]) params.set(key, filters[key]); }); api("/api/ui/clients?" + params.toString()).then(function (data) { var older = (Array.isArray(data.messages) ? data.messages : []).filter(function (message) { return message && typeof message === "object"; }); state.messages = older.concat(state.messages); var page = data.messages_page || {}; state.messageBefore = Number(page.next_before || state.messageBefore + older.length); state.messageHasMore = Boolean(page.has_more); renderDetail({selected: data.selected, messages_page: page}, true); window.requestAnimationFrame(function () { box.scrollTop = Math.max(1, box.scrollHeight - oldHeight + oldTop); }); }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Older client history is unavailable.", true); }).then(function () { state.messageLoading = false; if (!state.messageHasMore) setMessage("Reached the beginning of this conversation."); }); }
  function scheduleRecovery(load) { if (state.recoveryTimer || state.recoveryAttempts >= 4) return; state.recoveryAttempts += 1; state.recoveryTimer = window.setTimeout(function () { state.recoveryTimer = null; load(); }, 2500); }
  function showListError() { var list = el("clients-list"); if (list && !list.querySelector(".client-row")) { placeholder(list, "Client list is unavailable. Refresh to try again."); } }
  function loadClients(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    if (state.syncing) return;
    state.syncing = true;
    if (!silent) setMessage("Loading clients…");
    var params = new URLSearchParams();
    var search = value("clients-search");
    var country = value("clients-country");
    if (search) params.set("search", search);
    if (country && country !== "(All)" && country !== "--") params.set("country", country);
    params.set("refresh", String(Date.now()));
    api("/api/ui/clients?" + params.toString()).then(function (data) {
      state.recoveryAttempts = 0;
      var nextClients = (Array.isArray(data.clients) ? data.clients : []).filter(function (client) { return client && typeof client === "object"; });
      var nextFingerprint = clientsFingerprint(nextClients);
      var listChanged = nextFingerprint !== state.listFingerprint;
      state.clients = nextClients;
      state.listFingerprint = nextFingerprint;
      setOptions("clients-country", data.countries || [], "All countries");
      setOptions("chat-filter-country", data.countries || [], "All");
      if (!silent || listChanged) renderClients();
      if (state.selected && state.clients.some(function (client) { return client && asText(client.phone) === state.selected; })) {
        selectClient(state.selected, {silent: silent});
      } else if (!silent) {
        state.selected = null;
        state.chatFingerprint = "";
        renderDetail({messages: []});
      }
      if (!silent) setMessage("");
    }).catch(function (error) {
      if (!silent && error.message !== "unauthorized") {
        setMessage("Client list is unavailable; retrying…", true);
        showListError();
        scheduleRecovery(function () { loadClients(); });
      }
    }).then(function () { state.syncing = false; });
  }
  function clientsModuleActive() {
    if (location.hash === "#clients") return true;
    var panel = document.querySelector('.module-panel[data-panel="clients"]');
    if (panel && panel.classList && panel.classList.contains("active")) return true;
    var link = document.querySelector('.side-link[data-module="clients"].active');
    return Boolean(link);
  }
  function scheduleLiveSync() {
    if (state.liveTimer) window.clearInterval(state.liveTimer);
    state.liveTimer = window.setInterval(function () {
      if (!clientsModuleActive() || document.hidden) return;
      loadClients({silent: true});
    }, LIVE_SYNC_MS);
  }
  function selectedClient() { return state.clients.filter(function (client) { return client && asText(client.phone) === state.selected; })[0] || (state.detail && state.detail.selected); }
  function copy(value) { if (!value || !navigator.clipboard) return; navigator.clipboard.writeText(value).then(function () { setMessage("Copied."); }).catch(function () { setMessage("Copy was blocked by the browser.", true); }); }
  function rename() { var client = selectedClient(); if (!client || !asText(client.phone)) return; var name = window.prompt("Display name", client.name || ""); if (name === null) return; api("/api/ui/clients/name", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: asText(client.phone), name: name.trim()})}).then(function () { setMessage("Display name updated."); loadClients(); }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Display name was not updated.", true); }); }
  document.addEventListener("click", function (event) { var link = event.target.closest && event.target.closest('.side-link[data-module="clients"]'); var refresh = event.target.closest && event.target.closest('[data-action="clients-refresh"]'); if (link || refresh) window.setTimeout(loadClients, 0); var focus = event.target.closest && event.target.closest('[data-action="clients-open"]'); if (focus) { var box = el("tbot-ui-live-client-chat"); if (box) box.focus(); } if (event.target.id === "chat-filter-apply" && state.selected) selectClient(state.selected); if (event.target.id === "client-copy-name") { var c = selectedClient(); if (c) copy(c.name || ""); } if (event.target.id === "client-copy-phone") { var c2 = selectedClient(); if (c2) copy(shownPhone(c2)); } if (event.target.id === "client-copy-wa") { var c3 = selectedClient(); if (c3) copy(waCopyValue(c3)); } if (event.target.id === "client-edit-name") rename(); });
  var chatBox = el("tbot-ui-live-client-chat"); if (chatBox) chatBox.addEventListener("scroll", function () { if (chatBox.scrollTop <= 24) loadOlderClientMessages(); });
  var search = el("clients-search"); if (search) search.addEventListener("keydown", function (event) { if (event.key === "Enter") loadClients(); });
  window.addEventListener("hashchange", function () { if (location.hash === "#clients") loadClients(); });
  if (location.hash === "#clients") loadClients();
  scheduleLiveSync();
})();
