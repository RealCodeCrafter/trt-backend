import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Part } from '../parts/entities/part.entity';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class CategoryService {
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'categories');

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Part)
    private readonly partRepository: Repository<Part>,
    private readonly configService: ConfigService,
  ) {
    // Upload papkalarni yaratish
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private getImageUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:7000';
    return `${baseUrl}/uploads/categories/${filename}`;
  }

  private deleteImageFile(imageUrl: string): void {
    if (!imageUrl) return;
    
    try {
      // URL dan fayl nomini olish (to'liq URL yoki relative path)
      const fileName = imageUrl.includes('/uploads/') 
        ? imageUrl.split('/uploads/categories/').pop() || imageUrl.split('/').pop()
        : imageUrl.split('/').pop();
      if (fileName) {
        const filePath = join(this.uploadsDir, fileName);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('Rasm o\'chirishda xatolik:', error);
    }
  }

  private deleteImageArray(images: string[]): void {
    if (!images || !Array.isArray(images)) return;
    
    images.forEach(imageUrl => {
      this.deleteImageFile(imageUrl);
    });
  }

  async create(createCategoryDto: CreateCategoryDto, files?: Express.Multer.File[]) {
    const { translations, parts } = createCategoryDto;

    const existingCategory = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.translations->\'en\'->>\'name\' = :name OR category.translations->\'ru\'->>\'name\' = :name', {
        name: translations.en.name,
      })
      .getOne();

    if (existingCategory) {
      throw new BadRequestException(`Kategoriya ${translations.en.name} nomi bilan allaqachon mavjud`);
    }

    // Agar rasmlar yuklangan bo'lsa, images array ni yaratish
    let images: string[] = [];
    if (files && files.length > 0) {
      images = files.map(file => this.getImageUrl(file.filename));
    }

    const category = this.categoryRepository.create({
      translations,
      images,
      parts: parts && parts.length > 0 ? await this.partRepository.findBy({ id: In(parts) }) : [],
    });

    const savedCategory = await this.categoryRepository.save(category);

    return {
      id: savedCategory.id,
      translations: savedCategory.translations,
      images: savedCategory.images,
      parts: savedCategory.parts,
    };
  }

  async findAll() {
    const categories = await this.categoryRepository.find();
    if (!categories.length) {
      throw new NotFoundException('Hech qanday kategoriya topilmadi');
    }
    return categories.map(category => ({
      id: category.id,
      translations: category.translations,
      images: category.images,
      parts: category.parts,
    }));
  }

  async findOne(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id }, relations: ['parts'] });
    if (!category) {
      throw new NotFoundException(`ID ${id} bilan kategoriya topilmadi`);
    }
    return {
      id: category.id,
      translations: category.translations,
      images: category.images,
      parts: category.parts,
    };
  }

  async updateCategory(id: number, updateCategoryDto: UpdateCategoryDto, files?: Express.Multer.File[]) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`ID ${id} bilan kategoriya topilmadi`);
    }

    if (updateCategoryDto.translations) {
      const existingCategory = await this.categoryRepository
        .createQueryBuilder('category')
        .where('category.id != :id AND (category.translations->\'en\'->>\'name\' = :name OR category.translations->\'ru\'->>\'name\' = :name)', {
          id,
          name: updateCategoryDto.translations.en?.name || category.translations.en.name,
        })
        .getOne();

      if (existingCategory) {
        throw new BadRequestException(`Kategoriya ${updateCategoryDto.translations.en?.name || category.translations.en.name} nomi bilan allaqachon mavjud`);
      }

      category.translations = {
        en: {
          name: updateCategoryDto.translations.en?.name || category.translations.en.name,
          description: updateCategoryDto.translations.en?.description || category.translations.en.description,
        },
        ru: {
          name: updateCategoryDto.translations.ru?.name || category.translations.ru.name,
          description: updateCategoryDto.translations.ru?.description || category.translations.ru.description,
        },
      };
    }

    // Agar yangi rasmlar yuklangan bo'lsa, eski rasmlarni o'chirish
    if (files && files.length > 0) {
      // Eski rasmlarni o'chirish
      if (category.images && category.images.length > 0) {
        this.deleteImageArray(category.images);
      }

      // Yangi rasmlarni saqlash
      const newImages = files.map(file => this.getImageUrl(file.filename));
      category.images = newImages;
    } else if (updateCategoryDto.images) {
      // Agar images array body da yuborilgan bo'lsa
      const oldImages = category.images || [];
      const newImages = updateCategoryDto.images || [];
      const deletedImages = oldImages.filter(img => !newImages.includes(img));
      this.deleteImageArray(deletedImages);
      category.images = updateCategoryDto.images;
    }

    if (updateCategoryDto.parts) {
      category.parts = updateCategoryDto.parts && updateCategoryDto.parts.length > 0 
        ? await this.partRepository.findBy({ id: In(updateCategoryDto.parts) })
        : [];
    }

    const updatedCategory = await this.categoryRepository.save(category);
    return {
      id: updatedCategory.id,
      translations: updatedCategory.translations,
      images: updatedCategory.images,
      parts: updatedCategory.parts,
    };
  }

  async remove(id: number) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['parts'],
    });

    if (!category) {
      throw new NotFoundException(`ID ${id} bilan kategoriya topilmadi`);
    }

    // Rasmlarni o'chirish
    if (category.images && category.images.length > 0) {
      this.deleteImageArray(category.images);
    }

    // Parts bilan bog'lanishlarni tozalash (cascade o'rniga manual)
    if (category.parts?.length) {
      for (const part of category.parts) {
        const partWithCategories = await this.partRepository.findOne({
          where: { id: part.id },
          relations: ['categories'],
        });
        if (partWithCategories && partWithCategories.categories) {
          partWithCategories.categories = partWithCategories.categories.filter((c) => c.id !== id);
          await this.partRepository.save(partWithCategories);
        }
      }
    }

    await this.categoryRepository.remove(category);

    return {
      message: 'Kategoriya muvaffaqiyatli o\'chirildi',
    };
  }
}