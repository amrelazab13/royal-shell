import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  username: string;
  employee_hr_id: string;
  full_name_en: string;
  full_name_ar: string;
  title_en: string;
  title_ar: string;
  department: string;
}

/** The people under one title, inside one department. */
export interface ViewAsTitleGroup {
  title: string;
  people: ViewAsPerson[];
}

/** One department, and the titles inside it. */
export interface ViewAsDepartmentGroup {
  department: string;
  name_en: string;
  name_ar: string;
  titles: ViewAsTitleGroup[];
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

  protected name(person: ViewAsPerson): string {
    const first = this.arabic() ? person.full_name_ar : person.full_name_en;
    return first || person.full_name_en || person.full_name_ar || person.username;
  }

  protected title(person: ViewAsPerson): string {
    const first = this.arabic() ? person.title_ar : person.title_en;
    return first || person.title_en || person.title_ar || '';
  }

  protected departmentName(group: ViewAsDepartmentGroup): string {
    const first = this.arabic() ? group.name_ar : group.name_en;
    // A person with no department: the server sorts them last and sends no
    // name. Saying nothing is better than inventing a heading for them.
    return first || group.name_en || group.name_ar || '';
  }

  /** How many people are under a department, for the heading. A count never
   *  ORDERS anything here — the server sorts alphabetically — it only says
   *  how much is behind a closed heading. */
  protected howMany(group: ViewAsDepartmentGroup): number {
    return group.titles.reduce((all, one) => all + one.people.length, 0);
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
    return !!said && said.people.length === 0;
  });
}
