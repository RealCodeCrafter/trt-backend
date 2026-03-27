// analytics.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Kunlik statistika
  @Get('daily')
  @ApiResponse({ status: 200, description: 'Har kunlik sayt statistika' })
  async getDaily(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.analyticsService.getAnalytics(1, l); // 1 kun
  }

  // Oylik statistika
  @Get('monthly')
  @ApiResponse({ status: 200, description: 'Har oylik sayt statistika' })
  async getMonthly(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    return await this.analyticsService.getAnalytics(30, l); // 30 kun
  }
}