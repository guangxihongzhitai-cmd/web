(function(){"use strict";
  var logout=document.getElementById("logout");
  if(logout)logout.addEventListener("click",function(){sessionStorage.removeItem("hzt_tbot_authenticated");location.replace("./tbot-login.html")});
  var status=document.getElementById("api-status");
  if(status){fetch("https://api.hongzhtaichina.com/health",{mode:"cors",cache:"no-store"}).then(function(r){if(!r.ok)throw Error();status.textContent="ONLINE"}).catch(function(){status.textContent="PROTECTED"})}
  var titles={"workbench":["Workbench","Driver command surface · manual controls and live link state."],"lead-discovery":["Lead Discovery","Lead discovery and Hbot control center · manual only."],"clients":["Clients","Customer management, chat history and media context."],"whitelist":["Whitelist & Depts","Identity, departments and approved-number policies."],"keypool":["API Keypool Hot","Provider health and mirror hot-standby state."],"plugins":["OpenClaw Plugins","Mounted skills and communications equipment."],"runtime-logs":["Runtime Logs","Sanitized operational evidence and lifecycle events."]};
  var links=document.querySelectorAll(".side-link[data-module]"), panels=document.querySelectorAll(".module-panel[data-panel]"), title=document.getElementById("module-title"), subtitle=document.getElementById("module-subtitle");
  function select(name){var info=titles[name]||titles.workbench;links.forEach(function(a){a.classList.toggle("active",a.getAttribute("data-module")===name)});panels.forEach(function(p){p.classList.toggle("active",p.getAttribute("data-panel")===name)});if(title)title.textContent=info[0];if(subtitle)subtitle.textContent=info[1];if(history.replaceState)history.replaceState(null,"","#"+name)}
  links.forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();select(a.getAttribute("data-module"))})});
  var initial=location.hash.slice(1);select(titles[initial]?initial:"workbench");
})();
