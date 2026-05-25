import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import * as JSZip from 'jszip';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { CatalogItem } from './entities/catalog-item.entity';
import * as XLSX from 'xlsx';

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

  private parseArrayCell(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (value === null || value === undefined) return [];

    const str = String(value).trim();
    if (!str) return [];

    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
        // Fallback split below
      }
    }

    return str
      .split(/,|\n|;/)
      .map((v) => v.replace(/"/g, '').trim())
      .filter(Boolean);
  }

  private normalizePhotoValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return this.getImageUrl(trimmed);
  }

  private pickValue(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  private readonly catalogUploadDir = join(process.cwd(), 'uploads', 'catalog');

  private normalizeHeaderLabel(value: unknown): string {
    return String(value ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private headerMatches(label: string, variants: string[]): boolean {
    const normalized = this.normalizeHeaderLabel(label);
    return variants.some((variant) => {
      const target = this.normalizeHeaderLabel(variant);
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    });
  }

  private isHeaderRow(row: unknown[]): boolean {
    const labels = row.map((cell) => this.normalizeHeaderLabel(cell));
    const hasTrt = labels.some((l) => l.includes('TRT'));
    const hasOem = labels.some((l) => l.includes('OEM'));
    return hasTrt && hasOem;
  }

  private isEmptyRow(row: unknown[]): boolean {
    return row.every((cell) => !String(cell ?? '').trim());
  }

  private isHeaderLikeDataRow(trtRaw: string, englishName: string, russianName: string): boolean {
    const trt = this.normalizeHeaderLabel(trtRaw);
    const english = this.normalizeHeaderLabel(englishName);
    const russian = this.normalizeHeaderLabel(russianName);
    return (
      (trt.includes('TRT') && trt.includes('№')) ||
      (trt.includes('OEM') && trt.includes('№')) ||
      english === 'ENGLISH NAME' ||
      russian === 'RUSSIAN NAME'
    );
  }

  private isTrtCodeValue(value: string): boolean {
    const first = value.split(/\r?\n/)[0]?.trim() || '';
    return /^R[0-9A-Z]/i.test(first);
  }

  private getRowCell(row: unknown[], index: number): string {
    if (index < 0 || index >= row.length) return '';
    const value = row[index];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private getRowNumber(row: unknown[], index: number): number | undefined {
    if (index < 0 || index >= row.length) return undefined;
    const value = row[index];
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const parsed = Number(String(value).replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildColumnMap(headerRow: unknown[]): Record<string, number> | null {
    const map: Record<string, number> = {};

    headerRow.forEach((cell, index) => {
      const label = this.normalizeHeaderLabel(cell);
      if (!label) return;

      if (label.includes('TRT') && !label.includes('OEM')) map.trt = index;
      else if (label.includes('OEM') && !label.includes('TRT')) map.oem = index;
      else if (this.headerMatches(label, ['CTR №', 'CTR NO', 'CTR'])) map.ctr = index;
      else if (this.headerMatches(label, ['LEMFÖRDER №', 'LEMFORDER №', 'LEMFORDER NO', 'LEMFORDER'])) {
        map.lemforder = index;
      } else if (this.headerMatches(label, ['ENGLISH NAME'])) map.englishName = index;
      else if (this.headerMatches(label, ['CONTENTS'])) map.contents = index;
      else if (this.headerMatches(label, ['RUSSIAN NAME'])) map.russianName = index;
      else if (this.headerMatches(label, ['CAR NAME'])) map.carName = index;
      else if (this.headerMatches(label, ['MODEL'])) map.model = index;
      else if (this.headerMatches(label, ['YEARS'])) map.years = index;
      else if (this.headerMatches(label, ['FOTO', 'PHOTO'])) map.foto = index;
      else if (label.includes('WEIGHT') && label.includes('KG')) map.weight = index;
      else if (this.headerMatches(label, ['START OF SALES'])) map.startOfSales = index;
      else if (this.headerMatches(label, ['GRUPPA NOMENKLATUR', 'GROUP NAME'])) map.groupName = index;
    });

    if (map.trt === undefined) {
      return null;
    }

    return map;
  }

  private resolveTrtAndOem(trtRaw: string, oemRaw: string): { trtNo: string; oemNo: string[] } {
    const trtIsCode = this.isTrtCodeValue(trtRaw);
    const oemIsCode = this.isTrtCodeValue(oemRaw);

    if (oemIsCode && !trtIsCode) {
      return {
        trtNo: (oemRaw.split(/\r?\n/)[0] || '').trim(),
        oemNo: this.parseArrayCell(trtRaw),
      };
    }

    return {
      trtNo: (trtRaw.split(/\r?\n/)[0] || '').trim(),
      oemNo: this.parseArrayCell(oemRaw),
    };
  }

  private getExcelBuffer(file: Express.Multer.File): Buffer {
    if (file.buffer && file.buffer.length > 0) {
      return file.buffer;
    }

    if (file.path && existsSync(file.path)) {
      return readFileSync(file.path);
    }

    throw new BadRequestException('Excel fayl o\'qib bo\'lmadi (buffer yo\'q)');
  }

  private async extractExcelImages(fileBuffer: Buffer): Promise<{
    byRow: Map<number, { data: Buffer; ext: string }>;
    ordered: Array<{ data: Buffer; ext: string }>;
  }> {
    const byRow = new Map<number, { data: Buffer; ext: string }>();
    const ordered: Array<{ data: Buffer; ext: string }> = [];

    const zip = await JSZip.loadAsync(fileBuffer);

    const mediaPaths = Object.keys(zip.files)
      .filter((name) => {
        if (!name.startsWith('xl/media/') || name.endsWith('/')) return false;
        if (name.toLowerCase().includes('hdphoto')) return false;
        return /\.(jpe?g|png|webp|gif)$/i.test(name);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const mediaPath of mediaPaths) {
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;

      const data = await mediaFile.async('nodebuffer');
      const ext = extname(mediaPath) || '.jpg';
      ordered.push({ data, ext });
    }

    const drawingNames = Object.keys(zip.files).filter(
      (name) => name.startsWith('xl/drawings/drawing') && name.endsWith('.xml') && !name.includes('_rels'),
    );

    for (const drawingPath of drawingNames) {
      const relsPath = drawingPath.replace('/drawings/', '/drawings/_rels/').replace('.xml', '.xml.rels');
      const drawingFile = zip.file(drawingPath);
      const relsFile = zip.file(relsPath);
      if (!drawingFile || !relsFile) continue;

      const drawingXml = await drawingFile.async('string');
      const relsXml = await relsFile.async('string');

      const relMap = new Map<string, string>();
      for (const match of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
        const [, relId, target] = match;
        if (!target.toLowerCase().includes('hdphoto')) {
          relMap.set(relId, target);
        }
      }

      const anchorRegex = /<xdr:(?:oneCell|twoCell)Anchor[\s\S]*?<\/xdr:(?:oneCell|twoCell)Anchor>/g;
      for (const anchorMatch of drawingXml.matchAll(anchorRegex)) {
        const block = anchorMatch[0];
        const rowMatch = block.match(/<xdr:row>(\d+)</);
        const relIdMatch = block.match(/r:embed="(rId\d+)"/);
        if (!rowMatch || !relIdMatch) continue;

        const excelRow = Number(rowMatch[1]);
        const mediaTarget = relMap.get(relIdMatch[1]);
        if (!Number.isFinite(excelRow) || !mediaTarget) continue;

        const mediaPath = mediaTarget.startsWith('../')
          ? `xl/${mediaTarget.replace('../', '')}`
          : mediaTarget.startsWith('xl/')
            ? mediaTarget
            : `xl/media/${mediaTarget.split('/').pop()}`;

        const mediaFile = zip.file(mediaPath);
        if (!mediaFile) continue;

        const data = await mediaFile.async('nodebuffer');
        const ext = extname(mediaPath) || '.jpg';
        byRow.set(excelRow, { data, ext });
      }
    }

    return { byRow, ordered };
  }

  private saveImportedPhoto(
    image: { data: Buffer; ext: string },
    trtNo: string,
    rowIndex: number,
  ): string {
    if (!existsSync(this.catalogUploadDir)) {
      mkdirSync(this.catalogUploadDir, { recursive: true });
    }

    const safeTrt = trtNo.replace(/[^a-zA-Z0-9_-]/g, '_') || 'item';
    const filename = `catalog-import-${safeTrt}-row${rowIndex}${image.ext}`;
    writeFileSync(join(this.catalogUploadDir, filename), image.data);
    return this.getImageUrl(filename);
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
      englishName: dto.englishName?.trim() || '',
      contents: dto.contents,
      russianName: dto.russianName?.trim() || '',
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

  async importFromExcel(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Excel fayl yuborilmadi');
    }

    const fileBuffer = this.getExcelBuffer(file);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new BadRequestException('Excel varaqasi topilmadi');
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    let excelImages = { byRow: new Map<number, { data: Buffer; ext: string }>(), ordered: [] as Array<{ data: Buffer; ext: string }> };
    try {
      excelImages = await this.extractExcelImages(fileBuffer);
    } catch (error) {
      console.error('Excel rasmlarini olishda xato:', error);
    }

    let columnMap: Record<string, number> | null = null;
    let created = 0;
    let skipped = 0;
    let photosAttached = 0;
    let dataRowOrder = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      const row = matrix[rowIndex] || [];
      const excelRowNumber = rowIndex + 1;

      if (this.isHeaderRow(row)) {
        columnMap = this.buildColumnMap(row);
        continue;
      }

      if (!columnMap || this.isEmptyRow(row)) {
        continue;
      }

      const trtRaw = this.getRowCell(row, columnMap.trt);
      const oemRaw = this.getRowCell(row, columnMap.oem ?? -1);
      const englishName = this.getRowCell(row, columnMap.englishName ?? -1);
      const russianName = this.getRowCell(row, columnMap.russianName ?? -1);

      if (!trtRaw) {
        skipped++;
        errors.push({ row: excelRowNumber, reason: 'TRT № bo\'sh' });
        continue;
      }

      if (this.isHeaderLikeDataRow(trtRaw, englishName, russianName)) {
        skipped++;
        errors.push({ row: excelRowNumber, reason: "Sarlavha qatori (o'tkazib yuborildi)" });
        continue;
      }

      const { trtNo, oemNo } = this.resolveTrtAndOem(trtRaw, oemRaw);
      if (!trtNo) {
        skipped++;
        errors.push({ row: excelRowNumber, reason: 'TRT № bo\'sh' });
        continue;
      }

      const carName = this.parseArrayCell(this.getRowCell(row, columnMap.carName ?? -1));
      const model = this.parseArrayCell(this.getRowCell(row, columnMap.model ?? -1));
      const years = this.parseArrayCell(this.getRowCell(row, columnMap.years ?? -1));
      const contents = this.getRowCell(row, columnMap.contents ?? -1);
      const ctrNo = this.getRowCell(row, columnMap.ctr ?? -1);
      const lemforderNo = this.getRowCell(row, columnMap.lemforder ?? -1);
      const groupName = this.getRowCell(row, columnMap.groupName ?? -1);
      const photoRaw = this.getRowCell(row, columnMap.foto ?? -1);
      const startOfSales = this.getRowCell(row, columnMap.startOfSales ?? -1);
      const weightPerPcKg = this.getRowNumber(row, columnMap.weight ?? -1);

      let photoUrl: string | undefined;
      const embeddedImage =
        excelImages.byRow.get(rowIndex) ?? excelImages.ordered[dataRowOrder];

      if (embeddedImage) {
        photoUrl = this.saveImportedPhoto(embeddedImage, trtNo, rowIndex);
        photosAttached++;
      } else if (photoRaw && !this.headerMatches(photoRaw, ['FOTO', 'PHOTO'])) {
        photoUrl = this.normalizePhotoValue(photoRaw);
        photosAttached++;
      }

      const item = this.catalogRepository.create({
        trtNo,
        oemNo,
        ctrNo: ctrNo || undefined,
        lemforderNo: lemforderNo || undefined,
        englishName: englishName || '',
        contents: contents || undefined,
        russianName: russianName || '',
        carName,
        model,
        years,
        photo: photoUrl,
        groupName: groupName || undefined,
        startOfSales: startOfSales || undefined,
        weightPerPcKg,
      });

      try {
        await this.catalogRepository.save(item);
        created++;
        dataRowOrder++;
      } catch (error: any) {
        skipped++;
        errors.push({
          row: excelRowNumber,
          reason: error?.message || 'Saqlashda xatolik',
        });
      }
    }

    return {
      totalRows: matrix.length,
      created,
      skipped,
      photosAttached,
      imagesFoundInExcel: excelImages.ordered.length,
      errors,
    };
  }
}
