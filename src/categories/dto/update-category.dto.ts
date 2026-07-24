import { IsString, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCategoryDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsOptional()
  translations?: {
    en: { name?: string; description?: string };
    ru: { name?: string; description?: string };
  };

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : undefined;
  })
  @IsArray()
  @IsOptional()
  images?: string[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value ? [parseInt(value)] : [];
      }
    }
    return Array.isArray(value) ? value.map(v => typeof v === 'string' ? parseInt(v) : v) : value ? [parseInt(value)] : [];
  })
  @IsArray()
  @IsOptional()
  parts?: number[];
}

