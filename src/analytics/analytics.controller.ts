import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily')
  @ApiResponse({ status: 200, description: 'Har kunlik sayt statistika' })
  async getDaily(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.analyticsService.getAnalytics(1, l);
  }

  @Get('monthly')
  @ApiResponse({ status: 200, description: 'Har oylik sayt statistika' })
  async getMonthly(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.analyticsService.getAnalytics(30, l);
  }

  // /analytics/widget endpoint: HTML faylini o‘zgartirmasdan ishlashi uchun
  @Get('widget')
  @ApiResponse({ status: 200, description: 'Oxirgi 7 kunlik statistikani qaytaradi' })
  async getWidget(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = days ? parseInt(days, 10) : 7;
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.analyticsService.getAnalytics(d, l);
  }
}