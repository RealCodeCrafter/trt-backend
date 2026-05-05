import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'catalog_items' })
export class CatalogItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  trtNo: string;

  @Column('text', { array: true, nullable: true })
  oemNo?: string[];

  @Column({ nullable: true })
  ctrNo?: string;

  @Column({ nullable: true })
  lemforderNo?: string;

  @Column()
  englishName: string;

  @Column({ type: 'text', nullable: true })
  contents?: string;

  @Column()
  russianName: string;

  @Column('text', { array: true, nullable: true })
  carName?: string[];

  @Column('text', { array: true, nullable: true })
  model?: string[];

  @Column('text', { array: true, nullable: true })
  years?: string[];

  @Column('text', { nullable: true })
  photo?: string;

  @Column({ type: 'float', nullable: true })
  weightPerPcKg?: number;

  @Column({ type: 'date', nullable: true })
  startOfSales?: string;

  @Column({ nullable: true })
  groupName?: string;
}
