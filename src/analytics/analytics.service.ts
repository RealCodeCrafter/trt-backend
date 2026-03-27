// analytics.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';

type Summary = {
  activeUsers: number | null;
  pageViews: number | null;
  eventCount: number | null;
};

type CountryStats = {
  country: string;
  users: number;
};

type AnalyticsResponse = {
  range: { startDate: string; endDate: string };
  summary: Summary;
  topPages: { pagePath: string; pageViews: number }[];
  byCountry: CountryStats[];
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly configService: ConfigService) {}

  private getGa4Property(): string {
    const prop = this.configService.get<string>('GA4_PROPERTY_ID');
    if (!prop) throw new BadRequestException('GA4_PROPERTY_ID env sozlanmagan');
    return prop.startsWith('properties/') ? prop : `properties/${prop}`;
  }

  private getServiceAccountCredentials(): object {
    const jsonString = this.configService.get<string>('GA4_SERVICE_ACCOUNT_JSON');
    if (jsonString) return JSON.parse(jsonString);

    const file = this.configService.get<string>('GA4_SERVICE_ACCOUNT_FILE') || this.configService.get<string>('GA4_SERVICE_ACCOUNT_PATH');
    if (!file) throw new BadRequestException('GA4_SERVICE_ACCOUNT_FILE yoki GA4_SERVICE_ACCOUNT_PATH env sozlanmagan');

    const fullPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  }

  private toYyyyMmDd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private parseNumber(value: string | undefined): number | null {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // Kunlik statistika (pastga `days = 1`) yoki oylik (pastga `days = 30`) uchun ishlatiladi
  async getAnalytics(days: number = 7, topLimit: number = 10): Promise<AnalyticsResponse> {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startDate = this.toYyyyMmDd(start);
    const endDate = this.toYyyyMmDd(end);

    const property = this.getGa4Property();
    const credentials = this.getServiceAccountCredentials();

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const analyticsData = google.analyticsdata('v1beta');
    const authClient = await auth.getClient();

    // 1) Umumiy statistika
    const summaryResp = await analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'eventCount' },
        ],
      },
      auth: authClient as any,
    });

    const firstRow = summaryResp.data?.rows?.[0];
    const summary: Summary = {
      activeUsers: this.parseNumber(firstRow?.metricValues?.[0]?.value),
      pageViews: this.parseNumber(firstRow?.metricValues?.[1]?.value),
      eventCount: this.parseNumber(firstRow?.metricValues?.[2]?.value),
    };

    // 2) Top sahifalar
    const pagesResp = await analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: topLimit,
      },
      auth: authClient as any,
    });

    const topPages = (pagesResp.data.rows || []).map(r => ({
      pagePath: r.dimensionValues?.[0]?.value || '(unknown)',
      pageViews: Number(r.metricValues?.[0]?.value || 0),
    }));

    // 3) Country bo‘yicha statistika
    const countryResp = await analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      },
      auth: authClient as any,
    });

    const byCountry: CountryStats[] = (countryResp.data.rows || []).map(r => ({
      country: r.dimensionValues?.[0]?.value || '(unknown)',
      users: Number(r.metricValues?.[0]?.value || 0),
    }));

    return { range: { startDate, endDate }, summary, topPages, byCountry };
  }
}