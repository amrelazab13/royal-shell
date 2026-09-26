import { Component, input } from '@angular/core';

/**
 * Every Royal module's icon set — the CRM's, shared from `royal-shell` since
 * 25 Sep 2026. It is the union of the CRM's 42 and the 46 `royal-ui` carried
 * (the CRM's plus bands, case, exit, leave, org, plan, question, seat, star):
 * 51 symbols, no name drawn two ways.
 *
 * The prototype kept these as a map of path strings and injected them with
 * `innerHTML`. Angular's sanitiser strips SVG out of `innerHTML`, and the way
 * round that — `bypassSecurityTrustHtml` — is a habit worth not starting. So
 * the same paths live here as real markup in a hidden sprite, and every icon on
 * a screen is a `<use>` pointing into it. One copy of each path in the
 * document, no sanitiser involved.
 *
 * One difference from the CRM's copy: the sprite is hidden by this
 * component's own stylesheet, not by a style attribute. The portal's
 * browser policy allows styles only with the page's nonce, which Angular
 * stamps on stylesheets and cannot stamp on an attribute — the CRM's
 * `style="display: none"` left a 300 by 150 empty box above the masthead.
 */
@Component({
  selector: 'app-icon-sprite',
  styles: `
    :host {
      display: block;
      inline-size: 0;
      block-size: 0;
      overflow: hidden;
    }
  `,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <symbol id="i-dash" viewBox="0 0 24 24">
        <path d="M3 13h8V3H3zM13 21h8V11h-8zM13 7h8V3h-8zM3 21h8v-4H3z" />
      </symbol>
      <symbol id="i-leads" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 00-3-3.87" />
      </symbol>
      <symbol id="i-proj" viewBox="0 0 24 24">
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </symbol>
      <symbol id="i-unit" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </symbol>
      <symbol id="i-res" viewBox="0 0 24 24">
        <path d="M19 21l-7-4-7 4V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </symbol>
      <symbol id="i-contract" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M9 15h6M9 11h3" />
      </symbol>
      <symbol id="i-money" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path
          d="M15 9.5a3 3 0 00-3-1.5c-1.7 0-3 1-3 2s1.3 2 3 2 3 1 3 2-1.3 2-3 2a3 3 0 01-3-1.5M12 6v12"
        />
      </symbol>
      <symbol id="i-broker" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 11h-6" />
      </symbol>
      <symbol id="i-report" viewBox="0 0 24 24">
        <path d="M3 3v18h18" />
        <path d="M7 15l4-5 3 3 5-7" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0116 0" />
      </symbol>
      <symbol id="i-plug" viewBox="0 0 24 24">
        <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0z" />
        <path d="M12 18v4" />
      </symbol>
      <symbol id="i-audit" viewBox="0 0 24 24">
        <path d="M4 4h16v16H4z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </symbol>
      <symbol id="i-tag" viewBox="0 0 24 24">
        <path d="M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 010 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </symbol>
      <symbol id="i-phone" viewBox="0 0 24 24">
        <path
          d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"
        />
      </symbol>
      <symbol id="i-chat" viewBox="0 0 24 24">
        <path
          d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.8-.9L3 21l2-4.9A8.4 8.4 0 014 11.5a8.4 8.4 0 018.5-8.4 8.4 8.4 0 018.5 8.4z"
        />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="i-pencil" viewBox="0 0 24 24">
        <path d="M17 3a2.8 2.8 0 014 4L7.5 20.5 2 22l1.5-5.5z" />
      </symbol>
      <symbol id="i-trash" viewBox="0 0 24 24">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      </symbol>
      <symbol id="i-dl" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </symbol>
      <symbol id="i-export" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 8l5-5 5 5M12 3v12" />
      </symbol>
      <symbol id="i-file" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </symbol>
      <symbol id="i-cols" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18" />
      </symbol>
      <symbol id="i-filter" viewBox="0 0 24 24">
        <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />
      </symbol>
      <symbol id="i-merge" viewBox="0 0 24 24">
        <path d="M6 3v6a6 6 0 006 6h6" />
        <path d="M15 12l3 3-3 3" />
      </symbol>
      <symbol id="i-swap" viewBox="0 0 24 24">
        <path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.2 1.9" />
      </symbol>
      <symbol id="i-shield" viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </symbol>
      <symbol id="i-copy" viewBox="0 0 24 24">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </symbol>
      <symbol id="i-key" viewBox="0 0 24 24">
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="M10.7 12.3L21 2m-4 4l3 3m-6-6l3 3" />
      </symbol>
      <symbol id="i-search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.6-3.6" />
      </symbol>
      <symbol id="i-bell" viewBox="0 0 24 24">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </symbol>
      <symbol id="i-burger" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
      <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </symbol>
      <symbol id="i-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>

      <!-- The HR module's screens, which the CRM has no symbol for. Same 24
           by 24 box and the same line weight as the set above, so a side
           drawn from this sprite reads as one hand made it. A module that
           does not use one of these simply never points at it. -->
      <symbol id="i-question" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9.2a3 3 0 015.8 1c0 2-3 2.4-3 4" />
        <path d="M12 17.6v.01" />
      </symbol>
      <symbol id="i-org" viewBox="0 0 24 24">
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <rect x="2" y="17" width="6" height="5" rx="1" />
        <rect x="16" y="17" width="6" height="5" rx="1" />
        <path d="M12 7v6M5 17v-4h14v4" />
      </symbol>
      <symbol id="i-bands" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <rect x="5" y="10" width="14" height="4" rx="1" />
        <rect x="7" y="16" width="10" height="4" rx="1" />
      </symbol>
      <symbol id="i-seat" viewBox="0 0 24 24">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M2 13h20" />
      </symbol>
      <symbol id="i-plan" viewBox="0 0 24 24">
        <path d="M9 4H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </symbol>
      <symbol id="i-leave" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M9 16h6" />
      </symbol>
      <symbol id="i-exit" viewBox="0 0 24 24">
        <path d="M10 3H6a2 2 0 00-2 2v14a2 2 0 002 2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </symbol>
      <symbol id="i-star" viewBox="0 0 24 24">
        <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9z" />
      </symbol>
      <symbol id="i-case" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <path d="M12 11v3M12 17.4v.01" />
      </symbol>
      <symbol id="i-archive" viewBox="0 0 24 24">
        <path d="M3 7h18v3H3zM5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9M10 14h4" />
      </symbol>
      <symbol id="i-burger-close" viewBox="0 0 24 24">
        <path d="M4 7h14M10 12h8M4 17h14" />
        <path d="M7 9l-3 3 3 3" />
      </symbol>
      <symbol id="i-burger-open" viewBox="0 0 24 24">
        <path d="M4 7h14M4 12h8M4 17h14" />
        <path d="M16 9l3 3-3 3" />
      </symbol>
      <symbol id="i-expand" viewBox="0 0 24 24">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </symbol>
      <symbol id="i-minimize" viewBox="0 0 24 24">
        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
      </symbol>
      <!-- The overflow menu. Filled rather than stroked: three thin outlined
           circles read as smudges at phone sizes. (From the phone app.) -->
      <symbol id="i-dots" viewBox="0 0 24 24">
        <circle cx="12" cy="5" r="1.9" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1.9" fill="currentColor" stroke="none" />
      </symbol>
      <!-- A password field's show / hide toggle. -->
      <symbol id="i-eye" viewBox="0 0 24 24">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol id="i-eye-off" viewBox="0 0 24 24">
        <path
          d="M9.9 5.2A10 10 0 0112 5c6.4 0 10 7 10 7a18 18 0 01-3.2 4.1M6.2 6.2A18 18 0 002 12s3.6 7 10 7a10 10 0 004.2-.9"
        />
        <path d="M9.9 9.9a3 3 0 004.2 4.2M2 2l20 20" />
      </symbol>
    </svg>
  `,
})
export class IconSprite {}

/**
 * One icon. `name` is a key of the sprite above, without the `i-` prefix.
 *
 * The icon draws itself as a line icon out of the box. A module's COMPONENT
 * stylesheet cannot reach this `<svg>` — emulated encapsulation stamps the
 * module's `svg` selector with the module's attribute, and this svg carries
 * this component's — so an icon whose look lived only in a component sheet
 * came out as a solid black blob, with a clean build and passing tests
 * (Royal Me, 26 Sep 2026; INCONSISTENCIES §11, F16). The defaults below sit
 * inside `:where()`, so they weigh nothing: any rule in a module's GLOBAL
 * stylesheet (`.nav svg`, `.btn svg`) still sizes and restyles them.
 */
@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <use [attr.href]="'#i-' + name()" />
  </svg>`,
  styles: `
    :host {
      display: contents;
    }
    :where(svg) {
      inline-size: var(--icon-size, 16px);
      block-size: var(--icon-size, 16px);
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: var(--icon-stroke, 1.9);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<string>();
}
