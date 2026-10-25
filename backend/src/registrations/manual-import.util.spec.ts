import {
  buildTemplateSpec,
  parseCsv,
  parseImportRows,
  MAX_IMPORT_ROWS,
  type ImportFormField,
  type ImportTicketShape,
} from './manual-import.util';

/** Terse form-field builder for fixtures. */
const ff = (
  id: string,
  label: string,
  required = false,
  perGroup = false,
): ImportFormField => ({ id, label, required, perGroup });

const individual: ImportTicketShape = {
  kind: 'INDIVIDUAL',
  minGroupSize: null,
  maxGroupSize: null,
  formFields: [],
};

const withFields: ImportTicketShape = {
  kind: 'INDIVIDUAL',
  minGroupSize: null,
  maxGroupSize: null,
  formFields: [ff('f1', 'T-shirt size', true), ff('f2', 'Company')],
};

const group: ImportTicketShape = {
  kind: 'GROUP',
  minGroupSize: 2,
  maxGroupSize: 3,
  formFields: [],
};

describe('parseCsv', () => {
  it('parses quoted cells with embedded commas and newlines', () => {
    const csv = 'Name,Note\r\n"Rao, Asha","line1\nline2"\r\n';
    expect(parseCsv(csv)).toEqual([
      ['Name', 'Note'],
      ['Rao, Asha', 'line1\nline2'],
    ]);
  });

  it('handles escaped double-quotes and strips a BOM', () => {
    const csv = '﻿Name\r\n"She said ""hi"""';
    expect(parseCsv(csv)).toEqual([['Name'], ['She said "hi"']]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('Name\n\n\nAsha\n')).toEqual([['Name'], ['Asha']]);
  });
});

describe('buildTemplateSpec', () => {
  it('emits core columns for an individual ticket', () => {
    const { header } = buildTemplateSpec(individual);
    expect(header).toEqual(['Name', 'Email', 'Mobile']);
  });

  it('marks required form fields with an asterisk and appends field columns', () => {
    const { header } = buildTemplateSpec(withFields);
    expect(header).toEqual(['Name', 'Email', 'Mobile', 'T-shirt size *', 'Company']);
  });

  it('adds group-size + bounded member columns for a group ticket', () => {
    const { header } = buildTemplateSpec(group);
    // maxGroupSize 3 → lead + 2 extra members → members 2 and 3.
    expect(header).toEqual([
      'Name',
      'Email',
      'Mobile',
      'Group Size',
      'Member 2 Name',
      'Member 2 Email',
      'Member 2 Mobile',
      'Member 3 Name',
      'Member 3 Email',
      'Member 3 Mobile',
    ]);
  });

  it('repeats PER-MEMBER field columns per member for a group ticket', () => {
    const groupWithFields: ImportTicketShape = {
      ...group,
      formFields: [ff('f1', 'T-shirt size', true)],
    };
    const { header } = buildTemplateSpec(groupWithFields);
    expect(header).toEqual([
      'Name',
      'Email',
      'Mobile',
      'T-shirt size *',
      'Group Size',
      'Member 2 Name',
      'Member 2 Email',
      'Member 2 Mobile',
      'Member 2 T-shirt size *',
      'Member 3 Name',
      'Member 3 Email',
      'Member 3 Mobile',
      'Member 3 T-shirt size *',
    ]);
  });

  it('places a PER-GROUP field once, next to Group Size, not per member', () => {
    const groupWithTeamField: ImportTicketShape = {
      ...group,
      maxGroupSize: 2, // lead + 1 extra member
      formFields: [ff('t1', 'Team Name', true, true)],
    };
    const { header } = buildTemplateSpec(groupWithTeamField);
    expect(header).toEqual([
      'Name',
      'Email',
      'Mobile',
      'Group Size',
      'Team Name *',
      'Member 2 Name',
      'Member 2 Email',
      'Member 2 Mobile',
    ]);
  });
});

