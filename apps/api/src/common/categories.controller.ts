import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { CATEGORIES } from './categories';

/** Drives the web "new claim" category picker and the per-category upload-doc-type
 * dropdown — not in §8's route table, same reasoning as GET /claims/:id: a small,
 * low-risk completion, not a scope change. Any authenticated role can read it. */
@Controller('categories')
@UseGuards(AuthGuard, RolesGuard)
export class CategoriesController {
  @Get()
  list() {
    return CATEGORIES;
  }
}
