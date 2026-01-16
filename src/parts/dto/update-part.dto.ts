import { IsString, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePartDto {
  @IsString()
  @IsOptional()
  sku?: string;

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
    en: { name?: string };
    ru: { name?: string };
  };

  @IsArray()
  @IsOptional()
  images?: string[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value ? [value] : [];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsArray()
  @IsOptional()
  carName?: string[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value ? [value] : [];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsArray()
  @IsOptional()
  model?: string[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value ? [value] : [];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsArray()
  @IsOptional()
  oem?: string[];

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value ? [value] : [];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsArray()
  @IsOptional()
  years?: string[];

  @IsString()
  @IsOptional()
  trtCode?: string;

  @IsString()
  @IsOptional()
  brand?: string;

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
  categories?: number[];
}