describe('parseImportRows', () => {
  it('errors a row with an invalid email but keeps good rows', () => {
    const matrix = parseCsv(
      'Name,Email,Mobile\nAsha,asha@example.com,9876543210\nBad,not-an-email,9000000000\n',
    );
    const { rows } = parseImportRows(individual, matrix);
    expect(rows[0].email).toBe('asha@example.com');
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toMatch(/Invalid or missing email/);
  });

  it('requires a valid 10-digit mobile', () => {
    const matrix = parseCsv('Name,Email,Mobile\nAsha,asha@example.com,\n');
    const { rows } = parseImportRows(individual, matrix);
    expect(rows[0].error).toMatch(/mobile/i);
  });

  it('caps one import at MAX_IMPORT_ROWS rows (J5)', () => {
    const row = (i: number) => `P${i},p${i}@example.com,9876543210`;
    const csv = (n: number) => ['Name,Email,Mobile', ...Array.from({ length: n }, (_, i) => row(i))].join('\n');
    expect(parseImportRows(individual, parseCsv(csv(MAX_IMPORT_ROWS))).fileError).toBeUndefined();
    const over = parseImportRows(individual, parseCsv(csv(MAX_IMPORT_ROWS + 1)));
    expect(over.rows).toEqual([]);
    expect(over.fileError).toMatch(/1,001 attendee rows\. Import up to 1,000 at a time/);
  });

  it('rejects a file missing the Name/Email header', () => {
    const { fileError } = parseImportRows(individual, parseCsv('Foo,Bar\n1,2\n'));
    expect(fileError).toMatch(/missing the required/);
  });

  it('keys form responses by field id, not label, and enforces required fields', () => {
    const matrix = parseCsv(
      'Name,Email,Mobile,T-shirt size,Company\n' +
        'Asha,asha@example.com,9876543210,L,Acme\n' +
        'Ravi,ravi@example.com,9000000000,,Beta\n',
    );
    const { rows } = parseImportRows(withFields, matrix);
    expect(rows[0].formResponses).toEqual({ f1: 'L', f2: 'Acme' });
    // Row 2 omits the required T-shirt size → errored.
    expect(rows[1].error).toMatch(/Missing required field/);
  });

  it('is order-insensitive on columns', () => {
    const matrix = parseCsv('Email,Mobile,Name\nasha@example.com,9876543210,Asha\n');
    const { rows } = parseImportRows(individual, matrix);
    expect(rows[0]).toMatchObject({ name: 'Asha', email: 'asha@example.com' });
  });

  it('captures a group with the lead as member 1 and validates size bounds', () => {
    const header = 'Name,Email,Mobile,Group Size,Member 2 Name,Member 2 Email';
    const matrix = parseCsv(
      `${header}\nAsha,asha@example.com,9876543210,2,Ravi,ravi@example.com\n`,
    );
    const { rows } = parseImportRows(group, matrix);
    expect(rows[0].groupSize).toBe(2);
    expect(rows[0].groupMembers).toEqual([
      { name: 'Asha', email: 'asha@example.com', mobile: '9876543210', customFields: {} },
      { name: 'Ravi', email: 'ravi@example.com', mobile: null, customFields: {} },
    ]);
  });

  it('captures PER-MEMBER fields on each member, keyed by field id', () => {
    const groupWithFields: ImportTicketShape = {
      ...group,
      formFields: [ff('f1', 'T-shirt size', true)],
    };
    const header =
      'Name,Email,Mobile,T-shirt size,Group Size,Member 2 Name,Member 2 Email,Member 2 T-shirt size';
    const matrix = parseCsv(
      `${header}\nAsha,asha@example.com,9876543210,L,2,Ravi,ravi@example.com,M\n`,
    );
    const { rows } = parseImportRows(groupWithFields, matrix);
    // Registration-level bag holds no per-member answers.
    expect(rows[0].formResponses).toEqual({});
    expect(rows[0].groupMembers).toEqual([
      { name: 'Asha', email: 'asha@example.com', mobile: '9876543210', customFields: { f1: 'L' } },
      { name: 'Ravi', email: 'ravi@example.com', mobile: null, customFields: { f1: 'M' } },
    ]);
  });

  it('captures a PER-GROUP field once at the registration level', () => {
    const groupWithTeamField: ImportTicketShape = {
      ...group,
      formFields: [ff('t1', 'Team Name', true, true)],
    };
    const header =
      'Name,Email,Mobile,Group Size,Team Name,Member 2 Name,Member 2 Email';
    const matrix = parseCsv(
      `${header}\nAsha,asha@example.com,9876543210,2,Rockets,Ravi,ravi@example.com\n`,
    );
    const { rows } = parseImportRows(groupWithTeamField, matrix);
    // Team-wide answer lives on the registration, not on any member.
    expect(rows[0].formResponses).toEqual({ t1: 'Rockets' });
    expect(rows[0].groupMembers?.every((m) => Object.keys(m.customFields ?? {}).length === 0)).toBe(
      true,
    );
  });

  it('errors when a present group member omits their required per-member field', () => {
    const groupWithFields: ImportTicketShape = {
      ...group,
      formFields: [ff('f1', 'T-shirt size', true)],
    };
    const header =
      'Name,Email,Mobile,T-shirt size,Group Size,Member 2 Name,Member 2 Email,Member 2 T-shirt size';
    const matrix = parseCsv(
      `${header}\nAsha,asha@example.com,9876543210,L,2,Ravi,ravi@example.com,\n`,
    );
    const { rows } = parseImportRows(groupWithFields, matrix);
    expect(rows[0].error).toMatch(/Member 2 is missing required field/);
  });

  it('errors when the required PER-GROUP field is blank', () => {
    const groupWithTeamField: ImportTicketShape = {
      ...group,
      formFields: [ff('t1', 'Team Name', true, true)],
    };
    const header = 'Name,Email,Mobile,Group Size,Team Name';
    const matrix = parseCsv(
      `${header}\nAsha,asha@example.com,9876543210,2,\n`,
    );
    const { rows } = parseImportRows(groupWithTeamField, matrix);
    expect(rows[0].error).toMatch(/Missing required team field/);
  });

  it('errors a group whose declared size is out of bounds', () => {
    const matrix = parseCsv('Name,Email,Mobile,Group Size\nAsha,asha@example.com,9876543210,9\n');
    const { rows } = parseImportRows(group, matrix);
    expect(rows[0].error).toMatch(/Group size 9 is outside/);
  });
});
