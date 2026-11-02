const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

Fancybox.bind("[data-fancybox='main-gallery']", {
  Carousel: { Transition: 'fade' },
  Images: { Panzoom: { maxScale: 3 } },
});

if (!reduceMotion && document.getElementById('typed-text')) {
  new Typed('#typed-text', {
    strings: ['Фінансова свобода.', 'Впевненість у завтрашньому дні.', 'Керування доходами.'],
    typeSpeed: 50,
    backSpeed: 30,
    loop: true,
  });
}