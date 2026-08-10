(function () {
  "use strict";
  var API = "https://api.hongzhtaichina.com";
  var state = {clients: [], selected: null, detail: null};
  function el(id) { return document.getElementById(id); }
  function setMessage(message, error) {
    var feedback = el("module-feedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.toggle("is-error", Boolean(error));
  }
  function api(path, options) {
    options = options || {};
    options.credentials = "include";
    options.cache = "no-store";
    options.headers = Object.assign({"Accept": "application/json"}, options.headers || {});
    return fetch(API + path, options).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401) { location.replace("./tbot-login.html"); throw new Error("unauthorized"); }
        if (!response.ok || !data || data.ok === false) throw new Error((data && data.error) || "request_failed");
        return data;
      });
    });
  }
  function queryValue(id) { var node = el(id); return node ? String(node.value || "").trim() : ""; }
  function setOptions(id, values, firstLabel) {
    var node = el(id); if (!node) return;
    var current = node.value;
    node.innerHTML = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = firstLabel; node.appendChild(first);
    (values || []).forEach(function (value) { var option = document.createElement("option"); option.value = value; option.textContent = value; node.appendChild(option); });
    if ([].some.call(node.options, function (o) { return o.value === current; })) node.value = current;
  }
  function renderClients() {
    var list = el("clients-list"), count = el("clients-count");
    if (!list) return;
    list.innerHTML = "";
    if (count) count.textContent = String(state.clients.length);
    if (!state.clients.length) { list.innerHTML = '<div class="data-placeholder">No clients match this search.</div>'; return; }
    state.clients.forEach(function (client) {
      var row = document.createElement("button");
      row.type = "button"; row.className = "client-row" + (state.selected === client.phone ? " active" : "");
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", state.selected === client.phone ? "true" : "false");
      var name = document.createElement("strong"); name.textContent = client.name || client.phone_display || client.phone;
      var meta = document.createElement("span"); meta.textContent = [client.phone_display || client.phone, client.country].filter(Boolean).join(" · ");
      row.appendChild(name); row.appendChild(meta);
      row.addEventListener("click", function () { selectClient(client.phone); });
      list.appendChild(row);
    });
  }
  function renderDetail(data) {
    state.detail = data;
    var client = data.selected || state.clients.filter(function (item) { return item.phone === state.selected; })[0];
    var title = el("selected-client-title");
    if (title) title.textContent = client ? ((client.name || client.phone_display || client.phone) + " · " + (client.phone_display || client.phone)) : "Select a client";
    ["client-copy-name", "client-copy-phone", "client-copy-wa", "client-edit-name"].forEach(function (id) { if (el(id)) el(id).disabled = !client; });
    var box = el("tbot-ui-live-client-chat"); if (!box) return;
    box.innerHTML = "";
    var messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) { box.innerHTML = '<div class="data-placeholder">No messages match the current filters.</div>'; return; }
    messages.forEach(function (message) {
      var item = document.createElement("article"); item.className = "client-message " + (message.direction === "outbound" ? "outbound" : "inbound");
      var meta = document.createElement("div"); meta.className = "client-message-meta"; meta.textContent = [message.ts_display || message.ts || "", message.direction || "", message.sender_label || "", message.dispatch_id ? ("dispatch=" + message.dispatch_id) : "", message.message_id ? ("msg=" + message.message_id) : ""].filter(Boolean).join(" · ");
      var text = document.createElement("div"); text.className = "client-message-text"; text.textContent = message.text || "";
      item.appendChild(meta); item.appendChild(text); box.appendChild(item);
    });
    box.scrollTop = box.scrollHeight;
  }
  function currentFilters() {
    return {country: queryValue("chat-filter-country"), name_query: queryValue("chat-filter-name"), date_from: queryValue("chat-filter-from"), date_to: queryValue("chat-filter-to"), keyword: queryValue("chat-filter-keyword")};
  }
  function selectClient(phone) {
    state.selected = phone; renderClients(); setMessage("Loading conversation…");
    var params = new URLSearchParams({phone: phone, max_messages: "400"});
    Object.keys(currentFilters()).forEach(function (key) { if (currentFilters()[key]) params.set(key, currentFilters()[key]); });
    api("/api/ui/clients?" + params.toString()).then(renderDetail).then(function () { setMessage(""); }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Client history is unavailable.", true); });
  }
  function loadClients() {
    setMessage("Loading clients…");
    var params = new URLSearchParams(); var search = queryValue("clients-search"); var country = queryValue("clients-country");
    if (search) params.set("search", search); if (country) params.set("country", country);
    api("/api/ui/clients?" + params.toString()).then(function (data) {
      state.clients = Array.isArray(data.clients) ? data.clients : [];
      setOptions("clients-country", data.countries || [], "All countries");
      setOptions("chat-filter-country", data.countries || [], "All");
      renderClients();
      if (state.selected && state.clients.some(function (client) { return client.phone === state.selected; })) selectClient(state.selected);
      else { state.selected = null; renderDetail({messages: []}); setMessage(""); }
    }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Client list is unavailable.", true); });
  }
  function selectedClient() { return state.clients.filter(function (client) { return client.phone === state.selected; })[0] || (state.detail && state.detail.selected); }
  function copy(value) { if (!value) return; navigator.clipboard && navigator.clipboard.writeText(value).then(function () { setMessage("Copied."); }).catch(function () { setMessage("Copy was blocked by the browser.", true); }); }
  function rename() {
    var client = selectedClient(); if (!client) return;
    var name = window.prompt("Display name", client.name || ""); if (name === null) return;
    api("/api/ui/clients/name", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({phone: client.phone, name: name.trim()})}).then(function () { setMessage("Display name updated."); loadClients(); }).catch(function (error) { if (error.message !== "unauthorized") setMessage("Display name was not updated.", true); });
  }
  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest('.side-link[data-module="clients"]');
    var refresh = event.target.closest && event.target.closest('[data-action="clients-refresh"]');
    if (link || refresh) window.setTimeout(loadClients, 0);
    var focus = event.target.closest && event.target.closest('[data-action="clients-open"]');
    if (focus) { var box = el("tbot-ui-live-client-chat"); if (box) box.focus(); }
    if (event.target.id === "chat-filter-apply" && state.selected) selectClient(state.selected);
    if (event.target.id === "client-copy-name") { var c = selectedClient(); if (c) copy(c.name || ""); }
    if (event.target.id === "client-copy-phone") { var c2 = selectedClient(); if (c2) copy(c2.phone_display || c2.phone); }
    if (event.target.id === "client-copy-wa") { var c3 = selectedClient(); if (c3) copy(c3.whatsapp_url || ("https://wa.me/" + c3.phone.replace(/\D/g, ""))); }
    if (event.target.id === "client-edit-name") rename();
  });
  var search = el("clients-search"); if (search) search.addEventListener("keydown", function (event) { if (event.key === "Enter") loadClients(); });
  window.addEventListener("hashchange", function () { if (location.hash === "#clients") loadClients(); });
  if (location.hash === "#clients") loadClients();
})();
