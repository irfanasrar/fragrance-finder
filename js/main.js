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

  function searchMessage(input) {
    var value = input.value.trim();
    if (value === '') return 'Please enter a perfume name or brand to search.';
    if (value.length < 2) return 'Please enter at least 2 characters.';
    if (value.length > 80) return 'Please keep it under 80 characters.';
    return '';
  }

  function quickSearch() {
    var form = document.querySelector('.search-form');
    if (!form) return;
    var input = form.querySelector('input[name="q"]');
    var feedback = document.getElementById('quick-q-error');

    function check() {
      var msg = searchMessage(input);
      feedback.textContent = msg;
      input.setCustomValidity(msg);
      input.classList.toggle('is-invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    form.addEventListener('submit', function (e) {
      input.value = input.value.trim();
      if (!check()) {
        e.preventDefault();
        input.focus();
      }
    });

    input.addEventListener('input', function () {
      if (input.classList.contains('is-invalid')) check();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    markActiveLink();
    setYear();
    escClosesMenu();
    quickSearch();
  });
})();
