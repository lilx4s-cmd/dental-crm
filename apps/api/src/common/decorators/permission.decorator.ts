import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'access_permission';
export const Permission = (key: string) => SetMetadata(PERMISSION_KEY, key);
export const ROLE_BOUNDARY_KEY = 'preserve_role_boundary';
/** Root-prefix controllers must honour profile denials without widening their original role boundary. */
export const RoleBoundary = () => SetMetadata(ROLE_BOUNDARY_KEY, true);
