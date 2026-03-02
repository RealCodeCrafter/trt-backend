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
    if (!value) return [];
    
    // Agar string bo'lsa
    if (typeof value === 'string') {
      // PostgreSQL array formatini qayta ishlash: "{3}" yoki "{3,4,5}"
      if (value.startsWith('{') && value.endsWith('}')) {
        const content = value.slice(1, -1).trim();
        if (!content) return [];
        return content.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
      }
      
      // JSON array formatini qayta ishlash: "[3]" yoki "[3,4,5]"
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map(v => typeof v === 'string' ? parseInt(v) : v).filter(v => !isNaN(v));
        }
        return [parseInt(parsed)].filter(v => !isNaN(v));
      } catch {
        // Oddiy raqam string: "3"
        const num = parseInt(value);
        return isNaN(num) ? [] : [num];
      }
    }
    
    // Agar array bo'lsa
    if (Array.isArray(value)) {
      return value.map(v => {
        if (typeof v === 'string') {
          const num = parseInt(v);
          return isNaN(num) ? null : num;
        }
        return typeof v === 'number' ? v : null;
      }).filter(v => v !== null);
    }
    
    // Agar number bo'lsa
    if (typeof value === 'number') {
      return [value];
    }
    
    return [];
  })
  @IsArray()
  @IsOptional()
  categories?: number[];
}