import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  GroupedPicker,
  GroupedPickerWords,
  PickerGroup,
  PickerItem,
  PickerRow,
  foldForSearch,
  pickerRows,
} from './grouped-picker';

/**
 * The owner's rule of 5 Nov: grouped, and alphabetical at every level. Every
 * fixture is handed over in the wrong order, and the Arabic names are chosen so
 * the two languages order the same rows DIFFERENTLY: an ordering test whose two
 * keys agree passes whichever key wins.
 */

function g(name_en: string, name_ar = ''): PickerGroup {
  return { name_en, name_ar };
}

function item(id: string, name_en: string, name_ar: string, group: PickerGroup[] = []): PickerItem {
  return { id, name_en, name_ar, group };
}

/** Headings as `depth:label`, items as `depth=label`, for reading at a glance. */
function read(rows: PickerRow[]): string[] {
  return rows.map((r) => (r.kind === 'group' ? `${r.depth}:${r.label}` : `${r.depth}=${r.label}`));
}

const SALES = g('Sales', 'مبيعات');
const FINANCE = g('Finance', 'تمويل');
const WEST = g('West arm', 'ذراع غربي');
const EAST = g('East arm', 'ذراع شرقي');
const NILE = g('Nile team', 'فريق نيل');

const BOOK: PickerItem[] = [
  item('p1', 'Zed Tester', 'ألف تجريبي', [SALES, WEST, NILE]),
  item('p2', 'amy Tester', 'يا تجريبي', [SALES, WEST, NILE]),
  item('p3', 'Beth Tester', 'باء تجريبي', [SALES, WEST, NILE]),
  item('p4', 'Dana Tester', 'دال تجريبي', [SALES, EAST]),
  item('p5', 'Omar Tester', 'عين تجريبي', [FINANCE]),
];

