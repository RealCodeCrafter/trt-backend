import { Transform } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
  }

  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    }
  } catch {
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }

  return [];
}

export class CreateCatalogItemDto {
  @IsString()
  @IsNotEmpty()
  trtNo: string;

  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsOptional()
  oemNo?: string[];

  @IsString()
  @IsOptional()
  ctrNo?: string;

  @IsString()
  @IsOptional()
  lemforderNo?: string;

  @IsString()
  @IsNotEmpty()
  englishName: string;

  @IsString()
  @IsOptional()
  contents?: string;

  @IsString()
  @IsNotEmpty()
  russianName: string;

  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsOptional()
  carName?: string[];

  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsOptional()
  model?: string[];

  @Transform(({ value }) => parseStringArray(value))
  @IsArray()
  @IsOptional()
  years?: string[];

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsOptional()
  weightPerPcKg?: number;

  @IsString()
  @IsOptional()
  startOfSales?: string;

  @Transform(({ value }) => parseNumberArray(value))
  @IsArray()
  @IsOptional()
  categoryIds?: number[];

  @IsString()
  @IsOptional()
  groupName?: string;
}
