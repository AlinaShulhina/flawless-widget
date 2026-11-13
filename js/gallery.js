
const reduceMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const SWIPER =
  'https://cdn.jsdelivr.net/npm/swiper@11.1.14/swiper-bundle.min';

const FANCY =
  'https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0.36/dist/fancybox/fancybox';

/* ---------- Завантажувачі з кешуванням ---------- */

const loaded = new Map();

function loadResource(url, type) {
  if (loaded.has(url)) {
    return loaded.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const el = document.createElement(type === 'css' ? 'link' : 'script');

    if (type === 'css') {
      el.rel = 'stylesheet';
      el.href = url;
    } else {
      el.src = url;
      el.async = true;
    }

    el.onload = resolve;

    el.onerror = () => {
      el.remove();
      loaded.delete(url);
      reject(new Error(`Failed to load: ${url}`));
    };

    document.head.append(el);
  });

  loaded.set(url, promise);

  return promise;
}

const loadCSS = (url) => loadResource(url, 'css');
const loadJS = (url) => loadResource(url, 'js');

/* ---------- Спостереження за секціями ---------- */

function whenVisible(el, init, rootMargin = '400px') {
  if (!el) return;

  if (!('IntersectionObserver' in window)) {
    init();
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      obs.disconnect();
      init();
    }
  }, { rootMargin });

  io.observe(el);
}

/* ---------- 1. Swiper: відгуки ---------- */

whenVisible(
  document.getElementById('reviews'),
  async () => {
    if (!document.querySelector('.testimonials-swiper')) return;

    try {
      await Promise.all([
        loadCSS(`${SWIPER}.css`),
        loadJS(`${SWIPER}.js`)
      ]);

      if (typeof Swiper === 'undefined') return;

      new Swiper('.testimonials-swiper', {
        rewind: true,
        spaceBetween: 20,

        autoplay: reduceMotion
          ? false
          : {
              delay: 5000,
              disableOnInteraction: true,
              pauseOnMouseEnter: true
            },

        navigation: {
          nextEl: '.swiper-button-next-custom',
          prevEl: '.swiper-button-prev-custom'
        },

        pagination: {
          el: '.swiper-pagination-custom',
          clickable: true
        },

        a11y: {
          prevSlideMessage: 'Попередній відгук',
          nextSlideMessage: 'Наступний відгук',
          paginationBulletMessage:
            'Перейти до відгуку {{index}}'
        },

        breakpoints: {
          640: {
            slidesPerView: 1.6,
            spaceBetween: 24
          },

          1024: {
            slidesPerView: 2,
            spaceBetween: 28
          }
        }
      });

    } catch (error) {
      console.warn('Swiper loading failed:', error);
    }
  }
);

/* ---------- 2. Fancybox: галерея ---------- */

whenVisible(
  document.getElementById('gallery'),
  async () => {
    if (!document.querySelector("[data-fancybox='main-gallery']")) {
      return;
    }

    try {
      await Promise.all([
        loadCSS(`${FANCY}.css`),
        loadJS(`${FANCY}.umd.js`)
      ]);

      if (typeof Fancybox === 'undefined') return;

      Fancybox.bind("[data-fancybox='main-gallery']", {
        Carousel: {
          Transition: 'fade'
        },

        Images: {
          Panzoom: {
            maxScale: 3
          }
        }
      });

    } catch (error) {
      console.warn('Fancybox loading failed:', error);
    }
  }
);

/* ---------- 3. Typed.js: анімація тексту ---------- */

const typedEl = document.getElementById('typed-text');

if (typedEl) {
  if (
    reduceMotion ||
    !('IntersectionObserver' in window) ||
    typeof Typed === 'undefined'
  ) {
    typedEl.textContent = 'Фінансова свобода.';

  } else {
    let typed;

    const typedObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (typed) {
          typed.start();

        } else {
          typed = new Typed('#typed-text', {
            strings: [
              'Фінансова свобода.',
              'Впевненість у завтрашньому дні.',
              'Керування доходами.'
            ],

            typeSpeed: 50,
            backSpeed: 30,
            loop: true
          });
        }

      } else {
        typed?.stop();
      }
    });

    typedObserver.observe(typedEl);
  }
}

/* ---------- 4. Відео та карта: завантаження після кліку ---------- */

document.querySelectorAll('[data-embed]').forEach((box) => {
  const btn = box.querySelector('[data-embed-load]');
  const tpl = box.querySelector('template');

  if (!btn || !tpl) return;

  btn.addEventListener('click', () => {
    const iframe = tpl.content.firstElementChild?.cloneNode(true);

    if (!iframe) return;

    box.replaceChildren(iframe);

    iframe.focus();

  }, { once: true });
});