describe('pickerRows', () => {
  it('groups by department, arm and team, as deep as each item goes', () => {
    expect(read(pickerRows(BOOK, false))).toEqual([
      '0:Finance',
      '1=Omar Tester',
      '0:Sales',
      '1:East arm',
      '2=Dana Tester',
      '1:West arm',
      '2:Nile team',
      '3=amy Tester',
      '3=Beth Tester',
      '3=Zed Tester',
    ]);
  });

  it('orders every level in the READER’S language, which is not the same order', () => {
    expect(read(pickerRows(BOOK, true))).toEqual([
      '0:تمويل',
      '1=عين تجريبي',
      '0:مبيعات',
      '1:ذراع شرقي',
      '2=دال تجريبي',
      '1:ذراع غربي',
      '2:فريق نيل',
      '3=ألف تجريبي',
      '3=باء تجريبي',
      '3=يا تجريبي',
    ]);
  });

  it('reads the reader’s own script first when a list holds both', () => {
    const mixed = [item('a', 'Aya', ''), item('b', '', 'باء')];
    expect(pickerRows(mixed, false).map((r) => r.label)).toEqual(['Aya', 'باء']);
    expect(pickerRows(mixed, true).map((r) => r.label)).toEqual(['باء', 'Aya']);
  });

  it('never orders by case, and puts Team 10 after Team 9', () => {
    const rows = pickerRows(
      [
        item('a', 'Team 10', ''),
        item('b', 'beta', ''),
        item('c', 'Team 9', ''),
        item('d', 'ALPHA', ''),
      ],
      false,
    );
    expect(read(rows)).toEqual(['0=ALPHA', '0=beta', '0=Team 9', '0=Team 10']);
  });

  it('skips a blank level, so a person with no team sits under their arm', () => {
    const rows = pickerRows([item('a', 'Amy', '', [SALES, WEST, g('', '')])], false);
    expect(read(rows)).toEqual(['0:Sales', '1:West arm', '2=Amy']);
  });

  it('puts an item with no place above the headings, not under an invented one', () => {
    const rows = pickerRows([item('a', 'Amy', '', [SALES]), item('b', 'Zed', '')], false);
    expect(read(rows)).toEqual(['0=Zed', '0:Sales', '1=Amy']);
  });

  it('keeps two same-named teams in two arms apart', () => {
    const rows = pickerRows(
      [item('a', 'Amy', '', [WEST, NILE]), item('b', 'Beth', '', [EAST, NILE])],
      false,
    );
    expect(read(rows)).toEqual([
      '0:East arm',
      '1:Nile team',
      '2=Beth',
      '0:West arm',
      '1:Nile team',
      '2=Amy',
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('falls back to the other language, then the id, rather than a blank line', () => {
    const rows = pickerRows(
      [item('a', 'Only English', ''), item('b', '', 'عربي فقط'), item('nameless', '', '')],
      true,
    );
    expect(rows.map((r) => r.label).sort()).toEqual(
      ['Only English', 'nameless', 'عربي فقط'].sort(),
    );
  });

  it('merges one heading told apart only by case', () => {
    const rows = pickerRows(
      [item('a', 'Amy', '', [g('SALES')]), item('b', 'Beth', '', [g('Sales')])],
      false,
    );
    expect(rows.filter((r) => r.kind === 'group').length).toBe(1);
  });
});

describe('foldForSearch', () => {
  it('meets a name typed without its hamza, taa marbuta or diacritics', () => {
    expect(foldForSearch('أَحْمَد')).toBe(foldForSearch('احمد'));
    expect(foldForSearch('فاطمة')).toBe(foldForSearch('فاطمه'));
    expect(foldForSearch('ٱحمد')).toBe(foldForSearch('احمد'));
    expect(foldForSearch('Élodie')).toBe('elodie');
  });
});

describe('GroupedPicker', () => {
  const WORDS: GroupedPickerWords = { placeholder: 'Choose', clear: 'Clear', none: 'Nothing' };

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function draw(opts: { value?: string; arabic?: boolean } = {}) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [GroupedPicker],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(GroupedPicker);
    fixture.componentRef.setInput('items', BOOK);
    fixture.componentRef.setInput('words', WORDS);
    fixture.componentRef.setInput('label', 'Transfer to');
    if (opts.value) fixture.componentRef.setInput('value', opts.value);
    if (opts.arabic) fixture.componentRef.setInput('arabic', true);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector<HTMLInputElement>('[data-test="gp-field"]')!;
    const chosen: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => chosen.push(id));
    const names = () =>
      Array.from(el.querySelectorAll('[data-test="gp-item"] .nm')).map((n) => n.textContent);
    const press = async (key: string) => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle(fixture);
    };
    const type = async (text: string) => {
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(fixture);
    };
    const isOpen = () => !el.querySelector<HTMLElement>('.gp-pop')!.hidden;
    return { fixture, el, field, chosen, names, press, type, isOpen };
  }

  it('is closed until the field is pressed, then shows headings and names in order', async () => {
    const { fixture, el, field, names, isOpen } = await draw();
    expect(isOpen()).toBe(false);
    field.click();
    await settle(fixture);
    expect(isOpen()).toBe(true);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[data-test="gp-group"]')?.textContent).toContain('Finance');
    expect(names()).toEqual([
      'Omar Tester',
      'Dana Tester',
      'amy Tester',
      'Beth Tester',
      'Zed Tester',
    ]);
  });

  it('indents by depth through a custom property, so RTL mirrors it', async () => {
    const { el } = await draw();
    const deepest = Array.from(el.querySelectorAll<HTMLElement>('[data-test="gp-item"]')).pop()!;
    expect(deepest.getAttribute('data-depth')).toBe('3');
    expect(deepest.style.getPropertyValue('--gp-depth')).toBe('3');
  });

  it('holds no sided CSS: every indent and edge is logical, so it mirrors under RTL', async () => {
    await draw();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .filter((text) => text.includes('.gp-row'))
      .join('\n');
    expect(css).toContain('padding-inline');
    expect(css).toContain('inset-inline-start');
    expect(css).not.toMatch(/(^|[\s;{])(left|right)\s*:/m);
    expect(css).not.toMatch(/(padding|margin|border)-(left|right)/);
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
  });

  it('a heading cannot be chosen: pressing it picks nothing and leaves the list open', async () => {
    const { fixture, el, field, chosen, isOpen } = await draw();
    field.click();
    await settle(fixture);
    el.querySelector<HTMLElement>('[data-test="gp-group"]')!.click();
    await settle(fixture);
    expect(chosen).toEqual([]);
    expect(isOpen()).toBe(true);
  });

  it('pressing a name emits its id, closes, and the field shows the name', async () => {
    const { fixture, el, field, chosen, isOpen } = await draw();
    field.click();
    await settle(fixture);
    el.querySelectorAll<HTMLElement>('[data-test="gp-item"]')[2].click();
    await settle(fixture);
    expect(chosen).toEqual(['p2']);
    expect(isOpen()).toBe(false);
    expect(field.value).toBe('amy Tester');
  });

  it('the arrows walk the names and read past the headings; Enter chooses', async () => {
    const { field, chosen, press } = await draw();
    await press('ArrowDown');
    await press('ArrowDown');
    const active = field.getAttribute('aria-activedescendant')!;
    expect(active).toBeTruthy();
    await press('Enter');
    expect(chosen).toEqual(['p4']);
  });

  it('opens on the chosen item, in the reader’s order', async () => {
    const { fixture, el, field } = await draw({ value: 'p3' });
    expect(field.value).toBe('Beth Tester');
    field.click();
    await settle(fixture);
    expect(el.querySelector('.gp-row.active')?.textContent).toContain('Beth Tester');
    expect(el.querySelector('.gp-row.current')?.textContent).toContain('Beth Tester');
  });

  it('Arabic shows the Arabic names, in Arabic order', async () => {
    const { fixture, field, names } = await draw({ arabic: true });
    field.click();
    await settle(fixture);
    expect(names()).toEqual(['عين تجريبي', 'دال تجريبي', 'ألف تجريبي', 'باء تجريبي', 'يا تجريبي']);
  });

  it('search finds a name in either language, or by its group, keeping the headings', async () => {
    const { el, names, type } = await draw();
    await type('باء');
    expect(names()).toEqual(['Beth Tester']);
    expect(el.querySelectorAll('[data-test="gp-group"]').length).toBe(3);

    await type('finance');
    expect(names()).toEqual(['Omar Tester']);

    await type('sales amy');
    expect(names()).toEqual(['amy Tester']);
  });

  it('says so when nothing matches', async () => {
    const { el, names, type, press, chosen } = await draw();
    await type('nobody at all');
    expect(names()).toEqual([]);
    expect(el.querySelector('[data-test="gp-none"]')?.textContent).toContain('Nothing');
    await press('Enter');
    expect(chosen).toEqual([]);
  });

  it('typing alone chooses nothing: leaving puts the choice back', async () => {
    const { fixture, field, chosen, type } = await draw({ value: 'p3' });
    await type('zzz');
    field.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(field.value).toBe('Beth Tester');
    expect(chosen).toEqual([]);
  });

  it('Escape shuts the list first, then takes back the typing', async () => {
    const { field, type, press, isOpen } = await draw({ value: 'p3' });
    await type('zzz');
    await press('Escape');
    expect(isOpen()).toBe(false);
    expect(field.value).toBe('zzz');
    await press('Escape');
    expect(field.value).toBe('Beth Tester');
  });

  it('clearing emits nothing chosen and leaves the field empty', async () => {
    const { fixture, el, field, chosen } = await draw({ value: 'p3' });
    el.querySelector<HTMLElement>('[data-test="gp-clear"]')!.click();
    await settle(fixture);
    expect(chosen).toEqual(['']);
    expect(field.value).toBe('');
  });

  it('every option names its place for a screen reader', async () => {
    const { el } = await draw();
    const zed = Array.from(el.querySelectorAll('[data-test="gp-item"]')).pop()!;
    expect(zed.getAttribute('role')).toBe('option');
    expect(zed.getAttribute('aria-label')).toBe('Zed Tester — Sales · West arm · Nile team');
  });
});
