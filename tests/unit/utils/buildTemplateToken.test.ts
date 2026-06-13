import { describe, it, expect } from 'vitest';
import { buildTemplateToken } from '@/utils/buildTemplateToken';

describe('buildTemplateToken', () => {
  it('builds the M2A discriminator token', () => {
    expect(buildTemplateToken({ mode: 'm2a-collection', fieldKey: 'treatment' })).toBe(
      '{{treatment.collection}}'
    );
  });

  it('builds an M2A item token without a language', () => {
    expect(
      buildTemplateToken({ mode: 'm2a-item', fieldKey: 'treatment', targetCollection: 'service', path: 'name' })
    ).toBe('{{treatment.item:service.name}}');
  });

  it('builds an M2A nested-translation token with a language suffix', () => {
    expect(
      buildTemplateToken({
        mode: 'm2a-item',
        fieldKey: 'treatment',
        targetCollection: 'service',
        path: 'translations.label',
        language: 'de-DE',
      })
    ).toBe('{{treatment.item:service.translations.label:de-DE}}');
  });

  it('treats null/empty language as no suffix', () => {
    const base = { mode: 'm2a-item', fieldKey: 'treatment', targetCollection: 'service', path: 'translations.label' } as const;
    expect(buildTemplateToken({ ...base, language: null })).toBe(
      '{{treatment.item:service.translations.label}}'
    );
    expect(buildTemplateToken({ ...base, language: '' })).toBe(
      '{{treatment.item:service.translations.label}}'
    );
  });

  it('builds a relative (non-M2A) token', () => {
    expect(buildTemplateToken({ mode: 'relative', path: 'first_name' })).toBe('{{first_name}}');
    expect(buildTemplateToken({ mode: 'relative', path: 'author.role.name' })).toBe(
      '{{author.role.name}}'
    );
  });
});
