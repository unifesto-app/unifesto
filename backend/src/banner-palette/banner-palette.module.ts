import { Module } from '@nestjs/common';
import { BannerPaletteService } from './banner-palette.service';

// Shared by events and spaces (mobile detail-page background). One provider so
// both share the per-URL cache.
@Module({
  providers: [BannerPaletteService],
  exports: [BannerPaletteService],
})
export class BannerPaletteModule {}
