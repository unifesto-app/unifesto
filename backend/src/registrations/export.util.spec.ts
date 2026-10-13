import { buildExportFile } from './export.util';

describe('attendee CSV export', () => {
  it('neutralises formulas in attendee-typed cells but keeps phone numbers', async () => {
    const file = await buildExportFile('csv', 'T', ['Name', 'Phone'], [['=HYPERLINK("x")', '+91 98765 43210']]);
    expect(file.buffer.toString('utf8')).toBe('﻿Name,Phone\r\n"\'=HYPERLINK(""x"")",+91 98765 43210');
  });
});
