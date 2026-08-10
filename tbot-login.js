(function () {
  "use strict";
  var form = document.getElementById("tbot-login-form");
  var password = document.getElementById("tbot-password");
  var error = document.getElementById("tbot-login-error");
  if (!form) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!password || !password.value) return;
    error.hidden = true;
    fetch("https://api.hongzhtaichina.com/api/ui/login", {
      method: "POST", credentials: "include",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({password: password.value})
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok || !data || !data.ok) throw new Error("unauthorized");
        window.location.assign("./tbot-ui.html");
      });
    }).catch(function () {
      error.hidden = false; password.value = ""; password.focus();
    });
  });
})();
