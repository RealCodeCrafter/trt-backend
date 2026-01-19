import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Part } from './entities/part.entity';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { Category } from '../categories/entities/category.entity';
import * as path from 'path';
import * as fs from 'fs';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PartsService {
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'parts');

  constructor(
    @InjectRepository(Part)
    private readonly partsRepository: Repository<Part>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly configService: ConfigService,
  ) {
    // Upload papkalarni yaratish
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private getImageUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:7000';
    return `${baseUrl}/uploads/parts/${filename}`;
  }

  private deleteImageFile(imageUrl: string): void {
    if (!imageUrl) return;
    
    try {
      // URL dan fayl nomini olish (to'liq URL yoki relative path)
      const fileName = imageUrl.includes('/uploads/') 
        ? imageUrl.split('/uploads/parts/').pop() || imageUrl.split('/').pop()
        : imageUrl.split('/').pop();
      if (fileName) {
        const filePath = join(this.uploadsDir, fileName);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
    } catch (error) {
      // Production xavfsizligi uchun xatolikni console'ga chiqarmaymiz
    }
  }

  private deleteImageArray(images: string[]): void {
    if (!images || !Array.isArray(images)) return;
    
    images.forEach(imageUrl => {
      this.deleteImageFile(imageUrl);
    });
  }

  async create(createPartDto: CreatePartDto, files?: Express.Multer.File[]) {
    const existingPart = await this.partsRepository.findOne({
      where: { trtCode: createPartDto.trtCode },
    });

    if (existingPart) {
      throw new BadRequestException(`TRT kodi ${createPartDto.trtCode} bilan qism allaqachon mavjud`);
    }

    const categories = createPartDto.categories && createPartDto.categories.length > 0
      ? await this.categoriesRepository.findBy({ id: In(createPartDto.categories) })
      : [];

    if (createPartDto.categories && categories.length !== createPartDto.categories.length) {
      throw new NotFoundException('Ba\'zi kategoriyalar topilmadi');
    }

    // Agar rasmlar yuklangan bo'lsa, images array ni yaratish
    let images: string[] = createPartDto.images || [];
    if (files && files.length > 0) {
      images = files.map(file => this.getImageUrl(file.filename));
    }

    const part = this.partsRepository.create({
      ...createPartDto,
      images,
      categories,
    });

    const savedPart = await this.partsRepository.save(part);

    return {
      id: savedPart.id,
      sku: savedPart.sku,
      translations: savedPart.translations,
      images: savedPart.images,
      carName: savedPart.carName,
      model: savedPart.model,
      oem: savedPart.oem,
      years: savedPart.years,
      trtCode: savedPart.trtCode,
      brand: savedPart.brand,
      categories: savedPart.categories.map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    };
  }

  async findAll() {
    const parts = await this.partsRepository.find({
      relations: ['categories'],
      order: { id: 'ASC' },
    });

    if (!parts.length) {
      throw new NotFoundException('Hech qanday qism topilmadi');
    }

    return parts.map(part => ({
      id: part.id,
      sku: part.sku,
      translations: part.translations,
      images: part.images,
      carName: part.carName,
      model: part.model,
      oem: part.oem,
      years: part.years,
      trtCode: part.trtCode,
      brand: part.brand,
      categories: part.categories.map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    }));
  }

  async findOne(id: number) {
    const part = await this.partsRepository.findOne({ where: { id }, relations: ['categories'] });
    if (!part) {
      throw new NotFoundException(`ID ${id} bilan qism topilmadi`);
    }
    return {
      id: part.id,
      sku: part.sku,
      translations: part.translations,
      images: part.images,
      carName: part.carName,
      model: part.model,
      oem: part.oem,
      years: part.years,
      trtCode: part.trtCode,
      brand: part.brand,
      categories: part.categories.map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    };
  }

  async update(id: number, updatePartDto: UpdatePartDto, files?: Express.Multer.File[]) {
    const part = await this.partsRepository.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!part) {
      throw new NotFoundException(`ID ${id} bilan qism topilmadi`);
    }

    // Agar yangi rasmlar yuklangan bo'lsa, eski rasmlarni o'chirish
    if (files && files.length > 0) {
      // Eski rasmlarni o'chirish
      if (part.images && part.images.length > 0) {
        this.deleteImageArray(part.images);
      }

      // Yangi rasmlarni saqlash
      const newImages = files.map(file => this.getImageUrl(file.filename));
      part.images = newImages;
    } else if (updatePartDto.images) {
      // Agar images array body da yuborilgan bo'lsa
      const oldImages = part.images || [];
      const newImages = updatePartDto.images || [];
      const deletedImages = oldImages.filter(img => !newImages.includes(img));
      this.deleteImageArray(deletedImages);
      part.images = updatePartDto.images;
    }

    if (updatePartDto.translations) {
      part.translations = {
        en: {
          name: updatePartDto.translations.en?.name || part.translations.en.name,
        },
        ru: {
          name: updatePartDto.translations.ru?.name || part.translations.ru.name,
        },
      };
    }

    part.sku = updatePartDto.sku || part.sku;
    part.carName = updatePartDto.carName || part.carName;
    part.model = updatePartDto.model || part.model;
    part.oem = updatePartDto.oem || part.oem;
    part.years = updatePartDto.years || part.years;
    part.trtCode = updatePartDto.trtCode || part.trtCode;
    part.brand = updatePartDto.brand || part.brand;

    if (updatePartDto.categories) {
      part.categories = await this.categoriesRepository.findBy({ id: updatePartDto.categories as any });
    }

    const updatedPart = await this.partsRepository.save(part);
    return {
      id: updatedPart.id,
      sku: updatedPart.sku,
      translations: updatedPart.translations,
      images: updatedPart.images,
      carName: updatedPart.carName,
      model: updatedPart.model,
      oem: updatedPart.oem,
      years: updatedPart.years,
      trtCode: updatedPart.trtCode,
      brand: updatedPart.brand,
      categories: updatedPart.categories.map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    };
  }

  async remove(id: number) {
    const existingPart = await this.partsRepository.findOne({ where: { id } });
    if (!existingPart) {
      throw new NotFoundException(`ID ${id} bilan qism topilmadi`);
    }

    // Rasmlarni o'chirish
    if (existingPart.images && Array.isArray(existingPart.images)) {
      this.deleteImageArray(existingPart.images);
    }

    await this.partsRepository.delete(id);
    return { message: 'Qism muvaffaqiyatli o\'chirildi' };
  }

  async getPartsByCategory(categoryId: number) {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
      relations: ['parts'],
    });

    if (!category) {
      throw new NotFoundException('Kategoriya topilmadi');
    }

    return {
      category: {
        id: category.id,
        translations: category.translations,
        images: category.images,
      },
      parts: category.parts.map(part => ({
        id: part.id,
        sku: part.sku,
        translations: part.translations,
        images: part.images,
        carName: part.carName,
        model: part.model,
        oem: part.oem,
        years: part.years,
        trtCode: part.trtCode,
        brand: part.brand,
      })),
    };
  }

  async getAllOem() {
    const distinctOems = await this.partsRepository
      .createQueryBuilder('part')
      .select('DISTINCT unnest(part.oem) as oem')
      .getRawMany();
    return distinctOems.map((row) => row.oem).filter(Boolean);
  }

  async getOemId(oem: string) {
    const trts = await this.partsRepository
      .createQueryBuilder('part')
      .select('DISTINCT part.trtCode')
      .where(':oem = ANY(part.oem)', { oem })
      .getRawMany();
    return trts.map((trt) => trt.trtCode);
  }

  async getTrtCode(trt: string) {
    const brands = await this.partsRepository
      .createQueryBuilder('part')
      .select('DISTINCT part.brand')
      .where('part.trtCode = :trt', { trt })
      .getRawMany();
    return brands.map((brand) => brand.brand);
  }

  async getBrand(brand: string) {
    const models = await this.partsRepository
      .createQueryBuilder('part')
      .select('DISTINCT unnest(part.model) as model')
      .where('part.brand = :brand', { brand })
      .getRawMany();
    return models.map((row) => row.model).filter(Boolean);
  }

  async search(oem: string, trt: string, brand: string, model: string) {
    const queryBuilder = this.partsRepository
      .createQueryBuilder('part')
      .leftJoinAndSelect('part.categories', 'category');

    if (oem) {
      queryBuilder.andWhere(':oem = ANY(LOWER(part.oem::text)::text[])', { oem: oem.toLowerCase() });
    }

    if (model) {
      queryBuilder.andWhere(':model = ANY(LOWER(part.model::text)::text[])', { model: model.toLowerCase() });
    }

    if (trt) {
      queryBuilder.andWhere('LOWER(part.trtCode) = :trt', { trt: trt.toLowerCase() });
    }

    if (brand) {
      queryBuilder.andWhere('LOWER(part.brand) = :brand', { brand: brand.toLowerCase() });
    }

    const parts = await queryBuilder.getMany();

    if (!parts.length) {
      throw new NotFoundException('Qismlar topilmadi');
    }

    return parts.map(part => ({
      id: part.id,
      sku: part.sku,
      translations: part.translations,
      images: part.images,
      carName: part.carName,
      model: part.model,
      oem: part.oem,
      years: part.years,
      trtCode: part.trtCode,
      brand: part.brand,
      categories: (part.categories || []).map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    }));
  }

  async getCategories() {
    const categories = await this.categoriesRepository.find();
    if (categories.length === 0) {
      throw new NotFoundException('Kategoriyalar topilmadi');
    }
    return categories.map(category => ({
      id: category.id,
      translations: category.translations,
      imageUrl: category.imageUrl,
    }));
  }

  async searchByName(name: string) {
    const parts = await this.partsRepository
      .createQueryBuilder('part')
      .leftJoinAndSelect('part.categories', 'category')
      .where('LOWER(part.translations->>\'en\'->>\'name\') LIKE :name OR LOWER(part.translations->>\'ru\'->>\'name\') LIKE :name', {
        name: `%${name.toLowerCase()}%`,
      })
      .getMany();

    if (parts.length === 0) {
      throw new NotFoundException(`Nomi ${name} bilan qism topilmadi`);
    }

    return parts.map(part => ({
      id: part.id,
      sku: part.sku,
      translations: part.translations,
      images: part.images,
      carName: part.carName,
      model: part.model,
      oem: part.oem,
      years: part.years,
      trtCode: part.trtCode,
      brand: part.brand,
      categories: (part.categories || []).map(category => ({
        id: category.id,
        translations: category.translations,
        images: category.images,
      })),
    }));
  }

  async getTotalCount() {
    const totalCount = await this.partsRepository.count();
    return { total: totalCount };
  }

  async getImagePath(imageName: string): Promise<string | null> {
    if (!imageName) {
      return null;
    }
    // Parts uchun - absolute path
    const partsImagePath = path.resolve(this.uploadsDir, imageName);
    if (fs.existsSync(partsImagePath)) {
      return partsImagePath;
    }
    // Categories uchun ham tekshirish - absolute path
    const categoriesImagePath = path.resolve(process.cwd(), 'uploads', 'categories', imageName);
    if (fs.existsSync(categoriesImagePath)) {
      return categoriesImagePath;
    }
    throw new NotFoundException('Rasm topilmadi');
  }
}