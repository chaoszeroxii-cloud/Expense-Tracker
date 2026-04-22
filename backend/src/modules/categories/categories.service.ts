import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  findAll(userId: string): Promise<Category[]> {
    return this.repo.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Category> {
    const category = await this.repo.findOne({ where: { id, userId } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  create(dto: CreateCategoryDto, userId: string): Promise<Category> {
    const category = this.repo.create({ ...dto, userId });
    return this.repo.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string): Promise<Category> {
    const category = await this.findOne(id, userId);
    Object.assign(category, dto);
    return this.repo.save(category);
  }

  async remove(id: string, userId: string): Promise<void> {
    const category = await this.findOne(id, userId);
    await this.repo.remove(category);
  }
}
