// eslint-disable-next-line no-restricted-imports -- the one sanctioned wrapper
import {
  OnEvent as NestOnEvent,
  type OnEventOptions,
} from '@nestjs/event-emitter';
import { reportError } from './observability';

/**
 * Drop-in for `@nestjs/event-emitter`'s `@OnEvent` that also sends a listener
 * failure to Sentry. Nest's own wrapper only logs it (suppressErrors defaults
 * to true), so a broken notification handler never paged anyone.
 */
export function OnEvent(
  event: string,
  options?: OnEventOptions,
): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    const fn = descriptor.value as (...args: unknown[]) => unknown;
    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        reportError(err, {
          listener: `${target.constructor.name}.${String(key)}`,
          event,
        });
        throw err; // Nest still logs it (or rethrows when suppressErrors is false)
      }
    };
    // After the swap: OnEvent stores its metadata on descriptor.value.
    return NestOnEvent(event, options)(target, key, descriptor);
  };
}
