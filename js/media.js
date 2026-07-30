/**
 * Site media — hero from pic/banner; body from OCR-checked panoramas + bigtree yard stock.
 */
(function (global) {
  "use strict";

  var BANNER = "pic/banner/";
  var PROD = "pic/products/";
  var GAL = "pic/gallery/";
  var BIG = "pic/bigtree/";
  var ABOUT = "pic/about/";

  function hztSrc(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    var clean = path.replace(/^\.\//, "");
    return (
      "./" +
      clean
        .split("/")
        .map(function (seg) {
          return encodeURIComponent(seg);
        })
        .join("/")
    );
  }

  global.HZT_MEDIA = {
    fallback: GAL + "zoomlion-sitrak-56m-left-front.jpg",
    logo: "logo.png",
    hero: {
      poster: BANNER + "zoomlion sitrak 51m right front (2).jpg",
      slides: [
        BANNER + "zoomlion sitrak 51m right front (2).jpg",
        BANNER + "xcmg xr460e photo.jpg",
        BANNER + "xcmg xr460e photo1.jpg",
      ],
    },
    products: {
      pump: PROD + "sany-benz-60m-left-front.jpg",
      loader: PROD + "xcmg-lw500hv-left-front.jpg",
      excavator: PROD + "liugong-920e-excavator-side.jpg",
      rig: PROD + "xcmg-xr460e-side.jpg",
    },
    about: ABOUT + "putzmeister-fleet-front.jpg",
    brands: {
      sany: GAL + "sany-benz-60m-left-front.jpg",
      zoomlion: GAL + "zoomlion-sitrak-56m-left-front.jpg",
      liugong: BIG + "liugong-920e-excavator-side.jpg",
      xcmg: BIG + "xcmg-lw500hv-left-front.jpg",
      putzmeister: GAL + "putzmeister-isuzu-46m-left-front.jpg",
    },
    gallery: [
      /* Pump trucks */
      GAL + "sany-benz-60m-left-front.jpg",
      GAL + "sany-47m-left-front.jpg",
      GAL + "putzmeister-isuzu-46m-left-front.jpg",
      GAL + "putzmeister-fleet-front.jpg",
      GAL + "liugong-sitrak-56m-left-front.jpg",
      GAL + "liugong-sitrak-56m-right-front.jpg",
      GAL + "zoomlion-sitrak-56m-left-front.jpg",
      GAL + "zoomlion-sitrak-51m-left-front.jpg",
      GAL + "zoomlion-sitrak-38m-left-side.jpg",
      GAL + "zoomlion-faw-47m-left-front.jpg",
      GAL + "xcmg-xr460e-side.jpg",
      GAL + "xcmg-xr460e-rear-side.jpg",
      /* Bigtree — excavators / loaders / rollers / yards */
      BIG + "liugong-920e-excavator-side.jpg",
      BIG + "liugong-920e-excavator-transport-side.jpg",
      BIG + "liugong-920e-excavator-transport-side1.jpg",
      BIG + "liebherr-he1430r-excavator-side.jpg",
      BIG + "liugong-excavator-yard-rear.jpg",
      BIG + "xcmg-loader-liugong-excavator-yard.jpg",
      BIG + "xcmg-lw500hv-left-front.jpg",
      BIG + "xcmg-lw550hv-left-front.jpg",
      BIG + "xcmg-loader-yard-side.jpg",
      BIG + "liugong-loader-left-front.jpg",
      BIG + "sdlg-l956he-side.jpg",
      BIG + "sdlg-l968f-left-front.jpg",
      BIG + "sem-loader-transport-side.jpg",
      BIG + "sany-shantui-xcmg-roller-side.jpg",
      BIG + "sany-shantui-xcmg-roller-left-front.jpg",
    ],
    videos: [
      {
        type: "youtube",
        id: "zYFHj9GAjFc",
        url: "https://youtube.com/shorts/zYFHj9GAjFc",
        label: "Open on YouTube Shorts",
      },
    ],
  };

  global.hztSrc = hztSrc;

  function bindImg(el, path) {
    if (!el || !path) return;
    var url = hztSrc(path);
    el.setAttribute("src", url);
    el.onerror = function () {
      this.onerror = null;
      this.src = hztSrc(global.HZT_MEDIA.fallback);
    };
  }

  function renderGallery() {
    var galleryEl = document.getElementById("media-gallery");
    if (!galleryEl || !global.HZT_MEDIA.gallery) return;
    galleryEl.innerHTML = global.HZT_MEDIA.gallery
      .map(function (path, i) {
        var url = hztSrc(path);
        return (
          '<a href="' +
          url +
          '" class="gallery-item reveal" target="_blank" rel="noopener">' +
          '<img src="' +
          url +
          '" alt="Equipment photo ' +
          (i + 1) +
          '" loading="lazy" />' +
          "</a>"
        );
      })
      .join("");
  }

  function bindYoutubePosters(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-yt-id]").forEach(function (card) {
      if (card.getAttribute("data-yt-bound") === "1") return;
      card.setAttribute("data-yt-bound", "1");
      var btn = card.querySelector(".yt-poster");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var id = card.getAttribute("data-yt-id");
        if (!id) return;
        var wrap = document.createElement("div");
        wrap.className = "yt-frame-wrap";
        wrap.innerHTML =
          '<iframe src="https://www.youtube-nocookie.com/embed/' +
          id +
          '?autoplay=1&rel=0&modestbranding=1" title="HZT YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
        btn.replaceWith(wrap);
      });
    });
  }

  function renderVideos() {
    var videosEl = document.getElementById("media-videos");
    if (!videosEl || !global.HZT_MEDIA.videos) return;
    videosEl.classList.add("video-grid-embed");
    videosEl.innerHTML = global.HZT_MEDIA.videos
      .map(function (item) {
        if (item.type === "youtube" && item.id) {
          var watchUrl = item.url || "https://www.youtube.com/shorts/" + item.id;
          return (
            '<div class="video-card video-card-youtube is-visible" data-yt-id="' +
            item.id +
            '">' +
            '<button type="button" class="yt-poster" aria-label="Play YouTube video">' +
            '<img src="https://i.ytimg.com/vi/' +
            item.id +
            '/hqdefault.jpg" alt="HZT YouTube video" width="480" height="360" loading="lazy" />' +
            '<span class="yt-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>' +
            "</button>" +
            '<p class="video-card-label"><a href="' +
            watchUrl +
            '" target="_blank" rel="noopener">' +
            (item.label || "Open on YouTube Shorts") +
            "</a></p></div>"
          );
        }
        return (
          '<div class="video-card is-visible">' +
          '<video controls preload="metadata" playsinline poster="' +
          hztSrc(global.HZT_MEDIA.hero.poster) +
          '"><source src="' +
          hztSrc(item.src) +
          '" type="video/mp4" /></video>' +
          '<p class="video-card-label">' +
          (item.label || "") +
          "</p></div>"
        );
      })
      .join("");
    bindYoutubePosters(videosEl);
  }

  global.hztApplyMedia = function () {
    document.querySelectorAll("[data-hzt-src]").forEach(function (el) {
      bindImg(el, el.getAttribute("data-hzt-src"));
    });

    var heroSlides = document.querySelectorAll(".hero-swiper .hero-slide img.hero-media");
    if (global.HZT_MEDIA.hero.slides) {
      global.HZT_MEDIA.hero.slides.forEach(function (path, i) {
        if (heroSlides[i]) bindImg(heroSlides[i], path);
      });
    }

    var productMap = {
      "product-pump": "pump",
      "product-loader": "loader",
      "product-excavator": "excavator",
      "product-rig": "rig",
    };
    Object.keys(productMap).forEach(function (id) {
      var card = document.getElementById(id);
      if (!card) return;
      var img = card.querySelector("img");
      var key = productMap[id];
      if (img && global.HZT_MEDIA.products[key]) {
        bindImg(img, global.HZT_MEDIA.products[key]);
      }
    });

    var brandKeys = ["sany", "zoomlion", "liugong", "xcmg", "putzmeister"];
    document.querySelectorAll(".brand-item img").forEach(function (img, i) {
      var key = brandKeys[i];
      if (key && global.HZT_MEDIA.brands[key]) {
        bindImg(img, global.HZT_MEDIA.brands[key]);
      }
    });

    renderGallery();
    renderVideos();
  };

  function bootMedia() {
    global.hztApplyMedia();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMedia);
  } else {
    bootMedia();
  }
})(window);

