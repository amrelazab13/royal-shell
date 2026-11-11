import { TestBed } from '@angular/core/testing';
import { lookName, ViewAsAnswer, ViewAsPicker, ViewAsPerson, ViewAsWords } from './view-as-picker';

/**
 * O-830b. The control the owner asked for, tested ON ITS OWN.
 *
 * **That it needs no HR anything to stand up IS the test.** It is written to
 * be lifted into `royal-shell` for every module, and a spec that had to
 * provide HR's i18n service, HR's http client or HR's module settings would
 * be telling us it cannot move. There are no providers below for exactly
 * that reason.
 */
describe('ViewAsPicker', () => {
  const WORDS: ViewAsWords = {
    title: 'View as',
    what: 'Pick a person.',
    search: 'Search by name or number',
    nobody: 'Nobody matches.',
    failed: 'Could not open those eyes.',
    loading: 'Loading…',
  };

  const person = (extra: Partial<ViewAsPerson> = {}): ViewAsPerson => ({
    username: 'agent.alpha',
    employee_hr_id: 'e1',
    full_name_en: 'Agent Alpha',
    full_name_ar: 'العميل ألفا',
    title_en: 'Site Engineer',
    title_ar: 'مهندس موقع',
    department: 'engineering',
    ...extra,
  });

  const answer = (extra: Partial<ViewAsAnswer> = {}): ViewAsAnswer => ({
    module: 'crm',
    searching: false,
    people: [person()],
    groups: [
      {
        department: 'engineering',
        name_en: 'Engineering',
        name_ar: 'الهندسة',
        titles: [{ title: 'Site Engineer', people: [person()] }],
      },
    ],
    ...extra,
  });

  async function draw(inputs: Partial<Record<string, unknown>> = {}) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ViewAsPicker] }).compileComponents();
    const fixture = TestBed.createComponent(ViewAsPicker);
    fixture.componentRef.setInput('words', WORDS);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const at = (el: HTMLElement, test: string) => [
    ...el.querySelectorAll<HTMLElement>(`[data-test="${test}"]`),
  ];

  it('stands up with NO module providers at all', async () => {
    // The whole reason it can be lifted. If this ever needs a provider, the
    // control has grown a dependency on the module hosting it.
    const { el } = await draw({ answer: answer() });
    expect(el.textContent).toContain('View as');
  });

  it('draws departments closed, and opens one when pressed', async () => {
    const { fixture, el } = await draw({ answer: answer() });
    expect(at(el, 'va-department')[0].textContent).toContain('Engineering');
    expect(at(el, 'va-person'), 'people are visible before it is opened').toEqual([]);
    expect(at(el, 'va-department')[0].getAttribute('aria-expanded')).toBe('false');

    at(el, 'va-department')[0].click();
    fixture.detectChanges();
    expect(at(el, 'va-department')[0].getAttribute('aria-expanded')).toBe('true');
    expect(at(el, 'va-title')[0].textContent).toContain('Site Engineer');
    expect(at(el, 'va-person')[0].textContent).toContain('Agent Alpha');
  });

  it('says how many are behind a closed heading', async () => {
    const { el } = await draw({ answer: answer() });
    expect(at(el, 'va-department')[0].textContent).toContain('1');
  });

  it('KEEPS a department open when a new answer arrives', async () => {
    // Open is remembered and not computed: a set rebuilt from each answer
    // would close what somebody just opened the moment the list refreshed.
    const { fixture, el } = await draw({ answer: answer() });
    at(el, 'va-department')[0].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('answer', answer());
    fixture.detectChanges();
    expect(at(el, 'va-person').length).toBe(1);
  });

  it('a SEARCH draws people flat, with no headings to open first', async () => {
    const { el } = await draw({ answer: answer({ searching: true, groups: [] }) });
    expect(at(el, 'va-department')).toEqual([]);
    expect(at(el, 'va-person')[0].textContent).toContain('Agent Alpha');
    // The title rides along, because without a heading nothing else says
    // who this person is.
    expect(at(el, 'va-person')[0].textContent).toContain('Site Engineer');
  });

  it('emits what was typed, so the HOST decides what a search means', async () => {
    const { fixture, el } = await draw({ answer: answer() });
    const typed: string[] = [];
    fixture.componentInstance.search.subscribe((t: string) => typed.push(t));
    const box = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    box.value = 'alpha';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(typed).toEqual(['alpha']);
  });

  it('emits the PERSON pressed, and never acts itself', async () => {
    const { fixture, el } = await draw({ answer: answer() });
    const chosen: ViewAsPerson[] = [];
    fixture.componentInstance.chose.subscribe((p: ViewAsPerson) => chosen.push(p));
    at(el, 'va-department')[0].click();
    fixture.detectChanges();
    at(el, 'va-person')[0].click();
    expect(chosen.map((p) => p.employee_hr_id)).toEqual(['e1']);
  });

  it('says it COULD NOT ASK, which is not an empty list', async () => {
    // An empty list claims nobody may be looked at. The two must not read
    // the same, here or anywhere else in this system.
    const { el } = await draw({ answer: null, failed: true });
    expect(at(el, 'va-failed')[0].textContent).toContain('Could not');
    expect(at(el, 'va-nobody')).toEqual([]);
  });

  it('does not claim nobody over groups that are right there', async () => {
    const { el } = await draw({ answer: answer({ people: [] }) });
    expect(at(el, 'va-nobody')).toEqual([]);
  });

  it('and says NOBODY when the answer really is empty', async () => {
    const { el } = await draw({ answer: answer({ people: [], groups: [] }) });
    expect(at(el, 'va-nobody')[0].textContent).toContain('Nobody matches');
    expect(at(el, 'va-failed')).toEqual([]);
  });

  it('shows the loading word while the answer is on its way', async () => {
    const { el } = await draw({ answer: null });
    expect(el.textContent).toContain('Loading');
  });

  it('reads the ARABIC name and title when the reader is Arabic', async () => {
    const { el } = await draw({ answer: answer({ searching: true, groups: [] }), arabic: true });
    expect(at(el, 'va-person')[0].textContent).toContain('العميل ألفا');
    expect(at(el, 'va-person')[0].textContent).toContain('مهندس موقع');
    // THE CONTROL: the English is genuinely not drawn, so the line above is
    // not passing on a row that happens to hold both.
    expect(at(el, 'va-person')[0].textContent).not.toContain('Agent Alpha');
  });

  it('falls back to the other language rather than drawing nothing', async () => {
    const only = person({ full_name_ar: '', title_ar: '' });
    const { el } = await draw({
      answer: answer({ searching: true, groups: [], people: [only] }),
      arabic: true,
    });
    expect(at(el, 'va-person')[0].textContent).toContain('Agent Alpha');
  });
});

describe('lookName', () => {
  const base = {
    employee_hr_id: 'hr-1',
    full_name_en: 'test card 7',
    full_name_ar: 'بطاقة رقم 7',
    title_en: '',
    title_ar: '',
    department: '',
  };
  it('names a look by the username, else HR\'s id, else nobody', () => {
    expect(lookName({ ...base, username: 'a.card' })).toBe('a.card');
    expect(lookName({ ...base })).toBe('hr-1');
    expect(lookName({ ...base, username: '  ' })).toBe('hr-1');
    expect(lookName({ ...base, employee_hr_id: '' })).toBeNull();
  });
});
