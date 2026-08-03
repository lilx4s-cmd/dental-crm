import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { passwordProblems, type PasswordContext } from '@dental-crm/shared';

/**
 * `@IsStrongPassword()` — the shared password policy as a DTO decorator.
 *
 * A thin adapter, deliberately: the rules themselves live in
 * `packages/shared/src/access/password-policy.ts` so the login form can show the same ones the
 * API enforces. Two copies is how a form ends up promising something the server refuses.
 *
 * The whole DTO is passed as context, so a password containing the user's own name or email is
 * rejected on the request that sets it rather than needing a second lookup.
 */
@ValidatorConstraint({ name: 'isStrongPassword', async: false })
class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return passwordProblems(value, this.contextFrom(args)).length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const value = typeof args.value === 'string' ? args.value : '';
    // Every reason at once. A user told "too short", who fixes that and is then told "too common",
    // stops trusting the form.
    return passwordProblems(value, this.contextFrom(args)).join(' ');
  }

  private contextFrom(args: ValidationArguments): PasswordContext {
    const object = (args.object ?? {}) as Record<string, unknown>;
    const str = (key: string) => (typeof object[key] === 'string' ? (object[key] as string) : undefined);
    return { email: str('email'), firstName: str('firstName'), lastName: str('lastName') };
  }
}

export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
