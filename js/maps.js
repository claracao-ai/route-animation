// maps.js — Mapbox GL JS route planning
// Depends on: config.js (must load first, provides APP_CONFIG.mapboxToken)

(function () {
  var map = null;
  var animMarker = null;
  var animFrameId = null;
  var ROUTE_SOURCE = 'route';

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Plan a route and render it on the map.
   * @param {string|[number,number]} origin      - Address string or [lng, lat]
   * @param {string|[number,number]} destination - Address string or [lng, lat]
   * @param {object} [options]
   * @param {function} [options.onSuccess]  - Called with {distance, duration} (meters/seconds)
   * @param {function} [options.onError]    - Called with error string
   */
  function planRoute(origin, destination, options) {
    options = options || {};

    Promise.all([_resolve(origin), _resolve(destination)])
      .then(function (coords) {
        if (!coords[0] || !coords[1]) {
          console.error('maps.js: Could not geocode one or both addresses');
          if (options.onError) options.onError('GEOCODE_FAILED');
          return;
        }
        _fetchDirections(coords[0], coords[1], options);
      })
      .catch(function (err) {
        console.error('maps.js: geocode error —', err);
        if (options.onError) options.onError(String(err));
      });
  }

  // ─── Initialisation ───────────────────────────────────────────────────────────

  window.initMap = function () {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;

    mapboxgl.accessToken = APP_CONFIG.mapboxToken;

    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      zoom: 13,
      center: [24.7536, 59.4370], // Tallinn — overridden once route loads
      attributionControl: false
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    // Show re-centre FAB when user pans/zooms; hide after programmatic moves
    map.on('movestart', function (e) {
      if (e.originalEvent) {
        var btn = document.querySelector('.screen--category__fab-recentre');
        if (btn) btn.classList.add('is-visible');
      }
    });
    map.on('moveend', function (e) {
      if (!e.originalEvent) {
        var btn = document.querySelector('.screen--category__fab-recentre');
        if (btn) btn.classList.remove('is-visible');
      }
    });

    map.on('load', function () {
      // Hide road number shields
      map.getStyle().layers.forEach(function (layer) {
        if (layer.id.indexOf('shield') !== -1) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      });

      // Expose planRoute globally once the map is ready
      window.planRoute = planRoute;

      // Auto-plan if the page set window.ROUTE_REQUEST before the map loaded
      if (window.ROUTE_REQUEST) {
        planRoute(
          window.ROUTE_REQUEST.origin,
          window.ROUTE_REQUEST.destination,
          window.ROUTE_REQUEST.options
        );
      }
    });
  };

  // ─── Directions ──────────────────────────────────────────────────────────────

  function _fetchDirections(originCoords, destCoords, options) {
    var coords = originCoords[0] + ',' + originCoords[1]
               + ';'
               + destCoords[0]  + ',' + destCoords[1];

    var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/'
            + coords
            + '?geometries=geojson&overview=full&access_token='
            + APP_CONFIG.mapboxToken;

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.routes || data.routes.length === 0) {
          console.error('maps.js: No route found');
          if (options.onError) options.onError('NO_ROUTE');
          return;
        }

        var route = data.routes[0];
        var etaMins = Math.round(route.duration / 60);
        _renderRoute(route.geometry, originCoords, destCoords, etaMins);

        if (options.onSuccess) {
          options.onSuccess({
            distance: route.distance,   // metres
            duration: route.duration    // seconds
          });
        }

        _animateGradient();
      })
      .catch(function (err) {
        console.error('maps.js: directions error —', err);
        if (options.onError) options.onError(String(err));
      });
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  /**
   * Simplify a geocoded address for display in the pin:
   * removes postcode, city and country segments, keeps street name/number only.
   * "Vana-Lõuna 15, Tallinn, 10133, Estonia" → "Vana-Lõuna 15"
   */
  function _simplifyAddress(address) {
    if (!address) return '';
    var parts = address.split(',').map(function (s) { return s.trim(); });
    // Filter out postcodes (pure digits or short alphanumeric like "10133", "EE-10133")
    var cleaned = parts.filter(function (p) {
      return !/^[A-Z]{0,3}[-\s]?\d{3,6}$/i.test(p) && !/^\d{3,6}$/.test(p);
    });
    // Drop the last part (country) and second-to-last if it looks like a region/city
    // heuristic: if more than 1 part remains, drop the last one (city/country)
    if (cleaned.length > 1) cleaned = cleaned.slice(0, cleaned.length - 1);
    if (cleaned.length > 1) cleaned = cleaned.slice(0, cleaned.length - 1);
    return cleaned.join(', ') || parts[0];
  }

  function _buildOriginPin(address, etaMins, variant) {
    var pin = document.createElement('div');
    pin.className = 'pickup-pin' + (variant && variant !== 'top' ? ' pickup-pin--' + variant : '');

    var card = document.createElement('div');
    card.className = 'pickup-pin__card';

    var eta = document.createElement('div');
    eta.className = 'pickup-pin__eta';
    eta.innerHTML = '<span class="pickup-pin__eta-value">' + etaMins + '</span>'
                  + '<span class="pickup-pin__eta-unit">min</span>';

    var loc = document.createElement('div');
    loc.className = 'pickup-pin__location';
    loc.innerHTML = '<span class="pickup-pin__location-text">' + _simplifyAddress(address) + '</span>'
                  + '<img class="pickup-pin__chevron" src="../assets/images/chevron-right-pickup.svg" alt="" aria-hidden="true">';

    var pointer = document.createElement('img');
    pointer.className = 'pickup-pin__pointer';
    pointer.src = '../assets/images/pin-pointer.svg';
    pointer.setAttribute('aria-hidden', 'true');

    card.appendChild(eta);
    card.appendChild(loc);
    card.appendChild(pointer);

    var ellipse = document.createElement('img');
    ellipse.className = 'pickup-pin__ellipse';
    ellipse.src = '../assets/images/pin-ellipse.svg';
    ellipse.setAttribute('aria-hidden', 'true');

    var target = document.createElement('img');
    target.className = 'pickup-pin__target';
    target.src = '../assets/images/pin-target.svg';
    target.setAttribute('aria-hidden', 'true');

    pin.appendChild(card);
    pin.appendChild(ellipse);
    pin.appendChild(target);

    return pin;
  }

  function _buildDropoffPin(address, etaMins, variant) {
    var pin = document.createElement('div');
    pin.className = 'dropoff-pin' + (variant && variant !== 'top' ? ' dropoff-pin--' + variant : '');

    var card = document.createElement('div');
    card.className = 'dropoff-pin__card';

    // Compute estimated arrival time
    var arrival = new Date(Date.now() + etaMins * 60 * 1000);
    var hh = arrival.getHours();
    var mm = arrival.getMinutes();
    var timeStr = hh + ':' + (mm < 10 ? '0' + mm : String(mm));

    var eta = document.createElement('div');
    eta.className = 'dropoff-pin__eta';
    eta.innerHTML = '<span class="dropoff-pin__eta-value">' + timeStr + '</span>';

    var loc = document.createElement('div');
    loc.className = 'dropoff-pin__location';
    loc.innerHTML = '<span class="dropoff-pin__location-text">' + _simplifyAddress(address) + '</span>'
                  + '<img class="dropoff-pin__chevron" src="../assets/images/chevron-right-dropoff.svg" alt="" aria-hidden="true">';

    var pointer = document.createElement('img');
    pointer.className = 'dropoff-pin__pointer';
    pointer.src = '../assets/images/pin-pointer-dark.svg';
    pointer.setAttribute('aria-hidden', 'true');

    card.appendChild(eta);
    card.appendChild(loc);
    card.appendChild(pointer);

    var ellipse = document.createElement('img');
    ellipse.className = 'dropoff-pin__ellipse';
    ellipse.src = '../assets/images/pin-ellipse-dark.svg';
    ellipse.setAttribute('aria-hidden', 'true');

    var target = document.createElement('img');
    target.className = 'dropoff-pin__target';
    target.src = '../assets/images/pin-target.svg';
    target.setAttribute('aria-hidden', 'true');

    pin.appendChild(card);
    pin.appendChild(ellipse);
    pin.appendChild(target);

    return pin;
  }

