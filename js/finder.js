(function () {
  'use strict';

  var INTENSITY = { 1: 'Light', 2: 'Moderate', 3: 'Strong' };

  var form, familyList, results;
  var families = [];

  function renderFamilies(list) {
    familyList.innerHTML = '';
    list.forEach(function (fam) {
      var wrap = document.createElement('div');
      wrap.className = 'form-check family-option';

      var box = document.createElement('input');
      box.className = 'form-check-input';
      box.type = 'checkbox';
      box.name = 'family';
      box.id = 'family-' + fam.id;
      box.value = fam.id;

      var label = document.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = box.id;

      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('data-family', fam.id);
      swatch.setAttribute('aria-hidden', 'true');

      var name = document.createElement('span');
      name.className = 'family-name';
      name.textContent = fam.name;

      var desc = document.createElement('span');
      desc.className = 'family-desc';
      desc.textContent = fam.description;

      label.appendChild(swatch);
      label.appendChild(name);
      label.appendChild(desc);
      wrap.appendChild(box);
      wrap.appendChild(label);
      familyList.appendChild(wrap);
    });
  }

  function loadFamilies() {
    return fetch('data/scent-families.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load families');
        return res.json();
      })
      .then(function (data) {
        families = data.families || [];
        renderFamilies(families);
        return families;
      })
      .catch(function () {
        familyList.innerHTML = '<p class="form-text">Scent families could not be loaded. You can still search by name or brand.</p>';
        return [];
      });
  }

  function updateIntensity() {
    var range = document.getElementById('intensity');
    var text = INTENSITY[range.value];
    document.getElementById('intensity-value').textContent = text;
    range.setAttribute('aria-valuetext', text);
  }

  function getCriteria() {
    var data = new FormData(form);
    return {
      name: (data.get('q') || '').trim(),
      brand: data.get('brand') || '',
      families: data.getAll('family'),
      gender: data.get('gender') || '',
      occasion: data.get('occasion') || '',
      intensity: Number(data.get('intensity')),
      city: (data.get('city') || '').trim()
    };
  }

  function describe(c) {
    var parts = [];
    if (c.name) parts.push('"' + c.name + '"');
    if (c.brand) parts.push(c.brand);
    if (c.families.length) {
      parts.push(c.families.map(function (id) {
        var fam = families.find(function (f) { return f.id === id; });
        return fam ? fam.name.toLowerCase() : id;
      }).join(', ') + ' scents');
    }
    return parts.join(', ');
  }

  function showMessage(text) {
    results.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'status-message';
    p.textContent = text;
    results.appendChild(p);
  }

  function searchPerfumes(criteria) {
    showMessage('Searching for ' + describe(criteria) + '...');
  }

  function runSearch() {
    searchPerfumes(getCriteria());
  }

  function onSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  function init() {
    form = document.getElementById('finder-form');
    if (!form) return;
    familyList = document.getElementById('family-list');
    results = document.getElementById('results');

    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', function () {
      setTimeout(updateIntensity, 0);
      showMessage('Your matches will show up here.');
    });
    document.getElementById('intensity').addEventListener('input', updateIntensity);
    loadFamilies();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
