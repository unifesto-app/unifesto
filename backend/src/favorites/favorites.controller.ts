import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('favorites')
  getFavorites(@Request() req) {
    return this.favoritesService.getFavorites(req.user.id);
  }

  @Get('favorites/ids')
  getFavoriteIds(@Request() req) {
    return this.favoritesService.getFavoriteIds(req.user.id);
  }

  @Post('events/:id/favorite')
  addFavorite(@Request() req, @Param('id') id: string) {
    return this.favoritesService.addFavorite(req.user.id, id);
  }

  @Delete('events/:id/favorite')
  removeFavorite(@Request() req, @Param('id') id: string) {
    return this.favoritesService.removeFavorite(req.user.id, id);
  }
}
