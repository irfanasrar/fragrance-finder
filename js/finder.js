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
  var OBF_SEARCH = 'https://world.openbeautyfacts.org/cgi/search.pl';
  var OBF_FIELDS = 'code,product_name,brands,image_front_small_url,categories_tags,ingredients_text';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var PERFUME_CACHE_KEY = 'ff-perfumes';
  var PER_PAGE = 12;
  var OCCASIONS = {
    everyday: { label: 'everyday wear', families: ['fresh', 'citrus', 'floral'], strength: [1, 2] },
    office: { label: 'the office', families: ['fresh', 'citrus', 'woody'], strength: [1, 2] },
    date: { label: 'a date night', families: ['oriental', 'gourmand', 'spicy', 'floral'], strength: [2, 3] },
    evening: { label: 'an evening out', families: ['oriental', 'woody', 'spicy'], strength: [3] },
    special: { label: 'a special occasion', families: ['floral', 'oriental'], strength: [3] },
    sport: { label: 'sport and the gym', families: ['fresh', 'citrus'], strength: [1] },
    holiday: { label: 'holidays and travel', families: ['citrus', 'fresh', 'fruity'], strength: [1, 2] }
  };
  var STRENGTH_NAMES = { 1: 'a light', 2: 'a moderate', 3: 'a strong' };

  var form, nameInput, brandSelect, cityInput, familyList, summary, results, statusBox, pager, resultsTitle;
  var families = [];
  var matches = [];
  var currentPage = 1;
  var lastCriteria = null;

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
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ time: Date.now(), brands: brands }));
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

  function validate(c) {
    var errors = [];
    if (!c.name && !c.brand && !c.families.length) {
      errors.push({ field: nameInput, message: 'Enter a perfume name, choose a brand or tick at least one scent family.' });
    } else if (c.name && c.name.length < 2) {
      errors.push({ field: nameInput, message: 'Perfume name needs at least 2 characters.' });
    }
    if (c.city) {
      if (c.city.length < 2) {
        errors.push({ field: cityInput, message: 'City needs at least 2 characters.' });
      } else if (!/^[\p{L}][\p{L} '\-]*$/u.test(c.city)) {
        errors.push({ field: cityInput, message: 'City can only use letters, spaces, hyphens and apostrophes.' });
      }
    }
    return errors;
  }

  function clearErrors() {
    [nameInput, cityInput].forEach(function (input) {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      input.setCustomValidity('');
      document.getElementById(input.id + '-error').textContent = '';
    });
    summary.hidden = true;
    summary.querySelector('ul').innerHTML = '';
  }

  function showErrors(errors) {
    var list = summary.querySelector('ul');
    errors.forEach(function (err) {
      err.field.classList.add('is-invalid');
      err.field.setAttribute('aria-invalid', 'true');
      err.field.setCustomValidity(err.message);
      document.getElementById(err.field.id + '-error').textContent = err.message;

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + err.field.id;
      a.textContent = err.message;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        err.field.focus();
      });
      li.appendChild(a);
      list.appendChild(li);
    });
    summary.hidden = false;
    errors[0].field.focus();
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
    pager.hidden = true;
    statusBox.textContent = text;
  }

  function normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function hasWord(text, word) {
    var safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + safe + '\\b').test(text);
  }

  function readPerfumeCache() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(PERFUME_CACHE_KEY));
      if (!saved || Date.now() - saved.time > 30 * 60 * 1000) return null;
      return saved.items;
    } catch (e) {
      return null;
    }
  }

  function savePerfumeCache(items) {
    try {
      sessionStorage.setItem(PERFUME_CACHE_KEY, JSON.stringify({ time: Date.now(), items: items }));
    } catch (e) {}
  }

  function fetchPage(page, signal) {
    var params = new URLSearchParams({
      action: 'process',
      json: '1',
      tagtype_0: 'categories',
      tag_contains_0: 'contains',
      tag_0: 'perfumes',
      sort_by: 'last_modified_t',
      page_size: '100',
      page: String(page),
      fields: OBF_FIELDS
    });
    return fetch(OBF_SEARCH + '?' + params.toString(), { signal: signal }).then(function (res) {
      if (!res.ok) throw new Error('Open Beauty Facts error ' + res.status);
      return res.json();
    });
  }

  function tidyProduct(p) {
    var name = (p.product_name || '').replace(/\s+/g, ' ').trim();
    var brand = (p.brands || '').split(',')[0].trim();
    return {
      code: p.code,
      name: name,
      brand: brand,
      brands: p.brands || '',
      image: p.image_front_small_url || '',
      cats: (p.categories_tags || []).join(' ').toLowerCase(),
      ingredients: (p.ingredients_text || '').toLowerCase()
    };
  }

  function loadPerfumes() {
    var cached = readPerfumeCache();
    if (cached) return Promise.resolve(cached);

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);

    return fetchPage(1, controller.signal)
      .then(function (first) {
        var pages = Math.min(first.page_count || 1, 8);
        var rest = [];
        for (var i = 2; i <= pages; i++) rest.push(fetchPage(i, controller.signal));
        return Promise.all(rest).then(function (more) {
          return [first].concat(more);
        });
      })
      .then(function (pages) {
        var seen = {};
        var items = [];
        pages.forEach(function (page) {
          (page.products || []).forEach(function (p) {
            if (!p.code || seen[p.code]) return;
            seen[p.code] = true;
            items.push(tidyProduct(p));
          });
        });
        savePerfumeCache(items);
        return items;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function genderOf(p) {
    if (/unisex/.test(p.cats)) return 'unisex';
    if (/women|dames|femme/.test(p.cats)) return 'women';
    if (/\bmen|heren|male|hommes/.test(p.cats)) return 'men';
    return '';
  }

  function strengthOf(p) {
    var text = normalize(p.name + ' ' + p.cats);
    if (/cologne|body mist|body spray|bodymist|\bmist\b|eau fraiche/.test(text)) return { level: 1, type: 'a cologne or body mist' };
    if (/eau de toilette|\bedt\b/.test(text)) return { level: 2, type: 'an eau de toilette' };
    if (/extrait|eau de parfum|\bedp\b|\bparfum\b|intense/.test(text)) return { level: 3, type: 'an eau de parfum' };
    return null;
  }

  function familyHits(p) {
    var text = normalize(p.name) + ' ' + p.cats + ' ' + p.ingredients;
    var found = [];
    families.forEach(function (fam) {
      var words = (fam.notes || []).concat(fam.markers || []).filter(function (word) {
        return hasWord(text, word);
      });
      if (words.length) found.push({ id: fam.id, name: fam.name.toLowerCase(), words: words });
    });
    return found;
  }

  function brandMatches(p, wanted) {
    var want = ' ' + normalize(wanted) + ' ';
    return p.brands.split(',').some(function (b) {
      var have = normalize(b);
      if (!have) return false;
      return want.indexOf(' ' + have + ' ') > -1 || (' ' + have + ' ').indexOf(want) > -1;
    });
  }

  function nameMatches(p, query) {
    var text = normalize(p.name + ' ' + p.brands);
    return normalize(query).split(' ').every(function (word) {
      return text.indexOf(word) > -1;
    });
  }

  function joinWords(list) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }


  function weatherBucket(tempC) {
    if (tempC >= 22) return 'warm';
    if (tempC >= 14) return 'mild';
    if (tempC >= 6) return 'cool';
    return 'cold';
  }

  function weatherLabel(bucket, tempC, place) {
    var feel = { warm: 'warm', mild: 'mild', cool: 'cool', cold: 'cold' }[bucket] || 'mild';
    return Math.round(tempC) + '\u00b0C and ' + feel + ' in ' + place;
  }

  function fetchWeather(city, signal) {
    var geo = GEOCODE_URL + '?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json';
    return fetch(geo, { signal: signal })
      .then(function (res) {
        if (!res.ok) throw new Error('Geocoding failed');
        return res.json();
      })
      .then(function (data) {
        var hit = data && data.results && data.results[0];
        if (!hit) throw new Error('City not found');
        var url = FORECAST_URL +
          '?latitude=' + hit.latitude +
          '&longitude=' + hit.longitude +
          '&current=temperature_2m&timezone=auto';
        return fetch(url, { signal: signal }).then(function (res) {
          if (!res.ok) throw new Error('Forecast failed');
          return res.json();
        }).then(function (forecast) {
          var temp = forecast.current && forecast.current.temperature_2m;
          if (typeof temp !== 'number') throw new Error('No temperature');
          var bucket = weatherBucket(temp);
          var place = hit.name + (hit.country ? ', ' + hit.country : '');
          return {
            bucket: bucket,
            temp: temp,
            place: place,
            label: weatherLabel(bucket, temp, place)
          };
        });
      });
  }

  function scorePerfume(p, c) {
    if (c.name && !nameMatches(p, c.name)) return null;
    if (c.brand && !brandMatches(p, c.brand)) return null;

    var gender = genderOf(p);
    if (c.gender && gender && gender !== c.gender) return null;

    var hits = familyHits(p);
    var picked = hits.filter(function (h) { return c.families.indexOf(h.id) > -1; });
    if (c.families.length && !picked.length) return null;

    var score = p.image ? 1 : 0;
    var reasons = [];

    if (picked.length) {
      var clues = [];
      picked.forEach(function (h) {
        score += 2 + Math.min(h.words.length, 3);
      });
      for (var i = 0; i < 3; i++) {
        picked.forEach(function (h) {
          var w = h.words[i];
          if (w && clues.indexOf(w) === -1) clues.push(w);
        });
      }
      reasons.push('Its ingredients point to the ' + joinWords(picked.map(function (h) { return h.name; })) +
        ' notes you like (' + clues.slice(0, 3).join(', ') + ').');
    }

    var strength = strengthOf(p);
    var occasion = OCCASIONS[c.occasion];
    if (occasion) {
      var fits = hits.filter(function (h) { return occasion.families.indexOf(h.id) > -1; });
      var strongEnough = strength && occasion.strength.indexOf(strength.level) > -1;
      if (fits.length || strongEnough) {
        score += fits.length + (strongEnough ? 2 : 0);
        var what = fits.length ? 'Its ' + joinWords(fits.slice(0, 2).map(function (h) { return h.name; })) + ' side' : 'As ' + STRENGTH_NAMES[strength.level] + ' scent, it';
        reasons.push(what + ' suits ' + occasion.label + '.');
      }
    }

    if (strength) {
      var gap = Math.abs(strength.level - c.intensity);
      score += 2 - gap;
      if (gap === 0) reasons.push('As ' + strength.type + ', it has the ' + INTENSITY[c.intensity].toLowerCase() + ' strength you asked for.');
    }

    if (c.weather && c.weather.bucket) {
      var suited = hits.filter(function (h) {
        var fam = families.find(function (f) { return f.id === h.id; });
        return fam && fam.weather === c.weather.bucket;
      });
      if (suited.length) {
        score += 2 + suited.length;
        reasons.push('Its ' + joinWords(suited.slice(0, 2).map(function (h) { return h.name; })) +
          ' notes suit ' + c.weather.label + '.');
      }
    }

    if (c.brand) reasons.push('Made by ' + p.brand + ', the brand you picked.');
    if (c.name) reasons.push('Matches your search for "' + c.name + '".');
    if (c.gender && gender === c.gender) {
      score += 1;
      reasons.push(c.gender === 'unisex' ? 'Sold as a unisex fragrance.' : "Sold as a " + (c.gender === 'men' ? "men's" : "women's") + ' fragrance.');
    }

    if (!reasons.length) reasons.push('A perfume listed on Open Beauty Facts that fits your filters.');

    return { product: p, score: score, why: reasons.slice(0, 2).join(' '), families: picked.concat(hits.filter(function (h) { return picked.indexOf(h) === -1; })).slice(0, 3) };
  }

  function skeletonCards() {
    results.innerHTML = '';
    pager.hidden = true;
    var list = document.createElement('ul');
    list.className = 'card-grid';
    list.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 6; i++) {
      var li = document.createElement('li');
      li.className = 'card result-card';
      li.innerHTML = '<div class="skeleton skeleton-image"></div>' +
        '<div class="card-body">' +
        '<div class="skeleton skeleton-text w-75"></div>' +
        '<div class="skeleton skeleton-text w-50"></div>' +
        '<div class="skeleton skeleton-text"></div>' +
        '</div>';
      list.appendChild(li);
    }
    results.appendChild(list);
  }

  function makeCard(match) {
    var p = match.product;
    var name = p.name || 'Unnamed perfume';
    var brand = p.brand || 'Unknown brand';

    var li = document.createElement('li');
    var card = document.createElement('article');
    card.className = 'card result-card h-100';

    var img = document.createElement('img');
    img.width = 200;
    img.height = 200;
    img.loading = 'lazy';
    img.src = p.image || 'images/placeholder.svg';
    img.alt = p.image ? 'Bottle of ' + name : 'No photo available';
    img.addEventListener('error', function () {
      img.src = 'images/placeholder.svg';
      img.alt = 'No photo available';
    }, { once: true });

    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('h3');
    title.className = 'result-name';
    var link = document.createElement('a');
    link.className = 'stretched-link';
    link.href = 'perfume.html?code=' + encodeURIComponent(p.code) +
      (lastCriteria && lastCriteria.city ? '&city=' + encodeURIComponent(lastCriteria.city) : '');
    link.textContent = name;
    title.appendChild(link);

    var by = document.createElement('p');
    by.className = 'result-brand';
    by.textContent = brand;

    var why = document.createElement('p');
    why.className = 'result-why';
    var label = document.createElement('span');
    label.className = 'why-label';
    label.textContent = 'Why it suits you';
    why.appendChild(label);
    why.appendChild(document.createTextNode(match.why));

    body.appendChild(title);
    body.appendChild(by);
    body.appendChild(why);

    if (match.families.length) {
      var tags = document.createElement('p');
      tags.className = 'result-tags';
      match.families.forEach(function (h) {
        var tag = document.createElement('span');
        tag.className = 'family-tag';
        tag.setAttribute('data-family', h.id);
        tag.textContent = h.name;
        tags.appendChild(tag);
      });
      body.appendChild(tags);
    }

    card.appendChild(img);
    card.appendChild(body);
    li.appendChild(card);
    return li;
  }

  function pagerButton(text, page, disabled) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-dark';
    btn.textContent = text;
    btn.disabled = disabled;
    btn.addEventListener('click', function () {
      showPage(page);
      resultsTitle.focus();
    });
    return btn;
  }

  function showPage(page) {
    var pages = Math.ceil(matches.length / PER_PAGE);
    currentPage = Math.max(1, Math.min(page, pages));
    var start = (currentPage - 1) * PER_PAGE;
    var slice = matches.slice(start, start + PER_PAGE);

    results.innerHTML = '';
    var list = document.createElement('ul');
    list.className = 'card-grid';
    slice.forEach(function (m) { list.appendChild(makeCard(m)); });
    results.appendChild(list);

    var count = matches.length === 1 ? '1 perfume' : matches.length + ' perfumes';
    var text = 'Found ' + count + ' for ' + describe(lastCriteria) + '.';
    if (lastCriteria && lastCriteria.weather) text += ' Weather: ' + lastCriteria.weather.label + '.';
    if (pages > 1) text += ' Page ' + currentPage + ' of ' + pages + ', showing ' + (start + 1) + ' to ' + (start + slice.length) + '.';
    statusBox.textContent = text;

    pager.innerHTML = '';
    pager.hidden = pages < 2;
    if (pages > 1) {
      var info = document.createElement('span');
      info.className = 'pager-info';
      info.textContent = 'Page ' + currentPage + ' of ' + pages;
      pager.appendChild(pagerButton('Previous', currentPage - 1, currentPage === 1));
      pager.appendChild(info);
      pager.appendChild(pagerButton('Next', currentPage + 1, currentPage === pages));
    }
  }

  function showError() {
    results.innerHTML = '';
    pager.hidden = true;
    statusBox.textContent = "Couldn't load perfumes from Open Beauty Facts. Check your connection and try again.";
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-outline-dark';
    retry.textContent = 'Try again';
    retry.addEventListener('click', function () {
      searchPerfumes(lastCriteria);
    });
    results.appendChild(retry);
  }

  function searchPerfumes(criteria) {
    lastCriteria = criteria;
    skeletonCards();
    statusBox.textContent = 'Searching Open Beauty Facts for ' + describe(criteria) + '...';

    var weatherPromise = criteria.city
      ? fetchWeather(criteria.city).catch(function () { return null; })
      : Promise.resolve(null);

    Promise.all([loadPerfumes(), weatherPromise])
      .then(function (parts) {
        if (lastCriteria !== criteria) return;
        var items = parts[0];
        var weather = parts[1];
        if (weather) {
          criteria.weather = weather;
          statusBox.textContent = 'Using ' + weather.label + ' with Open Beauty Facts for ' + describe(criteria) + '...';
        } else if (criteria.city) {
          statusBox.textContent = "Couldn't read the weather for " + criteria.city + ', so matching without it.';
        }
        matches = items.map(function (p) { return scorePerfume(p, criteria); })
          .filter(Boolean)
          .sort(function (a, b) { return b.score - a.score; });
        if (!matches.length) {
          showMessage('No perfumes matched ' + describe(criteria) + '. Try fewer scent families, another brand or a different spelling.');
          return;
        }
        showPage(1);
      })
      .catch(function () {
        if (lastCriteria === criteria) showError();
      });
  }

  function runSearch() {
    clearErrors();
    var criteria = getCriteria();
    var errors = validate(criteria);
    if (errors.length) {
      showErrors(errors);
      return;
    }
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      if (value) params.append(key, value);
    });
    history.replaceState(null, '', '?' + params.toString());
    searchPerfumes(criteria);
  }

  function onSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  function prefillFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) nameInput.value = q.trim().slice(0, 80);
    if (params.get('city')) cityInput.value = params.get('city').trim().slice(0, 60);
    if (params.get('occasion')) document.getElementById('occasion').value = params.get('occasion');
    if (params.get('intensity')) {
      document.getElementById('intensity').value = params.get('intensity');
      updateIntensity();
    }
    var gender = form.querySelector('input[name="gender"][value="' + (params.get('gender') || '') + '"]');
    if (gender) gender.checked = true;
    return !!(q || params.get('brand') || params.get('family'));
  }

  function tickFamiliesFromUrl() {
    new URLSearchParams(window.location.search).getAll('family').forEach(function (id) {
      var box = document.getElementById('family-' + id);
      if (box) box.checked = true;
    });
  }

  function init() {
    form = document.getElementById('finder-form');
    nameInput = document.getElementById('name');
    brandSelect = document.getElementById('brand');
    cityInput = document.getElementById('city');
    familyList = document.getElementById('family-list');
    summary = document.getElementById('error-summary');
    results = document.getElementById('results');
    statusBox = document.getElementById('results-status');
    pager = document.getElementById('pager');
    resultsTitle = document.getElementById('results-title');

    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', function () {
      clearErrors();
      setTimeout(updateIntensity, 0);
      lastCriteria = null;
      history.replaceState(null, '', window.location.pathname);
      showMessage('Your matches will show up here.');
    });
    document.getElementById('intensity').addEventListener('input', updateIntensity);
    [nameInput, cityInput].forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.classList.contains('is-invalid')) {
          input.classList.remove('is-invalid');
          input.removeAttribute('aria-invalid');
          input.setCustomValidity('');
        }
      });
    });

    var hasQuery = prefillFromUrl();
    var brandsReady = loadBrands();
    var waits = [loadFamilies()];
    if (new URLSearchParams(window.location.search).get('brand')) waits.push(brandsReady);
    Promise.all(waits).then(function () {
      tickFamiliesFromUrl();
      if (hasQuery) runSearch();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
