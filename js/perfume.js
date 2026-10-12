(function () {
  'use strict';

  var OBF_PRODUCT = 'https://world.openbeautyfacts.org/api/v2/product/';

  function show(html) {
    document.getElementById('detail').innerHTML = html;
  }

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
  }

  function loadProduct(code) {
    show('<p class="status-message">Loading perfume details...</p>');
    fetch(OBF_PRODUCT + encodeURIComponent(code) + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Product lookup failed');
        return res.json();
      })
      .then(function (data) {
        if (!data || data.status !== 1 || !data.product) {
          show('<p class="status-message">That perfume could not be found. <a href="finder.html">Try another search</a>.</p>');
          return;
        }
        var p = data.product;
        var name = p.product_name || p.generic_name || 'Unnamed perfume';
        var brand = p.brands || 'Unknown brand';
        var img = (p.image_front_small_url || p.image_url || 'images/placeholder.svg');
        var cats = p.categories || '';
        document.title = name + ' | Fragrance Finder';
        document.getElementById('page-title').textContent = name;
        show(
          '<article class="card p-3">' +
            '<div class="row g-4 align-items-start">' +
              '<div class="col-sm-4 col-md-3">' +
                '<img src="' + esc(img) + '" alt="" class="img-fluid" width="200" height="200">' +
              '</div>' +
              '<div class="col">' +
                '<p><strong>Brand:</strong> ' + esc(brand) + '</p>' +
                (cats ? '<p><strong>Categories:</strong> ' + esc(cats) + '</p>' : '') +
                '<p><a href="finder.html">Back to Finder</a></p>' +
              '</div>' +
            '</div>' +
          '</article>'
        );
      })
      .catch(function () {
        show('<p class="status-message">Could not reach Open Beauty Facts. Check your connection and try again.</p>');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var code = new URLSearchParams(window.location.search).get('code');
    if (code) loadProduct(code.trim());
  });
})();
