import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

/**
 * The one dropdown of people, teams or anything placed in the chart.
 *
 * **The owner, 5 November 2026:** *"any drop down list in the system, i want it
 * to be alphapetically ordered but in the same time grouped as
 * sections/arms/teams/departments/etc. for everything what it shows from that,
 * and every group will be alphapetically ordered"*.
 *
 * **IT IMPORTS NOTHING OF ANY MODULE'S**, as `viewas/view-as-picker` does: the
 * host hands it the items, each with its place in HR's chart as `group`, as
 * deep as the list needs, and every word. It sorts at every level in the
 * reader's language, so no module sorts its own. A count never orders anything.
 *
 * The typing and the keyboard are HR's `person-picker`, the WAI-ARIA combobox
 * pattern, lifted from there.
 */

/** One heading on an item's way down the chart. A blank one is skipped. */
export interface PickerGroup {
  name_en: string;
  name_ar: string;
}

export interface PickerItem {
  id: string;
  name_en: string;
  name_ar: string;
  /** A second line of words beside the name: a title, or "left on …". */
  detail_en?: string;
  detail_ar?: string;
  /** Department first, then arm or section, then team. None: above the headings. */
  group?: readonly PickerGroup[];
}

/** Every word this control says, supplied by whoever hosts it. */
export interface GroupedPickerWords {
  placeholder: string;
  clear: string;
  none: string;
}

/** One line of the open list: a heading, or something that can be chosen. */
export type PickerRow =
  | { kind: 'group'; key: string; depth: number; label: string }
  | {
      kind: 'item';
      key: string;
      depth: number;
      label: string;
      detail: string;
      path: string;
      item: PickerItem;
    };

function shown(en: string | undefined, ar: string | undefined, arabic: boolean): string {
  return (arabic ? ar || en : en || ar) ?? '';
}

interface Branch {
  label: string;
  items: PickerItem[];
  groups: Map<string, Branch>;
}

/**
 * The list as it is read: at every level the items alphabetically, then the
 * groups alphabetically, each followed by what is under it. `sensitivity: 'base'`
 * is the owner's case-insensitive, and also lets أ and ا sort together; `numeric`
 * puts "Team 10" after "Team 9". Same-named teams in two arms stay two teams.
 */
export function pickerRows(items: readonly PickerItem[], arabic: boolean): PickerRow[] {
  const order = new Intl.Collator(arabic ? 'ar' : 'en', { sensitivity: 'base', numeric: true });
  const root: Branch = { label: '', items: [], groups: new Map() };
  for (const item of items) {
    let at = root;
    for (const group of item.group ?? []) {
      const label = shown(group.name_en, group.name_ar, arabic);
      if (!label) continue;
      const key = label.toLocaleLowerCase(arabic ? 'ar' : 'en');
      let next = at.groups.get(key);
      if (!next) {
        next = { label, items: [], groups: new Map() };
        at.groups.set(key, next);
      }
      at = next;
    }
    at.items.push(item);
  }
  const rows: PickerRow[] = [];
  const walk = (branch: Branch, depth: number, trail: string[]) => {
    const named = branch.items.map((item) => ({
      item,
      label: shown(item.name_en, item.name_ar, arabic) || item.id,
    }));
    named.sort((a, b) => order.compare(a.label, b.label));
    for (const { item, label } of named) {
      rows.push({
        kind: 'item',
        key: `i:${item.id}`,
        depth,
        label,
        detail: shown(item.detail_en, item.detail_ar, arabic),
        path: trail.join(' · '),
        item,
      });
    }
    const groups = [...branch.groups.values()].sort((a, b) => order.compare(a.label, b.label));
    for (const group of groups) {
      const down = [...trail, group.label];
      rows.push({ kind: 'group', key: `g:${down.join('\u0000')}`, depth, label: group.label });
      walk(group, depth + 1, down);
    }
  };
  walk(root, 0, []);
  return rows;
}

/**
 * Folds text for a forgiving search: case, Latin accents, Arabic diacritics and
 * tatweel go; the hamza forms of alef, taa marbuta and alef maqsura meet their
 * plain letters; Arabic-Indic digits read as Western ones. HR's `fold`, as is.
 */
