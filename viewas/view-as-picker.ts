import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { readable } from '../forbidden';

/**
 * The View-as picker: department → title → people, collapsible.
 *
 * **The owner, 4 November 2026, with screenshots of the CRM's control and
 * HR's:** *"view as in crm is good, this should be every where, but in every
 * module will show its allowed members instead"*.
 *
 * **IT IMPORTS NOTHING OF HR'S, DELIBERATELY.** It is meant to be lifted
 * into `royal-shell` and used by every module, so it takes an answer and a
 * bag of words through inputs and emits what somebody pressed. No HTTP, no
 * i18n service, no icon component, no module settings: a component that
 * reaches for any of those is a component that cannot move.
 *
 * What that costs, said plainly so the next person does not "fix" it: the
 * host wires the request, chooses the words, and decides what a press means.
 * This draws a list and reports a choice.
 */

/** One person, exactly as `auth/view-as/targets/` serves them. */
export interface ViewAsPerson {
  /** Absent for a person with no CRM username (80 of 110, 11 Nov 2026): look through `lookName`. */
  username?: string;
  employee_hr_id: string;
  full_name_en: string;
  full_name_ar: string;
  title_en: string;
  title_ar: string;
  department: string;
}

/**
 * The one name a look is entered under: the username, else HR's id, else
 * nothing, and nothing means no look (Royal Me, 11 Nov 2026: an absent
 * username became the header "undefined" and HR refused every page).
 */
export function lookName(person: ViewAsPerson): string | null {
  return person.username?.trim() || person.employee_hr_id?.trim() || null;
}

/** The people under one title, inside one department. */
export interface ViewAsTitleGroup {
  title: string;
  people: ViewAsPerson[];
}

/**
 * One section or arm inside a department (O-891). The owner, 16 Nov 2026:
 * "always separate between sections (e.g. broker section separate from
 * sales, tele sales separate as well)". HR orders them; `unit: null` (last)
 * holds the people in no unit, drawn under the department with NO heading.
 * `kind` is for wording only, never for grouping.
 */
export interface ViewAsUnitGroup {
  unit: string | null;
  name_en: string;
  name_ar: string;
  kind?: string;
  titles: ViewAsTitleGroup[];
}

/** One department, and the sections (or, from an older HR, the titles) inside it. */
export interface ViewAsDepartmentGroup {
  department: string;
  name_en: string;
  name_ar: string;
  titles: ViewAsTitleGroup[];
  /** Since O-891. Absent from an HR that predates it: then `titles` is drawn. */
  units?: ViewAsUnitGroup[];
}

/**
 * The whole answer. `people` is flat and `groups` is the same people
 * arranged — a SEARCH answers `people` with `groups` empty, because
 * somebody typing a name wants the name and not three headings to open.
 */
export interface ViewAsAnswer {
  module: string;
  searching: boolean;
  people: ViewAsPerson[];
  groups: ViewAsDepartmentGroup[];
}

/** Every word this control says, supplied by whoever hosts it. */
export interface ViewAsWords {
  title: string;
  what: string;
  search: string;
  nobody: string;
  failed: string;
  loading: string;
  /** What to draw in place of a forbidden word (the module's "Technical
   *  account"). Optional so older hosts still compile; absent, it draws nothing. */
  technical?: string;
}

@Component({
  selector: 'royal-view-as-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './view-as-picker.html',
  styleUrl: './view-as-picker.scss',
})
export class ViewAsPicker {
  /** `null` while the answer is on its way. */
  readonly answer = input<ViewAsAnswer | null>(null);
  readonly words = input.required<ViewAsWords>();
  /** The reader's language, for which of the two names to show. */
  readonly arabic = input(false);
  /** The host could not ask. NOT the same as an empty list, which is a
   *  claim that nobody may be looked at. */
  readonly failed = input(false);

  readonly search = output<string>();
  readonly chose = output<ViewAsPerson>();

  protected readonly term = signal('');

  /**
   * Which departments are open, by slug.
   *
   * **Open is remembered, not computed.** A set that reset on every answer
   * would close what somebody just opened the moment the list refreshed.
   */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  protected isOpen(slug: string): boolean {
    return this.opened().has(slug);
  }

  protected toggle(slug: string): void {
    const now = new Set(this.opened());
    if (!now.delete(slug)) now.add(slug);
    this.opened.set(now);
  }

  protected typed(value: string): void {
    this.term.set(value);
    this.search.emit(value);
  }

  /** Every value drawn passes here: the guard follows the data into whatever
   *  shape it arrives in, so no host has to remember to walk it. */
  protected shown(value: string | null | undefined): string {
    return readable(value, this.words().technical ?? '');
  }

  protected name(person: ViewAsPerson): string {
    const first = this.arabic() ? person.full_name_ar : person.full_name_en;
    return this.shown(first || person.full_name_en || person.full_name_ar || lookName(person) || '');
  }

  protected title(person: ViewAsPerson): string {
    const first = this.arabic() ? person.title_ar : person.title_en;
    return this.shown(first || person.title_en || person.title_ar || '');
  }

  protected departmentName(group: ViewAsDepartmentGroup): string {
    const first = this.arabic() ? group.name_ar : group.name_en;
    // A person with no department: the server sorts them last and sends no
    // name. Saying nothing is better than inventing a heading for them.
    return this.shown(first || group.name_en || group.name_ar || '');
  }

  /** How many people are under a department, for the heading. A count never
   *  ORDERS anything here — the server sorts alphabetically — it only says
   *  how much is behind a closed heading. */
  protected howMany(group: ViewAsDepartmentGroup): number {
    return this.sections(group).reduce(
      (all, unit) => all + unit.titles.reduce((n, one) => n + one.people.length, 0),
      0,
    );
  }

  /** The department's sections in HR's order; an older HR's flat titles read
   *  as one unheaded section, so both answers draw through one path. */
  protected sections(group: ViewAsDepartmentGroup): ViewAsUnitGroup[] {
    return group.units?.length
      ? group.units
      : [{ unit: null, name_en: '', name_ar: '', titles: group.titles }];
  }

  protected unitName(unit: ViewAsUnitGroup): string {
    const first = this.arabic() ? unit.name_ar : unit.name_en;
    return this.shown(first || unit.name_en || unit.name_ar || '');
  }

  protected readonly showsGroups = computed(() => {
    const said = this.answer();
    return !!said && !said.searching && said.groups.length > 0;
  });

  protected readonly showsFlat = computed(() => {
    const said = this.answer();
    return !!said && (said.searching || said.groups.length === 0) && said.people.length > 0;
  });

  protected readonly showsNobody = computed(() => {
    const said = this.answer();
    return !!said && said.people.length === 0 && (said.groups?.length ?? 0) === 0;
  });
}
