const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SWIPER = 'https://cdn.jsdelivr.net/npm/swiper@11.1.14/swiper-bundle.min';
const FANCY = 'https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0.36/dist/fancybox/fancybox';

/* ---------- Завантажувачі (кожен URL вантажиться один раз) ---------- */
const loaded = new Map();

function loadCSS(href) {
  if (!loaded.has(href)) {
    loaded.set(href, new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    }));
  }
  return loaded.get(href);
}

function loadJS(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    }));
  }
  return loaded.get(src);
}

/* Спостерігаємо за <section>, а не за вмістом: секції нижче екрана мають
   content-visibility: auto, і їхній вміст не має розмірів, поки секція далеко. */
function whenVisible(el, init, rootMargin = '400px') {
  if (!el) return;
  if (!('IntersectionObserver' in window)) return init();
  const io = new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      obs.disconnect();
      init();
    }
  }, { rootMargin });
  io.observe(el);
}

/* ---------- 1. Swiper: вантажимо, коли наближається секція відгуків ---------- */
whenVisible(document.getElementById('reviews'), async () => {
  if (!document.querySelector('.testimonials-swiper')) return;
  try {
    await Promise.all([loadCSS(`${SWIPER}.css`), loadJS(`${SWIPER}.js`)]);
  } catch {
    return; // без бібліотеки слайди залишаються в рядку (див. критичний CSS)
  }
  new Swiper('.testimonials-swiper', {
    rewind: true,
    spaceBetween: 20,
    autoplay: reduceMotion
      ? false
      : { delay: 5000, disableOnInteraction: true, pauseOnMouseEnter: true },
    navigation: {
      nextEl: '.swiper-button-next-custom',
      prevEl: '.swiper-button-prev-custom',
    },
    pagination: { el: '.swiper-pagination-custom', clickable: true },
    a11y: {
      prevSlideMessage: 'Попередній відгук',
      nextSlideMessage: 'Наступний відгук',
      paginationBulletMessage: 'Перейти до відгуку {{index}}',
    },
    breakpoints: {
      640: { slidesPerView: 1.6, spaceBetween: 24 },
      1024: { slidesPerView: 2, spaceBetween: 28 },
    },
  });
});

/* ---------- 2. Fancybox: вантажимо, коли наближається галерея ---------- */
whenVisible(document.getElementById('gallery'), async () => {
  try {
    await Promise.all([loadCSS(`${FANCY}.css`), loadJS(`${FANCY}.umd.js`)]);
  } catch {
    return; // посилання просто відкриють зображення напряму
  }
  Fancybox.bind("[data-fancybox='main-gallery']", {
    Carousel: { Transition: 'fade' },
    Images: { Panzoom: { maxScale: 3 } },
  });
});

/* ---------- 3. Typed: працює лише поки елемент видно ---------- */
const typedEl = document.getElementById('typed-text');
if (typedEl) {
  if (reduceMotion || !('IntersectionObserver' in window) || typeof Typed === 'undefined') {
    typedEl.textContent = 'Фінансова свобода.';
  } else {
    let typed;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (typed) {
          typed.start();
        } else {
          typed = new Typed('#typed-text', {
            strings: [
              'Фінансова свобода.',
              'Впевненість у завтрашньому дні.',
              'Керування доходами.',
            ],
            typeSpeed: 50,
            backSpeed: 30,
            loop: true,
          });
        }
      } else {
        typed?.stop();
      }
    }).observe(typedEl);
  }
}

/* ---------- 4. Відео й карта: iframe створюється лише після кліку ---------- */
document.querySelectorAll('[data-embed]').forEach((box) => {
  const btn = box.querySelector('[data-embed-load]');
  const tpl = box.querySelector('template');
  if (!btn || !tpl) return;
  btn.addEventListener('click', () => {
    const iframe = tpl.content.firstElementChild.cloneNode(true);
    box.replaceChildren(iframe);
    iframe.focus();
  }, { once: true });
});