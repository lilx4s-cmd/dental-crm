import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'access_permission';
export const Permission = (key: string) => SetMetadata(PERMISSION_KEY, key);
