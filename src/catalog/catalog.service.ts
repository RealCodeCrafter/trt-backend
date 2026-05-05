import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { CatalogItem } from './entities/catalog-item.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogItem)
    private readonly catalogRepository: Repository<CatalogItem>,
    private readonly configService: ConfigService,
  ) {}

  private getImageUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:7000';
    return `${baseUrl}/uploads/catalog/${filename}`;
  }

  private toResponse(item: CatalogItem) {
    return {
      id: item.id,
      trtNo: item.trtNo,
      oemNo: item.oemNo || [],
      ctrNo: item.ctrNo || null,
      lemforderNo: item.lemforderNo || null,
      englishName: item.englishName || '',
      contents: item.contents || null,
      russianName: item.russianName || '',
      carName: item.carName || [],
      model: item.model || [],
      years: item.years || [],
      photo: item.photo || null,
      weightPerPcKg: item.weightPerPcKg ?? null,
      startOfSales: item.startOfSales || null,
      groupName: item.groupName || null,
    };
  }

  private normalizeTrtNo(value: string): string {
    return value.trim().toUpperCase();
  }

  private deletePhotoFile(photoUrl?: string | null): void {
    if (!photoUrl) return;

    try {
      const fileName = photoUrl.includes('/uploads/catalog/')
        ? photoUrl.split('/uploads/catalog/').pop()
        : photoUrl.split('/').pop();

      if (!fileName) return;

      const filePath = join(process.cwd(), 'uploads', 'catalog', fileName);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Fayl o'chirishda xato bo'lsa ham API oqimini to'xtatmaymiz
    }
  }

  async create(dto: CreateCatalogItemDto, photo?: Express.Multer.File) {
    const normalizedTrtNo = this.normalizeTrtNo(dto.trtNo);
    const exists = await this.catalogRepository
      .createQueryBuilder('item')
      .where('LOWER(item.trtNo) = LOWER(:trtNo)', { trtNo: normalizedTrtNo })
      .getOne();

    if (exists) {
      throw new BadRequestException(`TRT No ${normalizedTrtNo} allaqachon mavjud`);
    }

    const item = this.catalogRepository.create({
      trtNo: normalizedTrtNo,
      oemNo: dto.oemNo || [],
      ctrNo: dto.ctrNo,
      lemforderNo: dto.lemforderNo,
      englishName: dto.englishName,
      contents: dto.contents,
      russianName: dto.russianName,
      carName: dto.carName || [],
      model: dto.model || [],
      years: dto.years || [],
      photo: photo ? this.getImageUrl(photo.filename) : undefined,
      weightPerPcKg: dto.weightPerPcKg,
      startOfSales: dto.startOfSales,
      groupName: dto.groupName,
    });

    try {
      const saved = await this.catalogRepository.save(item);
      return this.toResponse(saved);
    } catch (error: any) {
      // PostgreSQL unique violation
      if (error?.code === '23505') {
        throw new BadRequestException(`TRT No ${normalizedTrtNo} allaqachon mavjud`);
      }
      throw error;
    }
  }

  async findAll() {
    const items = await this.catalogRepository.find({ order: { id: 'ASC' } });
    return items.map((item) => this.toResponse(item));
  }

  async findOne(id: number) {
    const item = await this.catalogRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Mahsulot topilmadi');
    return this.toResponse(item);
  }

  async update(id: number, dto: UpdateCatalogItemDto, photo?: Express.Multer.File) {
    const item = await this.catalogRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Mahsulot topilmadi');

    if (dto.trtNo) {
      const normalizedTrtNo = this.normalizeTrtNo(dto.trtNo);
      const duplicate = await this.catalogRepository
        .createQueryBuilder('item')
        .where('LOWER(item.trtNo) = LOWER(:trtNo)', { trtNo: normalizedTrtNo })
        .getOne();
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(`TRT No ${normalizedTrtNo} allaqachon mavjud`);
      }
      item.trtNo = normalizedTrtNo;
    }

    if (dto.oemNo) item.oemNo = dto.oemNo;
    if (dto.ctrNo !== undefined) item.ctrNo = dto.ctrNo;
    if (dto.lemforderNo !== undefined) item.lemforderNo = dto.lemforderNo;
    if (dto.englishName !== undefined) item.englishName = dto.englishName;
    if (dto.contents !== undefined) item.contents = dto.contents;
    if (dto.russianName !== undefined) item.russianName = dto.russianName;
    if (dto.carName) item.carName = dto.carName;
    if (dto.model) item.model = dto.model;
    if (dto.years) item.years = dto.years;
    if (dto.weightPerPcKg !== undefined) item.weightPerPcKg = dto.weightPerPcKg;
    if (dto.startOfSales !== undefined) item.startOfSales = dto.startOfSales;
    if (dto.groupName !== undefined) item.groupName = dto.groupName;
    if (photo) {
      this.deletePhotoFile(item.photo);
      item.photo = this.getImageUrl(photo.filename);
    }

    const updated = await this.catalogRepository.save(item);
    return this.toResponse(updated);
  }

  async remove(id: number) {
    const item = await this.catalogRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Mahsulot topilmadi');
    this.deletePhotoFile(item.photo);
    await this.catalogRepository.delete(id);
    return { message: "Mahsulot o'chirildi" };
  }

  async filter(params: {
    trtNo?: string;
    oemNo?: string;
    ctrNo?: string;
    lemforderNo?: string;
    groupName?: string;
    model?: string;
  }) {
    const queryBuilder = this.catalogRepository
      .createQueryBuilder('item')
      .orderBy('item.id', 'ASC');

    if (params.trtNo) {
      queryBuilder.andWhere('LOWER(item.trtNo) LIKE :trtNo', {
        trtNo: `%${params.trtNo.toLowerCase()}%`,
      });
    }
    if (params.oemNo) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM unnest(item.oemNo) AS oem_item WHERE LOWER(oem_item) LIKE :oemNo)',
        { oemNo: `%${params.oemNo.toLowerCase()}%` },
      );
    }
    if (params.ctrNo) {
      queryBuilder.andWhere('LOWER(item.ctrNo) LIKE :ctrNo', {
        ctrNo: `%${params.ctrNo.toLowerCase()}%`,
      });
    }
    if (params.lemforderNo) {
      queryBuilder.andWhere('LOWER(item.lemforderNo) LIKE :lemforderNo', {
        lemforderNo: `%${params.lemforderNo.toLowerCase()}%`,
      });
    }
    if (params.model) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM unnest(item.model) AS model_item WHERE LOWER(model_item) LIKE :model)',
        { model: `%${params.model.toLowerCase()}%` },
      );
    }
    if (params.groupName) {
      queryBuilder.andWhere('LOWER(item.groupName) LIKE :groupName', {
        groupName: `%${params.groupName.toLowerCase()}%`,
      });
    }

    const items = await queryBuilder.getMany();
    return items.map((item) => this.toResponse(item));
  }
}
