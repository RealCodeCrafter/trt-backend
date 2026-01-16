import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

@Entity()
export class Part {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sku: string;

  @Column({ type: 'jsonb', default: {} })
  translations: {
    en: { name: string };
    ru: { name: string };
  };

  @Column('text', { array: true, nullable: true })
  images?: string[];

  @Column('text', { array: true, nullable: true })
  carName?: string[];

  @Column('text', { array: true, nullable: true })
  model?: string[];

  @Column('text', { array: true, nullable: true })
  oem?: string[];

  @Column('text', { array: true, nullable: true })
  years?: string[];

  @Column({ nullable: true })
  imageUrl?: string;

  @Column()
  trtCode: string;

  @Column()
  brand: string;

  @ManyToMany(() => Category, (category) => category.parts)
  @JoinTable()
  categories: Category[];
}