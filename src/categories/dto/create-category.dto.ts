import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
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
  @IsNotEmpty()
  translations: {
    en: { name: string; description?: string };
    ru: { name: string; description?: string };
  };

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