const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduceMotion = mqReduce.matches;

const idle = (fn) =>
  'requestIdleCallback' in window
    ? requestIdleCallback(fn, { timeout: 2000 })
    : setTimeout(fn, 1);

function whenVisible(el, init, rootMargin = '200px') {
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

// 1. Swiper: лише коли слайдер наближається до в'юпорту
whenVisible(document.querySelector('.testimonials-swiper'), () => {
  if (typeof Swiper === 'undefined') return;
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

// 2. Fancybox: у вільний час (делегований bind, дешевий)
idle(() => {
  if (typeof Fancybox === 'undefined') return;
  Fancybox.bind("[data-fancybox='main-gallery']", {
    Carousel: { Transition: 'fade' },
    Images: { Panzoom: { maxScale: 3 } },
  });
});

// 3. Typed: працює лише поки елемент видно.
//    new Typed() стартує сам, start() потрібен тільки для відновлення після stop().
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

// 4. Відео й карта: iframe створюється лише після кліку (без сторонніх cookie на старті)
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