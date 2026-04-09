# Route Animation Project

## Project Overview
A ride-sharing / route animation UI prototype built with vanilla HTML, CSS, and JavaScript.

## Structure
- `/screens` — full-page HTML screens (home, category)
- `/components` — reusable HTML snippets (navbar, ride-card)
- `/css/tokens.css` — design tokens (colors, spacing, typography)
- `/css/components.css` — reusable component styles
- `/css/screens.css` — screen-specific overrides
- `/js/main.js` — shared JavaScript logic
- `/assets/images` — image assets

## Conventions
- Use CSS custom properties from `tokens.css` for all colors, spacing, and fonts
- Each screen imports all three CSS files and the main JS file
- Components are standalone HTML snippets included via fetch or copy-paste
- No build tools — plain HTML/CSS/JS only

## Viewport
All screens are designed at 375px mobile width.
Always use <meta name="viewport" content="width=375"> 
and wrap content in a 375x812px phone shell.
Never add responsive breakpoints unless explicitly asked.

## Phone shell boilerplate
Every new screen must include these two elements as the first children inside `.phone-shell`, in this order:

```html
<div class="phone-shell">

  <div class="dynamic-island" aria-hidden="true"></div>

  <div class="status-bar" aria-hidden="true">
    <span class="status-bar__time" id="status-bar-time">9:41</span>
    <div class="status-bar__icons">
      <img class="status-bar__signal"  src="../assets/images/Mobile Signal.svg" alt="" />
      <img class="status-bar__wifi"    src="../assets/images/Wifi.svg"          alt="" />
      <img class="status-bar__battery" src="../assets/images/Battery.svg"       alt="" />
    </div>
  </div>

  <!-- screen content -->

</div>
```

- The dynamic island and status bar are both `position: absolute` and overlay content — they do not affect document flow.
- Any nav bar or first in-flow element must have `margin-top: 44px` to sit below the status bar.
- The clock script (updates `#status-bar-time` every 10 s) should be included in every screen's inline `<script>`.
