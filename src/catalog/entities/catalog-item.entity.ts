import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'catalog_items' })
export class CatalogItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  trtNo: string;

  @Column('text', { array: true })
  oemNo: string[];

  @Column({ default: '' })
  ctrNo: string;

  @Column({ default: '' })
  lemforderNo: string;

  @Column({ default: '' })
  englishName: string;

  @Column({ type: 'text', default: '' })
  contents: string;

  @Column({ default: '' })
  russianName: string;

  @Column('text', { array: true })
  carName: string[];

  @Column('text', { array: true })
  model: string[];

  @Column('text', { array: true })
  years: string[];

  @Column({ default: '' })
  photo: string;

  @Column({ type: 'float', nullable: true })
  weightPerPcKg?: number | null;

  @Column({ type: 'varchar', length: 32, default: '' })
  startOfSales: string;

  @Column({ default: '' })
  groupName: string;
}
