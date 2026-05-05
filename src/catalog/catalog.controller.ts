import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

@ApiTags('Catalog')
@Controller('catalog/products')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['trtNo', 'englishName', 'russianName'],
      properties: {
        trtNo: { type: 'string', example: 'R8000' },
        oemNo: { type: 'string', example: '["94788122","94786917"]' },
        ctrNo: { type: 'string', example: 'CB0160' },
        lemforderNo: { type: 'string', example: '12152 05' },
        englishName: { type: 'string', example: 'BALL JOINT' },
        contents: { type: 'string', example: 'M10 x 1.25, M12 x 1.5' },
        russianName: { type: 'string', example: 'ШАРОВАЯ ОПОРА' },
        carName: { type: 'string', example: '["DAEWOO Nexia"]' },
        model: { type: 'string', example: '["ATA19/ATF19"]' },
        years: { type: 'string', example: '["95~08"]' },
        weightPerPcKg: { type: 'number', example: 0.635 },
        startOfSales: { type: 'string', format: 'date', example: '2026-05-05' },
        categoryIds: { type: 'string', example: '[1,2]' },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'catalog');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (_req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `catalog-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  create(@Body() dto: CreateCatalogItemDto, @UploadedFile() photo?: Express.Multer.File) {
    return this.catalogService.create(dto, photo);
  }

  @Get()
  findAll() {
    return this.catalogService.findAll();
  }

  @Get('filter')
  @ApiQuery({ name: 'trtNo', required: false })
  @ApiQuery({ name: 'oemNo', required: false })
  @ApiQuery({ name: 'ctrNo', required: false })
  @ApiQuery({ name: 'lemforderNo', required: false })
  @ApiQuery({ name: 'groupName', required: false })
  @ApiQuery({ name: 'model', required: false })
  filter(
    @Query('trtNo') trtNo?: string,
    @Query('oemNo') oemNo?: string,
    @Query('ctrNo') ctrNo?: string,
    @Query('lemforderNo') lemforderNo?: string,
    @Query('groupName') groupName?: string,
    @Query('model') model?: string,
  ) {
    return this.catalogService.filter({ trtNo, oemNo, ctrNo, lemforderNo, groupName, model });
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id') id: string) {
    return this.catalogService.findOne(+id);
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trtNo: { type: 'string' },
        oemNo: { type: 'string' },
        ctrNo: { type: 'string' },
        lemforderNo: { type: 'string' },
        englishName: { type: 'string' },
        contents: { type: 'string' },
        russianName: { type: 'string' },
        carName: { type: 'string' },
        model: { type: 'string' },
        years: { type: 'string' },
        weightPerPcKg: { type: 'number' },
        startOfSales: { type: 'string', format: 'date' },
        categoryIds: { type: 'string' },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'catalog');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (_req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `catalog-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.catalogService.update(+id, dto, photo);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id') id: string) {
    return this.catalogService.remove(+id);
  }
}
