/**
 * Shared chrome for nested public pages (FAQ, used pump trucks, listings).
 * Does not load the homepage chat widget or any API hosts.
 */
(function () {
  "use strict";

  var header = document.getElementById("site-header");
  function updateHeader() {
    if (header) {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    }
  }
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  var mobileBtn = document.getElementById("mobile-menu-btn");
  var mobileClose = document.getElementById("mobile-close-btn");
  var mobileNav = document.getElementById("mobile-nav");
  var mobileOverlay = document.getElementById("mobile-overlay");

  function openMobile() {
    if (!mobileNav || !mobileOverlay || !mobileBtn) return;
    mobileNav.classList.add("is-open");
    mobileOverlay.classList.add("is-open");
    mobileBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMobile() {
    if (!mobileNav || !mobileOverlay || !mobileBtn) return;
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

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
})();
