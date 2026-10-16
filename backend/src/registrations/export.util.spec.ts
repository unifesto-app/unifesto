import { csvFile } from './export.util';

describe('attendee CSV export', () => {
  it('neutralises formulas in attendee-typed cells but keeps phone numbers', () => {
    const buffer = csvFile(['Name', 'Phone'], [['=HYPERLINK("x")', '+91 98765 43210']]);
    expect(buffer.toString('utf8')).toBe('\uFEFFName,Phone\r\n"\'=HYPERLINK(""x"")",+91 98765 43210');
  });
});
