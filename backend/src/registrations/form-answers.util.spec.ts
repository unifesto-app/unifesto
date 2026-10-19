import {
  checkAnswers,
  checkFieldDefinition,
  formatAnswer,
  formUploadPrefix,
  visibleFieldIds,
  type FormFieldLike,
} from './form-answers.util';

const f = (
  over: Partial<FormFieldLike> & Pick<FormFieldLike, 'id' | 'type'>,
): FormFieldLike => ({
  label: over.id,
  options: [],
  isRequired: false,
  order: 0,
  ...over,
});

const opts = { eventId: 'ev1', enforceRequired: true, uploaderIds: ['u1'] };

describe('checkAnswers', () => {
  it('normalises typed answers', () => {
    const fields = [
      f({ id: 'n', type: 'NUMBER' }),
      f({ id: 'y', type: 'YES_NO' }),
      f({ id: 'u', type: 'URL' }),
      f({ id: 'd', type: 'DATE' }),
      f({ id: 'r', type: 'RATING', config: { scale: 10 } }),
      f({ id: 'c', type: 'CHECKBOX', options: ['A', 'B', 'C'] }),
      f({ id: 's', type: 'STATE' }),
    ];
    const { answers, errors } = checkAnswers(
      fields,
      {
        n: '42',
        y: 'yes',
        u: 'github.com/me',
        d: '2026-02-28',
        r: '9',
        c: 'A; C',
        s: 'Telangana',
      },
      opts,
    );
    expect(errors).toEqual([]);
    expect(answers).toEqual({
      n: 42,
      y: true,
      u: 'https://github.com/me',
      d: '2026-02-28',
      r: 9,
      c: ['A', 'C'],
      s: 'Telangana',
    });
  });

  it('takes decimal and negative numbers (CGPA 8.5)', () => {
    const fields = [
      f({ id: 'g', type: 'NUMBER', config: { min: 0, max: 10 } }),
      f({ id: 't', type: 'NUMBER' }),
    ];
    const { answers, errors } = checkAnswers(fields, { g: '8.5', t: -3 }, opts);
    expect(errors).toEqual([]);
    expect(answers).toEqual({ g: 8.5, t: -3 });
  });

  it('rejects answers outside the rules', () => {
    const fields = [
      f({ id: 'd', type: 'DATE', config: { minDate: '2026-01-01' } }),
      f({ id: 'e', type: 'EMAIL' }),
      f({ id: 'sel', type: 'SELECT', options: ['X'] }),
      f({ id: 'r', type: 'RATING' }),
      f({ id: 't', type: 'TEXT', config: { maxLength: 3 } }),
      f({
        id: 'c',
        type: 'CHECKBOX',
        options: ['A', 'B'],
        config: { maxPicks: 1 },
      }),
      f({ id: 'bad', type: 'DATE' }),
    ];
    const { errors } = checkAnswers(
      fields,
      {
        d: '2025-12-31',
        e: 'nope',
        sel: 'Y',
        r: 6,
        t: 'long',
        c: ['A', 'B'],
        bad: '2026-02-30',
      },
      opts,
    );
    expect(errors).toHaveLength(7);
  });

  it('enforces required only for visible questions, and only when asked', () => {
    const fields = [
      f({ id: 'acc', type: 'YES_NO', order: 0 }),
      f({
        id: 'dates',
        type: 'TEXT',
        isRequired: true,
        order: 1,
        showIf: { fieldId: 'acc', anyOf: ['Yes'] },
      }),
    ];
    expect(checkAnswers(fields, { acc: false }, opts).errors).toEqual([]);
    expect(checkAnswers(fields, { acc: true }, opts).errors).toEqual([
      'dates is required.',
    ]);
    expect(
      checkAnswers(fields, { acc: true }, { ...opts, enforceRequired: false })
        .errors,
    ).toEqual([]);
  });

  it('drops hidden answers and section headings, keeps unknown keys', () => {
    const fields = [
      f({ id: 'h', type: 'SECTION' }),
      f({ id: 'acc', type: 'YES_NO', order: 1 }),
      f({
        id: 'why',
        type: 'TEXT',
        order: 2,
        showIf: { fieldId: 'acc', anyOf: ['Yes'] },
      }),
    ];
    const { answers } = checkAnswers(
      fields,
      { h: 'x', acc: false, why: 'stale', gender: 'Female' },
      opts,
    );
    expect(answers).toEqual({ acc: false, gender: 'Female' });
  });

  it('requires a required consent tick to be ticked', () => {
    const fields = [f({ id: 'ok', type: 'YES_NO', isRequired: true })];
    expect(checkAnswers(fields, { ok: false }, opts).errors).toEqual([
      'ok is required.',
    ]);
    expect(checkAnswers(fields, { ok: true }, opts).errors).toEqual([]);
  });

  it('accepts legacy `true` on an option checkbox', () => {
    const fields = [f({ id: 'c', type: 'CHECKBOX', options: ['A'] })];
    expect(checkAnswers(fields, { c: true }, opts)).toEqual({
      answers: { c: true },
      errors: [],
    });
  });

  it('only accepts files this person uploaded for this question', () => {
    const fields = [f({ id: 'cv', type: 'FILE' })];
    const mine = {
      key: `${formUploadPrefix('ev1', 'cv', 'u1')}a.pdf`,
      name: 'cv.pdf',
      size: 10,
      mime: 'application/pdf',
    };
    const theirs = {
      ...mine,
      key: `${formUploadPrefix('ev1', 'cv', 'u2')}a.pdf`,
    };
    const otherQ = {
      ...mine,
      key: `${formUploadPrefix('ev1', 'other', 'u1')}a.pdf`,
    };
    expect(checkAnswers(fields, { cv: mine }, opts).errors).toEqual([]);
    expect(checkAnswers(fields, { cv: theirs }, opts).errors).toHaveLength(1);
    expect(checkAnswers(fields, { cv: otherQ }, opts).errors).toHaveLength(1);
    expect(
      checkAnswers(fields, { cv: 'https://evil' }, opts).errors,
    ).toHaveLength(1);
  });
});

