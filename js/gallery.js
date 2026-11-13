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
    if (entries.some(e => e.isIntersecting)) { obs.disconnect(); init(); }
  }, { rootMargin });
  io.observe(el);
}

// 1. Swiper: лише коли слайдер наближається до в'юпорту
whenVisible(document.querySelector('.testimonials-swiper'), () => {
  new Swiper('.testimonials-swiper', {
    rewind: true,
    spaceBetween: 20,
    autoplay: reduceMotion ? false : { delay: 5000, disableOnInteraction: true, pauseOnMouseEnter: true },
    navigation: { nextEl: '.swiper-button-next-custom', prevEl: '.swiper-button-prev-custom' },
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
  Fancybox.bind("[data-fancybox='main-gallery']", {
    Carousel: { Transition: 'fade' },
    Images: { Panzoom: { maxScale: 3 } },
  });
});

// 3. Typed: працює лише поки елемент видно
const typedEl = document.getElementById('typed-text');
if (!reduceMotion && typedEl && 'IntersectionObserver' in window) {
  let typed;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      typed ??= new Typed('#typed-text', {
        strings: ['Фінансова свобода.', 'Впевненість у завтрашньому дні.', 'Керування доходами.'],
        typeSpeed: 50,
        backSpeed: 30,
        loop: true,
      });
      typed.start();
    } else {
      typed?.stop();
    }
  }).observe(typedEl);
}