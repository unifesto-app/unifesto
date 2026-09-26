import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { UpdateGroupMembersDto } from './index';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('UpdateGroupMembersDto through the global ValidationPipe', () => {
  it('keeps member objects and null gaps intact', async () => {
    const lead = { name: 'Lead', email: 'l@x.com', mobile: '9000000000', gender: 'Male', customFields: { a: 1 } };
    const third = { name: 'C', email: 'c@x.com', mobile: '9000000001', gender: 'Female', customFields: {} };
    const out = await pipe.transform(
      { groupMembers: [lead, null, third] },
      { type: 'body', metatype: UpdateGroupMembersDto },
    );
    // Regression: implicit conversion used to turn each object into [].
    expect(out.groupMembers).toEqual([lead, null, third]);
  });
});