describe('visibleFieldIds', () => {
  it('hides a chain when its root is hidden', () => {
    const fields = [
      f({ id: 'a', type: 'SELECT', options: ['1', '2'], order: 0 }),
      f({
        id: 'b',
        type: 'RADIO',
        options: ['x'],
        order: 1,
        showIf: { fieldId: 'a', anyOf: ['1'] },
      }),
      f({
        id: 'c',
        type: 'TEXT',
        order: 2,
        showIf: { fieldId: 'b', anyOf: ['x'] },
      }),
    ];
    expect([...visibleFieldIds(fields, { a: '2', b: 'x' })]).toEqual(['a']);
    expect([...visibleFieldIds(fields, { a: '1', b: 'x' })]).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('checkFieldDefinition', () => {
  const parent = f({ id: 'p', type: 'YES_NO', order: 0, perGroup: false });
  const base = {
    type: 'TEXT' as const,
    options: [],
    perGroup: false,
    order: 1,
  };

  it('accepts a valid show-if', () => {
    expect(
      checkFieldDefinition(
        { ...base, showIf: { fieldId: 'p', anyOf: ['Yes'] } },
        [parent],
      ),
    ).toBeNull();
  });

  it('rejects bad definitions', () => {
    expect(checkFieldDefinition({ ...base, type: 'SELECT' }, [])).toMatch(
      /option/,
    );
    expect(
      checkFieldDefinition({ ...base, config: { min: 5, max: 1 } }, []),
    ).toMatch(/minimum/);
    expect(
      checkFieldDefinition(
        { ...base, type: 'FILE', config: { maxSizeMb: 50 } },
        [],
      ),
    ).toMatch(/1 to 10/);
    expect(
      checkFieldDefinition(
        { ...base, order: 0, showIf: { fieldId: 'p', anyOf: ['Yes'] } },
        [parent],
      ),
    ).toMatch(/earlier/);
    expect(
      checkFieldDefinition(
        { ...base, showIf: { fieldId: 'p', anyOf: ['Maybe'] } },
        [parent],
      ),
    ).toMatch(/options/);
    expect(
      checkFieldDefinition(
        { ...base, perGroup: true, showIf: { fieldId: 'p', anyOf: ['Yes'] } },
        [parent],
      ),
    ).toMatch(/same way/);
  });
});

describe('formatAnswer', () => {
  it('renders every stored shape as text', () => {
    expect(formatAnswer(true)).toBe('Yes');
    expect(formatAnswer(['A', 'B'])).toBe('A; B');
    expect(formatAnswer({ key: 'k', name: 'cv.pdf' })).toBe('cv.pdf');
    expect(formatAnswer(4)).toBe('4');
  });
});
