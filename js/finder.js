(function () {
  'use strict';

  var SPARQL_URL = 'https://query.wikidata.org/sparql';
  var BRAND_QUERY = [
    'SELECT DISTINCT ?brand ?brandLabel WHERE {',
    '  { ?brand wdt:P31 wd:Q137183855 } UNION { ?brand wdt:P1056 wd:Q131746 } UNION { ?brand wdt:P452 wd:Q131746 }',
    '  FILTER NOT EXISTS { ?brand wdt:P31 wd:Q5 }',
    '  FILTER NOT EXISTS { ?brand wdt:P279 [] }',
    '  ?brand rdfs:label ?brandLabel . FILTER(LANG(?brandLabel) = "en")',
    '}'
  ].join('\n');
  var BRAND_CACHE_KEY = 'ff-brands';
  var BRAND_CACHE_DAYS = 7;
  var FALLBACK_BRANDS = [
    'Acqua di Parma', 'Armani', 'Burberry', 'Byredo', 'Calvin Klein', 'Carolina Herrera', 'Chanel',
    'Chloé', 'Christian Dior', 'Creed', 'Diptyque', 'Dolce & Gabbana', 'Estée Lauder', 'Gucci',
    'Guerlain', 'Hermès', 'Hugo Boss', 'Jean Paul Gaultier', 'Jo Malone London', 'Lancôme',
    'Le Labo', 'Maison Francis Kurkdjian', 'Marc Jacobs', 'Mugler', 'Paco Rabanne', 'Prada',
    'Tom Ford', 'Valentino', 'Versace', 'Yves Saint Laurent'
  ];
  var INTENSITY = { 1: 'Light', 2: 'Moderate', 3: 'Strong' };

  var form, brandSelect, familyList, results;
  var families = [];

  function sortNames(list) {
    var seen = {};
    return list.filter(function (name) {
      var key = name.toLowerCase();
      if (!name || seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) {
      return a.localeCompare(b, 'en', { sensitivity: 'base' });
    });
  }

  function fillBrands(list, note) {
    brandSelect.innerHTML = '';
    var any = document.createElement('option');
    any.value = '';
    any.textContent = 'Any brand';
    brandSelect.appendChild(any);
    list.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      brandSelect.appendChild(opt);
    });
    brandSelect.disabled = false;
    if (note) document.getElementById('brand-help').textContent = note;
    var wanted = new URLSearchParams(window.location.search).get('brand');
    if (wanted) brandSelect.value = wanted;
  }

  function readBrandCache() {
    try {
      var saved = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY));
      if (!saved || !Array.isArray(saved.brands)) return null;
      var age = Date.now() - saved.time;
      if (age > BRAND_CACHE_DAYS * 24 * 60 * 60 * 1000) return null;
      return saved.brands;
    } catch (e) {
      return null;
    }
  }

  function saveBrandCache(brands) {
    try {
      localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ time: Date.now(), brands: brands }));
    } catch (e) {}
  }

  function loadBrands() {
    brandSelect.disabled = true;
    var cached = readBrandCache();
    if (cached) {
      fillBrands(cached);
      return Promise.resolve(cached);
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);
    var url = SPARQL_URL + '?format=json&query=' + encodeURIComponent(BRAND_QUERY);

    return fetch(url, { headers: { Accept: 'application/sparql-results+json' }, signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('Wikidata error ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var brands = sortNames(data.results.bindings.map(function (row) {
          return row.brandLabel.value.trim();
        }));
        if (!brands.length) throw new Error('No brands');
        saveBrandCache(brands);
        fillBrands(brands);
        return brands;
      })
      .catch(function () {
        fillBrands(FALLBACK_BRANDS, "Couldn't reach Wikidata, so this is a shorter built-in list.");
        return FALLBACK_BRANDS;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

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
    brandSelect = document.getElementById('brand');
    familyList = document.getElementById('family-list');
    results = document.getElementById('results');

    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', function () {
      setTimeout(updateIntensity, 0);
      showMessage('Your matches will show up here.');
    });
    document.getElementById('intensity').addEventListener('input', updateIntensity);
    loadBrands();
    loadFamilies();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
