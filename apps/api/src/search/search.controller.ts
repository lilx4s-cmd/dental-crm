import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ALL_STAFF, type JwtPayload } from '@dental-crm/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
// Open to every staff role, because the *results* are scoped rather than the endpoint: a sales
// consultant reaching this gets leads and no patients. Gating the route by role instead would mean
// reception could not search at all, which is the opposite of the point.
@Roles(...ALL_STAFF)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search leads and patients the caller is allowed to see' })
  search(@Query('q') q: string, @CurrentUser() user: JwtPayload) {
    return this.searchService.search(q ?? '', user);
  }
}
