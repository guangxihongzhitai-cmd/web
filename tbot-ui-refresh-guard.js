(function () {
  "use strict";
  function install(panel, countId, action, label) {
    var heading = document.querySelector('[data-panel="' + panel + '"] .client-list-heading');
    if (!heading) return;
    var actions = heading.querySelector('.list-heading-actions');
    if (!actions) { actions = document.createElement('div'); actions.className = 'list-heading-actions'; heading.appendChild(actions); }
    var count = document.getElementById(countId);
    if (count && count.parentNode !== actions) actions.appendChild(count);
    var existing = actions.querySelector('[data-action="' + action + '"]') || document.querySelector('[data-action="' + action + '"]');
    if (existing) {
      if (existing.parentNode !== actions) actions.appendChild(existing);
      existing.id = action; existing.className = 'module-action list-refresh'; existing.setAttribute('aria-label', label); existing.title = label;
      return;
    }
    var button = document.createElement('button');
    button.id = action; button.type = 'button'; button.className = 'module-action list-refresh';
    button.dataset.action = action; button.textContent = 'Refresh'; button.setAttribute('aria-label', label); button.title = label;
    actions.appendChild(button);
  }
  function installAll() { install('clients', 'clients-count', 'clients-refresh', 'Refresh Clients list'); install('upstream', 'upstream-count', 'upstream-refresh', 'Refresh Upstream list'); }
  installAll();
  new MutationObserver(installAll).observe(document.body, { childList: true, subtree: true });
}());
