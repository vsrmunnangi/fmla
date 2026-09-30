import { CategoriesController } from './categories.controller';
import { CATEGORIES } from './categories';

describe('CategoriesController', () => {
  it('returns the full category/doc-type registry mirror', () => {
    const controller = new CategoriesController();
    expect(controller.list()).toBe(CATEGORIES);
    expect(controller.list().map((c) => c.key)).toEqual(['FMLA', 'WORKERS_COMP', 'ADA']);
  });

  it('every category has at least one doc type', () => {
    for (const category of CATEGORIES) {
      expect(category.docTypes.length).toBeGreaterThan(0);
    }
  });
});
