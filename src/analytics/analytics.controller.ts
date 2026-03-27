import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('stats')
  @ApiResponse({ status: 200, description: 'Kunlik va oylik statistikani qaytaradi' })
  async getStats() {
    const daily = await this.analyticsService.getAnalytics(1); // Kunlik
    const monthly = await this.analyticsService.getAnalytics(30); // Oylik (shu oy boshidan hozirgacha)

    return { daily, monthly };
  }
}