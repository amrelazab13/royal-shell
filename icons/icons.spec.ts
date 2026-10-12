import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Icon, IconSprite } from './icons';

describe('icons', () => {
  it('the sprite carries no inline style — the browser policy would block it and show the box', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [IconSprite] }).compileComponents();
    const fixture = TestBed.createComponent(IconSprite);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('style')).toBeNull();
    expect(svg.querySelector('#i-back')).not.toBeNull();
    expect(svg.querySelector('#i-calendar')).not.toBeNull();
    for (const id of [
      'i-dots',
      'i-eye',
      'i-eye-off',
      'i-mod-crm',
      'i-mod-portal',
      'i-mod-hr',
      'i-mod-salesops',
      'i-mod-me',
    ])
      expect(svg.querySelector('#' + id)).not.toBeNull();
  });

  it('every NEW icon the dictionary names is drawn — none is an empty symbol', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [IconSprite] }).compileComponents();
    const fixture = TestBed.createComponent(IconSprite);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    // DICTIONARY.md "Draw the NEW icons" (38), alert and lock included.
    const fresh = [
      'alert',
      'lock',
      'pause',
      'rules',
      'breach',
      'present',
      'trip',
      'installments',
      'recycle',
      'link',
      'pool',
      'repeat',
      'compare',
      'moves',
      'settings',
      'history',
      'flag',
      'person',
      'team',
      'contacts',
      'activity',
      'timer',
      'annex',
      'request',
      'leaver',
      'theme',
      'site',
      'masterplan',
      'deal',
      'commission',
      'chart',
      'roadmap',
      'whatsapp',
      'meeting',
      'video',
      'visit',
      'mail',
      'note',
    ];
    expect(fresh.length).toBe(38);
    for (const name of fresh) {
      const symbol = svg.querySelector('#i-' + name);
      expect(symbol, name).not.toBeNull();
      const marks = symbol?.querySelectorAll('path, line, circle, rect, polyline').length ?? 0;
      expect(marks, name + ' draws something').toBeGreaterThan(0);
    }
    // One icon, one meaning: no two symbols share an id.
    const ids = [...svg.querySelectorAll('symbol')].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('an icon points into the sprite by name', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Icon] }).compileComponents();
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'back');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('use')?.getAttribute('href')).toBe(
      '#i-back',
    );
  });

  it('an icon that points a way carries the mirror class only when asked', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Icon] }).compileComponents();
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', 'exit');
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.classList.contains('mirror')).toBe(false);
    fixture.componentRef.setInput('mirror', true);
    await fixture.whenStable();
    expect(svg.classList.contains('mirror')).toBe(true);
  });

  it('a bare mirror attribute turns the arrow (it used to arrive as "" and do nothing)', async () => {
    @Component({ imports: [Icon], template: `<app-icon name="back" mirror />` })
    class Host {}
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.classList.contains('mirror')).toBe(true);
  });
});
