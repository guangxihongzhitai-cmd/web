(function () {
  "use strict";

  if (typeof hztApplyMedia === "function") {
    hztApplyMedia();
  }

  var header = document.getElementById("site-header");
  var navLinks = document.querySelectorAll("[data-nav]");
  var sections = ["home", "products", "services", "about", "gallery", "contact"];
  var sectionEls = sections.map(function (id) {
    return document.getElementById(id);
  });

  function updateHeader() {
    if (header) {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    }
  }
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  function setActiveNav() {
    var current = "home";
    var scrollPos = window.scrollY + 140;
    sectionEls.forEach(function (el, i) {
      if (el && el.offsetTop <= scrollPos) {
        current = sections[i];
      }
    });
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("data-nav") === current);
    });
  }
  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();

  var mobileBtn = document.getElementById("mobile-menu-btn");
  var mobileClose = document.getElementById("mobile-close-btn");
  var mobileNav = document.getElementById("mobile-nav");
  var mobileOverlay = document.getElementById("mobile-overlay");

  function openMobile() {
    mobileNav.classList.add("is-open");
    mobileOverlay.classList.add("is-open");
    mobileBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMobile() {
    mobileNav.classList.remove("is-open");
    mobileOverlay.classList.remove("is-open");
    mobileBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (mobileBtn) mobileBtn.addEventListener("click", openMobile);
  if (mobileClose) mobileClose.addEventListener("click", closeMobile);
  if (mobileOverlay) mobileOverlay.addEventListener("click", closeMobile);
  document.querySelectorAll(".mobile-nav-link").forEach(function (link) {
    link.addEventListener("click", closeMobile);
  });

  document.querySelectorAll(".btn-card[data-product]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var select = document.getElementById("equipment");
      if (select) {
        select.value = btn.getAttribute("data-product");
      }
    });
  });

  var quickForm = document.getElementById("quick-inquiry");
  if (quickForm) {
    quickForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var cat = document.getElementById("qi-category");
      var cond = document.getElementById("qi-condition");
      var brand = document.getElementById("qi-brand");
      var equip = document.getElementById("equipment");
      var msg = document.getElementById("message");
      if (equip && cat) equip.value = cat.value;
      if (msg) {
        msg.value =
          "Condition: " +
          (cond ? cond.value : "") +
          (brand && brand.value ? "\nBrand/Model: " + brand.value : "");
      }
      document.getElementById("contact").scrollIntoView({ behavior: "smooth" });
    });
  }

  var contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("name");
      var email = document.getElementById("email");
      var equipment = document.getElementById("equipment");
      var message = document.getElementById("message");
      var text = [
        "Hello, I am " + (name && name.value ? name.value : "a customer") + ".",
        "Equipment: " + (equipment ? equipment.value : ""),
        message && message.value ? "Details: " + message.value : "",
        email && email.value ? "Email: " + email.value : "",
      ].filter(Boolean).join("\n");
      // Static GitHub Pages has no backend. Route the secondary inquiry to the
      // same local WhatsApp contact instead of falsely claiming it was stored.
      window.open("https://wa.me/8613557716777?text=" + encodeURIComponent(text), "_blank", "noopener");
      alert("Your message is ready in WhatsApp. Please send it there for the fastest reply.");
    });
  }

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
    );
    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  var tbotFab = document.getElementById("tbot-fab");
  var tbotWrapper = document.getElementById("tbot-chat-wrapper");
  var tbotClose = document.getElementById("tbot-close-btn");

  function toggleChat(open) {
    var isOpen = open !== undefined ? open : !tbotWrapper.classList.contains("is-open");
    tbotWrapper.classList.toggle("is-open", isOpen);
    tbotFab.classList.toggle("is-active", isOpen);
    tbotFab.setAttribute("aria-expanded", String(isOpen));
    tbotWrapper.setAttribute("aria-hidden", String(!isOpen));
    tbotFab.innerHTML = isOpen
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-comment-dots"></i>';
  }

  if (tbotFab) tbotFab.addEventListener("click", function () { toggleChat(); });
  if (tbotClose) tbotClose.addEventListener("click", function () { toggleChat(false); });

  var supportForm = document.getElementById("public-support-form");
  var supportMessages = document.getElementById("tbot-chat-messages");
  var supportSession = sessionStorage.getItem("hzt_support_session");
  if (!supportSession) {
    supportSession = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    sessionStorage.setItem("hzt_support_session", supportSession);
  }
  function appendSupport(text, kind) {
    if (!supportMessages) return;
    var row = document.createElement("p");
    row.className = "support-message " + (kind || "");
    row.textContent = text;
    supportMessages.appendChild(row);
    supportMessages.scrollTop = supportMessages.scrollHeight;
  }
  if (supportForm) supportForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var field = document.getElementById("public-support-message");
    var message = field ? field.value.trim() : "";
    if (!message) return;
    var requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    appendSupport(message, "from-customer");
    field.value = "";
    appendSupport("Sending securely…", "from-system support-pending");
    /* The Cloudflare edge signs this request server-side before forwarding.
       No gateway secret or internal token is ever present in browser code. */
    fetch("https://api.hongzhtaichina.com/api/clients/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: supportSession, request_id: requestId, message: message })
    }).then(function (response) {
      var pending = supportMessages && supportMessages.querySelector(".support-pending:last-child");
      if (response && response.ok) {
        if (pending) pending.textContent = "Thanks — your message is with our support team. We’ll reply as soon as possible.";
      } else {
        if (pending) pending.textContent = "The online channel is temporarily unavailable. Please WhatsApp +8613557716777 or visit our yard.";
      }
    }).catch(function () {
      var pending = supportMessages && supportMessages.querySelector(".support-pending:last-child");
      if (pending) pending.textContent = "The online channel is temporarily unavailable. Please WhatsApp +8613557716777 or visit our yard.";
    });
  });

  var internalTrigger = document.getElementById("internal-entry-trigger");
  if (internalTrigger) internalTrigger.addEventListener("click", function () {
    var entered = window.prompt("Internal access password");
    if (entered === "168861") window.location.assign("./tbot-ui.html");
  });

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if (typeof Swiper !== "undefined") {
    new Swiper(".hero-swiper", {
      loop: true,
      speed: 900,
      autoplay: { delay: 7000, disableOnInteraction: false },
      pagination: { el: ".hero-pagination", clickable: true },
      navigation: {
        nextEl: ".hero-nav-next",
        prevEl: ".hero-nav-prev",
      },
    });
  }

  var galleryEl = document.getElementById("media-gallery");
  if (galleryEl && "IntersectionObserver" in window) {
    var galObs = new IntersectionObserver(
      function (entries, obs) {
        if (entries[0].isIntersecting) {
          galleryEl.querySelectorAll(".reveal").forEach(function (el) {
            el.classList.add("is-visible");
          });
          obs.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    galObs.observe(galleryEl);
  }
})();
