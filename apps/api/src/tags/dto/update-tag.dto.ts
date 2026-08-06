import { PartialType } from '@nestjs/swagger';
import { CreateTagDto } from './create-tag.dto';

/**
 * Every field optional: a recolour should not require restating the name, and restating a name
 * unchanged would fail its own uniqueness check unless the check excluded the row being edited.
 */
export class UpdateTagDto extends PartialType(CreateTagDto) {}
