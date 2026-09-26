import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('favorites')
  @ApiOperation({ summary: 'List my favourited events (newest first)' })
  getFavorites(@Request() req) {
    return this.favoritesService.getFavorites(req.user.id);
  }

  @Get('favorites/ids')
  @ApiOperation({ summary: 'Ids of my favourited events (for marking hearts)' })
  getFavoriteIds(@Request() req) {
    return this.favoritesService.getFavoriteIds(req.user.id);
  }

  @Post('events/:id/favorite')
  @ApiOperation({ summary: 'Add an event to my favourites' })
  addFavorite(@Request() req, @Param('id') id: string) {
    return this.favoritesService.addFavorite(req.user.id, id);
  }

  @Delete('events/:id/favorite')
  @ApiOperation({ summary: 'Remove an event from my favourites' })
  removeFavorite(@Request() req, @Param('id') id: string) {
    return this.favoritesService.removeFavorite(req.user.id, id);
  }
}