/**
   * Returns the safe area insets — space consumed by static UI elements.
   * Computed once; stable for the lifetime of the screen.
   *   top    — status bar height + 16px margin
   *   bottom — bottom sheet overlap over map canvas + 16px margin
   *   left/right — 16px margin
   */
  function _safeArea() {
    var margin      = 16;
    var statusBar   = document.querySelector('.status-bar');
    var fab         = document.querySelector('.fab');
    var mapArea     = document.querySelector('.map-area');
    var bottomSheet = document.querySelector('.bottom-sheet');

    var statusBarBottom = (statusBar ? statusBar.offsetHeight : 44) + 8;
    var fabBottom       = fab ? (fab.offsetTop + fab.offsetHeight) : 0;
    var top             = Math.max(statusBarBottom, fabBottom) + margin;
    var bottom          = margin;

    if (mapArea && bottomSheet) {
      var overlap = mapArea.getBoundingClientRect().bottom
                  - bottomSheet.getBoundingClientRect().top;
      if (overlap > 0) bottom = overlap + margin;
    }

    return { top: top, bottom: bottom, left: margin, right: margin };
  }

  var _lastVisualBounds = null;

  // Pixel extents from the ellipse centre (anchor point) to each visual edge, per variant.
  var _PIN_EXTENTS = {
    'top':    { top: 57, bottom: 23, left: 19, right: 135 },
    'bottom': { top: 18, bottom: 62, left: 19, right: 135 },
    'right':  { top: 18, bottom: 18, left: 18, right: 179 }
  };

  // Pixel offsets that align the ellipse centre with the map coordinate, per variant.
  var _ANCHOR_OFFSET = {
    'top':    [-19, -57],
    'bottom': [-19, -18],
    'right':  [-18, -18]
  };

  function _renderRoute(geometry, originCoords, destCoords, etaMins) {
    // Route line
    if (map.getSource(ROUTE_SOURCE)) {
      map.getSource(ROUTE_SOURCE).setData({ type: 'Feature', geometry: geometry });
    } else {
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'Feature', geometry: geometry }
      });

      map.addLayer({
        id: 'route-case',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 5,
          'line-opacity': 1,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0,   '#2b8659',  /* pickup green */
            1,   '#0c2c1c'   /* dropoff dark */
          ]
        }
      });
    }

    // Read ETA from the selected category item (car arrival time, not journey duration)
    var selectedEtaEl = document.querySelector('.category-item--selected .category-item__eta');
    var pickupEta     = selectedEtaEl ? (parseInt(selectedEtaEl.textContent, 10) || 5) : 5;

    // Origin marker — new pin component
    var addressEl = document.querySelector('.address-bar__origin');
    var address   = addressEl
      ? addressEl.textContent.trim()
      : (sessionStorage.getItem('route_origin') || '');
    var originEl  = _buildOriginPin(address, pickupEta, originVariant);
    originEl.style.cursor = 'pointer';
    originEl.addEventListener('click', function () {
      window.location.href = 'destination.html#origin';
    });
    new mapboxgl.Marker({
      element: originEl,
      anchor:  'top-left',
      offset:  _ANCHOR_OFFSET[originVariant] || _ANCHOR_OFFSET['top']
    })
      .setLngLat(originCoords)
      .addTo(map);

    // Destination marker — dropoff pin component
    var destAddressEl = document.querySelector('.address-bar__destination');
    var destAddress   = destAddressEl
      ? destAddressEl.textContent.trim()
      : (sessionStorage.getItem('route_destination') || '');
    var destEl = _buildDropoffPin(destAddress, (etaMins || 5) + pickupEta, destVariant);
    // Store route duration so selectItem can recalculate arrival time on category change
    var destEtaEl = destEl.querySelector('.dropoff-pin__eta');
    if (destEtaEl) destEtaEl.dataset.routeMins = etaMins || 5;
    destEl.style.cursor = 'pointer';
    destEl.addEventListener('click', function () {
      window.location.href = 'destination.html#destination';
    });
    new mapboxgl.Marker({
      element: destEl,
      anchor:  'top-left',
      offset:  _ANCHOR_OFFSET[destVariant] || _ANCHOR_OFFSET['top']
    })
      .setLngLat(destCoords)
      .addTo(map);

    // Two-pass fitBounds for accurate visual centering:
    // Pass 1 (no animation) — establishes the projection so we can convert pin
    //   pixel extents to geographic coordinates.
    // Pass 2 (animated)     — fits the full visual bounds (route + pin bubbles)
    //   using only the safe-area padding, centering the entire shape on screen.
    var routeBounds = geometry.coordinates.reduce(function (b, c) {
      return b.extend(c);
    }, new mapboxgl.LngLatBounds(originCoords, originCoords));

    var sa = _safeArea();

    // Choose bearing-based variants now that sa is known.
    var originVariant = _choosePinVariant(geometry.coordinates, true);
    var destVariant   = _choosePinVariant(geometry.coordinates, false);

    // Pass 1: snap silently to establish projection for pin extent calculation.
    map.fitBounds(routeBounds, { padding: sa, maxZoom: 15, animate: false });

    // Override bearing-based variants if they exceed the safe-area rectangle.
    // With a valid projection we can check pixel extents against screen bounds.
    var mapW = map.getContainer().offsetWidth;
    var mapH = map.getContainer().offsetHeight;
    function _fitVariant(lngLat, preferred) {
      var pt = map.project(lngLat);
      var order = [preferred, 'top', 'bottom', 'right'];
      for (var i = 0; i < order.length; i++) {
        var e = _PIN_EXTENTS[order[i]];
        if (pt.x - e.left   >= sa.left
         && pt.x + e.right  <= mapW - sa.right
         && pt.y - e.top    >= sa.top
         && pt.y + e.bottom <= mapH - sa.bottom) {
          return order[i];
        }
      }
      return preferred; // none fit cleanly — keep bearing choice
    }
    originVariant = _fitVariant(originCoords, originVariant);
    destVariant   = _fitVariant(destCoords,   destVariant);

    // Expand bounds to include each pin's visual footprint at the current projection.
    function _expandForPin(bounds, lngLat, variant) {
      var e  = _PIN_EXTENTS[variant] || _PIN_EXTENTS['top'];
      var pt = map.project(lngLat);
      [
        [pt.x - e.left,  pt.y - e.top],
        [pt.x + e.right, pt.y - e.top],
        [pt.x - e.left,  pt.y + e.bottom],
        [pt.x + e.right, pt.y + e.bottom]
      ].forEach(function (p) { bounds.extend(map.unproject(p)); });
    }

    var visualBounds = new mapboxgl.LngLatBounds(
      routeBounds.getSouthWest(), routeBounds.getNorthEast()
    );
    _expandForPin(visualBounds, originCoords, originVariant);
    _expandForPin(visualBounds, destCoords,   destVariant);

    // Iteratively verify both pins sit inside the safe area.
    // Each pass: fitBounds (silent) → project pin → if any edge overflows,
    // extend visualBounds to cover the overflow and repeat.
    for (var iter = 0; iter < 4; iter++) {
      map.fitBounds(visualBounds, { padding: sa, maxZoom: 15, animate: false });
      var anyOverflow = false;
      [[originCoords, originVariant], [destCoords, destVariant]].forEach(function (pair) {
        var e   = _PIN_EXTENTS[pair[1]] || _PIN_EXTENTS['top'];
        var pt  = map.project(pair[0]);
        var oL  = sa.left            - (pt.x - e.left);
        var oR  = (pt.x + e.right)   - (mapW - sa.right);
        var oT  = sa.top             - (pt.y - e.top);
        var oB  = (pt.y + e.bottom)  - (mapH - sa.bottom);
        if (Math.max(oL, oR, oT, oB) > 0) {
          anyOverflow = true;
          if (oL > 0) visualBounds.extend(map.unproject([pt.x - e.left   - oL - 1, pt.y]));
          if (oR > 0) visualBounds.extend(map.unproject([pt.x + e.right  + oR + 1, pt.y]));
          if (oT > 0) visualBounds.extend(map.unproject([pt.x, pt.y - e.top    - oT - 1]));
          if (oB > 0) visualBounds.extend(map.unproject([pt.x, pt.y + e.bottom + oB + 1]));
        }
      });
      if (!anyOverflow) break;
    }

    // Store for re-centre button
    _lastVisualBounds = visualBounds;

    // Jump to pickup location, then animate to the final view.
    // jumpTo + fitBounds are synchronous — browser renders only after this task,
    // so the user sees a smooth zoom outward from the pickup point.
    map.jumpTo({ center: originCoords, zoom: 15 });
    map.fitBounds(visualBounds, { padding: sa, maxZoom: 15 });
  }

  // ─── Pin variant selection ────────────────────────────────────────────────────

  /**
   * Choose a pin bubble variant so it doesn't overlap the route line.
   *
   * Strategy: compute the screen bearing of the route at the pin (exit bearing
   * for origin, arrival bearing for destination), then place the bubble on the
   * opposite side.
   *
   * @param {Array} coords  - Full route coordinate array [[lng,lat], ...]
   * @param {boolean} isOrigin - true = pickup pin, false = dropoff pin
   * @returns {'top'|'bottom'|'right'}
   */
  function _choosePinVariant(coords, isOrigin) {
    // Sample ~15 % of the route for a stable bearing (skips initial micro-turns).
    var k  = Math.max(1, Math.floor(coords.length * 0.15));
    var p1 = isOrigin ? coords[0]                    : coords[coords.length - 1 - k];
    var p2 = isOrigin ? coords[k]                    : coords[coords.length - 1];

    // Screen bearing (north = 0°, east = 90°, south = 180°, west = 270°)
    var dx      = p2[0] - p1[0];   // lng diff: positive → east (right)
    var dy      = p2[1] - p1[1];   // lat diff: positive → north (up)
    var bearing = Math.atan2(dx, dy) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;

    // For origin  : route exits in direction `bearing`  → avoid that side.
    // For dropoff : route arrives in direction `bearing` → avoid the opposite side
    //               (i.e. avoid the direction the route came from = bearing + 180).
    var avoid = isOrigin ? bearing : (bearing + 180) % 360;

    if (avoid >= 100 && avoid < 200) return 'top';    // avoid E/SE/S      → bubble north
    if (avoid >= 270 || avoid <  20) return 'bottom'; // avoid NW/N/NNE    → bubble south
    return 'right';                                    // avoid NE/E/SW/SSW → bubble east
  }

  // ─── Route animation ──────────────────────────────────────────────────────────

  function _animateGradient() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (animMarker)  { animMarker.remove(); animMarker = null; }

    var DURATION = 2400;     // ms per full sweep
    var HALF     = 0.18;     // highlight band half-width (fraction of route)
    var SHINE    = '#27ae60';

    // Inline hex helpers — no dependency on String.prototype.padStart
    function h2(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    // Linear interpolation between #2b8659 (pickup) and #0c2c1c (dropoff)
    function base(p) {
      return '#' + h2(43  + (12  - 43)  * p)
                 + h2(134 + (44  - 134) * p)
                 + h2(89  + (28  - 89)  * p);
    }
    // Blend SHINE (#27ae60) toward base(1) (#0c2c1c) as band exits (fade 1→0)
    function shineExit(fade) {
      return '#' + h2(0x27 + (12  - 0x27) * (1 - fade))
                 + h2(0xae + (44  - 0xae) * (1 - fade))
                 + h2(0x60 + (28  - 0x60) * (1 - fade));
    }

    var startTime = null;

    var CYCLE = DURATION * (1 + HALF); // restarts when back edge exits at dropoff

    function frame(ts) {
      if (!startTime) startTime = ts;
      var t  = ((ts - startTime) % CYCLE) / DURATION;
      var lo = Math.max(0, t - HALF);
      var hi = Math.min(1, t + HALF);

      // Build stop list; ensure positions are always strictly increasing
      var stops = [0, base(0)];
      var last  = 0;
      var eps   = 0.005;

      function add(pos, col) {
        if (pos > last + eps && pos <= 1) { stops.push(pos, col); last = pos; }
      }

      add(lo, base(lo));   // leading edge (base colour)
      if (t <= 1) {
        add(t,  SHINE);            // peak — band fully on route
        add(hi, base(hi));         // trailing edge
      } else {
        // Band exiting: fade SHINE → base as trailing edge approaches 1
        var fade = Math.max(0, 1 - (t - 1) / HALF);
        add(1, shineExit(fade));   // blended peak pinned to dropoff end
      }
      add(1,  base(1));    // end anchor

      map.setPaintProperty('route-line', 'line-gradient',
        ['interpolate', ['linear'], ['line-progress']].concat(stops));

      animFrameId = requestAnimationFrame(frame);
    }

    // Start after a short delay so the map fit animation settles
    setTimeout(function () {
      animFrameId = requestAnimationFrame(frame);
    }, 800);
  }

  // ─── Geocoding helper ─────────────────────────────────────────────────────────

  /**
   * Resolve an address (string) or coordinate pair ([lng,lat]) to [lng, lat].
   */
  function _resolve(input) {
    // Already a coordinate pair
    if (Array.isArray(input)) return Promise.resolve(input);

    var url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
            + encodeURIComponent(input)
            + '.json?limit=1&access_token='
            + APP_CONFIG.mapboxToken;

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return (data.features && data.features.length > 0)
          ? data.features[0].center   // [lng, lat]
          : null;
      });
  }

  // ─── Dynamic loader ───────────────────────────────────────────────────────────

  function _load() {
    if (typeof APP_CONFIG === 'undefined' || !APP_CONFIG.mapboxToken) {
      console.warn('maps.js: No Mapbox token found in config.js');
      return;
    }

    // CSS
    var link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css';
    document.head.appendChild(link);

    // JS
    var script   = document.createElement('script');
    script.src   = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js';
    script.onload = function () { window.initMap(); };
    document.head.appendChild(script);
  }

  window.mapsRecentre = function () {
    if (map && _lastVisualBounds) {
      map.fitBounds(_lastVisualBounds, { padding: _safeArea(), maxZoom: 15 });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _load);
  } else {
    _load();
  }
})();
