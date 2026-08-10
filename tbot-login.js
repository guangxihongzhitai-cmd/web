(function () {
  "use strict";
  var form = document.getElementById("tbot-login-form");
  var password = document.getElementById("tbot-password");
  var error = document.getElementById("tbot-login-error");
  if (!form) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    /* Temporary bootstrap password requested by the owner. Replace this
       client gate with the Cloudflare Access/Worker session gate before
       exposing operational data publicly. */
    var ok = password && password.value === "168861";
    if (!ok) {
      error.hidden = false;
      password.value = "";
      password.focus();
      return;
    }
    sessionStorage.setItem("hzt_tbot_authenticated", "1");
    window.location.assign("./tbot-ui.html");
  });
})();
