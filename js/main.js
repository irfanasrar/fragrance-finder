(function () {
  'use strict';

  function markActiveLink() {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar-nav .nav-link').forEach(function (link) {
      if (link.getAttribute('href') === page) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function setYear() {
    var year = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = year;
    });
  }

  function escClosesMenu() {
    var menu = document.getElementById('primary-nav');
    if (!menu || !window.bootstrap) return;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(menu).hide();
        var toggler = document.querySelector('[data-bs-target="#primary-nav"]');
        if (toggler) toggler.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    markActiveLink();
    setYear();
    escClosesMenu();
  });
})();
