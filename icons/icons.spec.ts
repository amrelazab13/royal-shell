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
});