export function foldForSearch(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

let serial = 0;

@Component({
  selector: 'royal-grouped-picker',
  standalone: true,
  templateUrl: './grouped-picker.html',
  styleUrl: './grouped-picker.scss',
})
export class GroupedPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Everything that may be chosen. */
  readonly items = input.required<readonly PickerItem[]>();
  readonly words = input.required<GroupedPickerWords>();
  /** The field's accessible name. */
  readonly label = input.required<string>();
  /** The chosen item's id, or '' for nothing. */
  readonly value = input('');
  /** The reader's language: which names to show, and how to order them. */
  readonly arabic = input(false);
  /** An item's id when one is chosen; '' when the choice is cleared. */
  readonly picked = output<string>();

  private readonly id = `gp${++serial}`;
  protected readonly listId = `${this.id}-list`;

  private readonly chosenName = computed(() => {
    const item = this.items().find((candidate) => candidate.id === this.value());
    return item ? shown(item.name_en, item.name_ar, this.arabic()) : '';
  });

  /** What the field shows: the chosen name until somebody types over it. */
  protected readonly query = linkedSignal(() => this.chosenName());
  private readonly typing = linkedSignal(() => {
    this.chosenName();
    return false;
  });
  protected readonly open = signal(false);
  protected readonly active = signal(-1);

  private readonly index = computed(() =>
    this.items().map((item) => ({
      item,
      text: foldForSearch(
        [
          item.name_en,
          item.name_ar,
          item.detail_en ?? '',
          item.detail_ar ?? '',
          ...(item.group ?? []).flatMap((group) => [group.name_en, group.name_ar]),
        ].join(' '),
      ),
    })),
  );

  protected readonly rows = computed(() => {
    const words = this.typing() ? foldForSearch(this.query()).split(/\s+/).filter(Boolean) : [];
    const matches = this.index()
      .filter((entry) => words.every((word) => entry.text.includes(word)))
      .map((entry) => entry.item);
    return pickerRows(matches, this.arabic());
  });

  /** The rows a key can land on: headings are read past, never chosen. */
  private readonly options = computed(() => this.rows().filter((row) => row.kind === 'item'));

  protected readonly activeKey = computed(() => this.options()[this.active()]?.key ?? null);
  protected readonly activeId = computed(() =>
    this.open() && this.activeKey() ? this.optionId(this.activeKey()!) : null,
  );

  protected optionId(key: string): string {
    return `${this.id}-${key.slice(2).replace(/[^\w-]/g, (c) => c.charCodeAt(0).toString(36))}`;
  }

  protected typed(text: string): void {
    this.query.set(text);
    this.typing.set(true);
    this.open.set(true);
    this.active.set(this.options().length ? 0 : -1);
  }

  /** A press on the field opens the list; it never shuts it under the caret. */
  protected reveal(): void {
    if (!this.open()) this.show();
  }

  protected key(event: KeyboardEvent): void {
    const last = this.options().length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) this.show();
        else this.move(Math.min(this.active() + 1, last));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) this.show();
        else this.move(Math.max(this.active() - 1, 0));
        break;
      case 'Enter':
        if (this.open() && this.active() >= 0 && this.active() <= last) {
          event.preventDefault();
          this.choose(this.options()[this.active()].item);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
        } else if (this.typing()) {
          event.preventDefault();
          this.revert();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  /** Leaving the field keeps the choice as it was; typing alone chooses nothing. */
  protected left(): void {
    this.close();
    this.revert();
  }

  protected choose(item: PickerItem): void {
    this.query.set(shown(item.name_en, item.name_ar, this.arabic()));
    this.typing.set(false);
    this.close();
    this.picked.emit(item.id);
  }

  protected clear(): void {
    this.query.set('');
    this.typing.set(false);
    this.close();
    this.picked.emit('');
    this.host.nativeElement.querySelector('input')?.focus();
  }

  protected hover(key: string): void {
    this.active.set(this.options().findIndex((row) => row.key === key));
  }

  private show(): void {
    this.open.set(true);
    const at = this.options().findIndex(
      (row) => row.kind === 'item' && row.item.id === this.value(),
    );
    this.move(at >= 0 ? at : this.options().length ? 0 : -1);
  }

  private close(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  private revert(): void {
    this.query.set(this.chosenName());
    this.typing.set(false);
  }

  private move(at: number): void {
    this.active.set(at);
    const key = this.activeKey();
    if (!key) return;
    const line = this.host.nativeElement.querySelector(`#${this.optionId(key)}`);
    line?.scrollIntoView?.({ block: 'nearest' });
  }
}
