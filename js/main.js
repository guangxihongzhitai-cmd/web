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
