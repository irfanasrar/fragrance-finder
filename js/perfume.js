(function () {
  'use strict';

  var OBF_PRODUCT = 'https://world.openbeautyfacts.org/api/v2/product/';
  var OBF_FIELDS = 'code,product_name,generic_name,brands,quantity,image_front_url,image_url,ingredients_text,categories_tags';
  var GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var ALLERGENS = [
    'Alpha-isomethyl ionone', 'Amyl cinnamal', 'Amylcinnamyl alcohol', 'Anise alcohol', 'Benzyl alcohol',
    'Benzyl benzoate', 'Benzyl cinnamate', 'Benzyl salicylate', 'Butylphenyl methylpropional', 'Cinnamal',
    'Cinnamyl alcohol', 'Citral', 'Citronellol', 'Coumarin', 'Eugenol', 'Evernia furfuracea', 'Evernia prunastri',
    'Farnesol', 'Geraniol', 'Hexyl cinnamal', 'Hydroxycitronellal', 'Hydroxyisohexyl 3-cyclohexene carboxaldehyde',
    'Isoeugenol', 'Limonene', 'Linalool', 'Methyl 2-octynoate'
  ];
  var WEATHER_WORDS = { warm: 'warm days', mild: 'mild days', cool: 'cool days', cold: 'cold days' };

  var statusBox, detail, weatherBox, weatherForm, cityInput, weatherNote;
  var families = [];
  var found = [];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function hasWord(text, word) {
    return (' ' + text + ' ').indexOf(' ' + normalize(word) + ' ') > -1;
  }

  function joinWords(list) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  function splitIngredients(text) {
    return (text || '').replace(/\.\s*$/, '').split(/[,;](?![^(]*\))/).map(function (part) {
      return part.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  function allergenIn(item) {
    var text = normalize(item);
    var best = '';
    ALLERGENS.forEach(function (name) {
      if (hasWord(text, name) && name.length > best.length) best = name;
    });
    return best;
  }

  function familyHits(p, ingredients) {
    var text = normalize(p.product_name) + ' ' + (p.categories_tags || []).join(' ') + ' ' + normalize(ingredients);
    return families.filter(function (fam) {
      return (fam.notes || []).concat(fam.markers || []).some(function (word) {
        return hasWord(text, word);
      });
    });
  }

  function showImage(p, name) {
    var img = el('img', 'detail-image');
    img.width = 400;
    img.height = 400;
    img.src = p.image_front_url || p.image_url || 'images/placeholder.svg';
    img.alt = (p.image_front_url || p.image_url) ? 'Bottle of ' + name : 'No photo available';
    img.addEventListener('error', function () {
      img.src = 'images/placeholder.svg';
      img.alt = 'No photo available';
    }, { once: true });
    return img;
  }

  function ingredientBlock(items) {
    var block = el('section', 'detail-block');
    block.setAttribute('aria-labelledby', 'ingredients-title');
    var title = el('h2', '', 'Ingredients');
    title.id = 'ingredients-title';
    block.appendChild(title);

    if (!items.length) {
      block.appendChild(el('p', 'status-message', 'No ingredient list on Open Beauty Facts yet.'));
      return block;
    }

    var list = el('ul', 'ingredient-list');
    items.forEach(function (item) {
      var li = el('li', '', item);
      if (allergenIn(item)) {
        li.setAttribute('data-allergen', 'true');
        li.appendChild(el('span', 'visually-hidden', ' (fragrance allergen)'));
      }
      list.appendChild(li);
    });
    block.appendChild(list);
    return block;
  }

  function allergenBlock(items) {
    var block = el('section', 'detail-block');
    block.setAttribute('aria-labelledby', 'allergens-title');
    var title = el('h2', '', 'Fragrance allergens');
    title.id = 'allergens-title';
    block.appendChild(title);

    var hits = [];
    items.forEach(function (item) {
      var name = allergenIn(item);
      if (name && hits.indexOf(name) === -1) hits.push(name);
    });

    if (!items.length) {
      block.appendChild(el('p', 'status-message', "Can't check for allergens without an ingredient list."));
      return block;
    }
    if (!hits.length) {
      block.appendChild(el('p', '', 'None of the 26 EU-listed fragrance allergens were found in the ingredients.'));
    } else {
      block.appendChild(el('p', '', 'We found ' + (hits.length === 1 ? '1' : hits.length) + ' of the 26 fragrance allergens that EU labels have to list:'));
      var list = el('ul', 'allergen-list');
      hits.forEach(function (name) { list.appendChild(el('li', '', name)); });
      block.appendChild(list);
    }
    block.appendChild(el('p', 'form-text', 'This is matched from the ingredient list on Open Beauty Facts, so always check the box if you have a skin allergy.'));
    return block;
  }

  function familyBlock() {
    var block = el('section', 'detail-block');
    block.setAttribute('aria-labelledby', 'family-title');
    var title = el('h2', '', 'Scent families');
    title.id = 'family-title';
    block.appendChild(title);
    if (!found.length) {
      block.appendChild(el('p', 'status-message', "We couldn't spot a scent family in its ingredients."));
      return block;
    }
    var list = el('ul', 'family-detail-list');
    found.forEach(function (fam) {
      var li = el('li');
      var tag = el('span', 'family-tag', fam.name);
      tag.setAttribute('data-family', fam.id);
      li.appendChild(tag);
      li.appendChild(el('span', 'family-desc', fam.description + ' Best on ' + WEATHER_WORDS[fam.weather] + '.'));
      list.appendChild(li);
    });
    block.appendChild(list);
    return block;
  }

  function render(p) {
    var name = (p.product_name || p.generic_name || 'Unnamed perfume').replace(/\s+/g, ' ').trim();
    var brand = (p.brands || '').split(',')[0].trim() || 'Unknown brand';
    var items = splitIngredients(p.ingredients_text);
    found = familyHits(p, p.ingredients_text);

    document.title = name + ' | Fragrance Finder';
    document.getElementById('page-title').textContent = name;
    document.getElementById('page-brand').textContent = brand + (p.quantity ? ' \u00b7 ' + p.quantity : '');

    var layout = el('div', 'detail-layout');
    var media = el('div', 'detail-media');
    media.appendChild(showImage(p, name));
    var source = el('p', 'form-text', 'Barcode ' + p.code + ' on ');
    var link = el('a', '', 'Open Beauty Facts');
    link.href = 'https://world.openbeautyfacts.org/product/' + encodeURIComponent(p.code);
    source.appendChild(link);
    media.appendChild(source);

    var info = el('div', 'detail-info');
    info.appendChild(familyBlock());
    info.appendChild(allergenBlock(items));
    info.appendChild(ingredientBlock(items));

    layout.appendChild(media);
    layout.appendChild(info);
    detail.innerHTML = '';
    detail.appendChild(layout);
    info.insertBefore(weatherBox, info.children[1]);
    weatherBox.hidden = false;
    statusBox.textContent = 'Showing details for ' + name + ' by ' + brand + '.';
  }

  function weatherBucket(tempC) {
    if (tempC >= 22) return 'warm';
    if (tempC >= 14) return 'mild';
    if (tempC >= 6) return 'cool';
    return 'cold';
  }

  function fetchWeather(city) {
    var geo = GEOCODE_URL + '?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json';
    return fetch(geo)
      .then(function (res) {
        if (!res.ok) throw new Error('Geocoding failed');
        return res.json();
      })
      .then(function (data) {
        var hit = data && data.results && data.results[0];
        if (!hit) throw new Error('not-found');
        var url = FORECAST_URL + '?latitude=' + hit.latitude + '&longitude=' + hit.longitude +
          '&current=temperature_2m&timezone=auto';
        return fetch(url).then(function (res) {
          if (!res.ok) throw new Error('Forecast failed');
          return res.json();
        }).then(function (forecast) {
          var temp = forecast.current && forecast.current.temperature_2m;
          if (typeof temp !== 'number') throw new Error('No temperature');
          return { temp: temp, bucket: weatherBucket(temp), place: hit.name + (hit.country ? ', ' + hit.country : '') };
        });
      });
  }

  function weatherText(w) {
    var now = 'It\u2019s ' + Math.round(w.temp) + '\u00b0C and ' + w.bucket + ' in ' + w.place + ' right now.';
    if (!found.length) return now + " We couldn't tell this perfume's scent family, so there's no weather tip for it.";
    var good = found.filter(function (f) { return f.weather === w.bucket; });
    if (good.length) {
      return now + ' Good fit: its ' + joinWords(good.map(function (f) { return f.name.toLowerCase(); })) +
        ' notes are made for ' + WEATHER_WORDS[w.bucket] + '.';
    }
    var best = found.map(function (f) { return WEATHER_WORDS[f.weather]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return now + ' Not the best match today: its ' + joinWords(found.map(function (f) { return f.name.toLowerCase(); })) +
      ' notes shine more on ' + joinWords(best) + '.';
  }

  function checkWeather(city) {
    weatherNote.textContent = 'Checking the weather in ' + city + '...';
    fetchWeather(city)
      .then(function (w) {
        weatherNote.textContent = weatherText(w);
      })
      .catch(function (err) {
        weatherNote.textContent = err.message === 'not-found'
          ? "We couldn't find a city called " + city + '. Check the spelling and try again.'
          : "Couldn't reach Open-Meteo for the weather. Try again in a moment.";
      });
  }

  function onWeatherSubmit(e) {
    e.preventDefault();
    var city = cityInput.value.trim();
    var error = document.getElementById('weather-city-error');
    var msg = '';
    if (city.length < 2) msg = 'Enter a city with at least 2 characters.';
    else if (!/^[\p{L}][\p{L} '\-]*$/u.test(city)) msg = 'City can only use letters, spaces, hyphens and apostrophes.';
    cityInput.setCustomValidity(msg);
    cityInput.classList.toggle('is-invalid', !!msg);
    cityInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
    error.textContent = msg;
    if (msg) {
      cityInput.focus();
      return;
    }
    checkWeather(city);
  }

  function showError(code) {
    detail.innerHTML = '';
    statusBox.textContent = "Couldn't load this perfume from Open Beauty Facts. Check your connection and try again.";
    var retry = el('button', 'btn btn-outline-dark', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', function () { loadProduct(code); });
    detail.appendChild(retry);
  }

  function loadProduct(code) {
    statusBox.textContent = 'Loading perfume details...';
    detail.innerHTML = '<div class="detail-layout" aria-hidden="true"><div class="skeleton skeleton-image"></div>' +
      '<div><div class="skeleton skeleton-text w-75"></div><div class="skeleton skeleton-text w-50"></div>' +
      '<div class="skeleton skeleton-text"></div></div></div>';

    var loadFamilies = fetch('data/scent-families.json')
      .then(function (res) { return res.ok ? res.json() : { families: [] }; })
      .then(function (data) { families = data.families || []; })
      .catch(function () { families = []; });

    var loadPerfume = fetch(OBF_PRODUCT + encodeURIComponent(code) + '.json?fields=' + OBF_FIELDS)
      .then(function (res) {
        if (res.status === 404) return { status: 0 };
        if (!res.ok) throw new Error('Product lookup failed');
        return res.json();
      });

    Promise.all([loadPerfume, loadFamilies])
      .then(function (parts) {
        var data = parts[0];
        if (!data || data.status !== 1 || !data.product) {
          detail.innerHTML = '';
          statusBox.innerHTML = 'That perfume could not be found. <a href="finder.html">Try another search</a>.';
          return;
        }
        data.product.code = data.product.code || code;
        render(data.product);
        var city = cityInput.value.trim();
        if (city) checkWeather(city);
      })
      .catch(function () {
        showError(code);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    statusBox = document.getElementById('detail-status');
    detail = document.getElementById('detail');
    weatherBox = document.getElementById('weather-fit');
    weatherForm = document.getElementById('weather-form');
    cityInput = document.getElementById('weather-city');
    weatherNote = document.getElementById('weather-note');
    weatherForm.addEventListener('submit', onWeatherSubmit);

    if (document.referrer.indexOf('finder.html') > -1) {
      document.getElementById('back-link').href = document.referrer;
      document.getElementById('back-link').textContent = '\u2190 Back to results';
    }

    var params = new URLSearchParams(window.location.search);
    var city = (params.get('city') || '').trim().slice(0, 60);
    if (city) cityInput.value = city;
    var code = (params.get('code') || '').trim();
    if (code) loadProduct(code);
  });
})();
