import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderProductImagesDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  position: number;
}
