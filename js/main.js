// main.js — shared JS for all screens

document.addEventListener('DOMContentLoaded', () => {

  // Category list selection
  document.querySelectorAll('.category-list').forEach(list => {
    var items = list.querySelectorAll('.category-item');

    function selectItem(target) {
      items.forEach(item => {
        var selected = item === target;
        item.classList.toggle('category-item--selected', selected);
        item.setAttribute('aria-checked', selected ? 'true' : 'false');
      });

      // Update the order sheet button label to match selected category name
      var nameEl = target.querySelector('.category-item__name');
      var btn = document.querySelector('.order-sheet__select-btn');
      if (nameEl && btn) {
        btn.textContent = 'Select ' + nameEl.textContent;
      }

      // Sync pickup pin ETA with rolling animation
      var etaEl = target.querySelector('.category-item__eta');
      if (etaEl) {
        var mins     = parseInt(etaEl.textContent, 10);

        // — Pickup pin
        var pinEta   = document.querySelector('.pickup-pin__eta');
        var pinValue = pinEta ? pinEta.querySelector('.pickup-pin__eta-value') : null;
        if (pinValue && !isNaN(mins) && String(mins) !== pinValue.textContent.trim()) {
          var nextMins = mins;
          pinValue.classList.add('pickup-pin__eta-value--roll-out');
          setTimeout(function () {
            pinValue.classList.remove('pickup-pin__eta-value--roll-out');
            pinValue.textContent = nextMins;
            void pinValue.offsetWidth;
            pinValue.classList.add('pickup-pin__eta-value--roll-in');
            setTimeout(function () {
              pinValue.classList.remove('pickup-pin__eta-value--roll-in');
            }, 220);
          }, 180);
        }

        // — Dropoff pin: recalculate arrival time and update instantly
        var dropoffEta   = document.querySelector('.dropoff-pin__eta');
        var dropoffValue = dropoffEta ? dropoffEta.querySelector('.dropoff-pin__eta-value') : null;
        if (dropoffEta && dropoffValue && !isNaN(mins)) {
          var routeMins = parseInt(dropoffEta.dataset.routeMins, 10) || 0;
          var arrival   = new Date(Date.now() + (routeMins + mins) * 60 * 1000);
          var hh        = arrival.getHours();
          var mm        = arrival.getMinutes();
          dropoffValue.textContent = hh + ':' + (mm < 10 ? '0' + mm : String(mm));
        }
      }
    }

    items.forEach(item => {
      item.addEventListener('click', () => selectItem(item));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectItem(item);
        }
        // Arrow key navigation
        var idx = Array.from(items).indexOf(item);
        if (e.key === 'ArrowDown' && idx < items.length - 1) items[idx + 1].focus();
        if (e.key === 'ArrowUp'   && idx > 0)               items[idx - 1].focus();
      });
    });
  });

});
