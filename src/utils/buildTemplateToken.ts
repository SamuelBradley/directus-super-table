/**
 * Build a `{{…}}` template token for the Display Template editor's field picker.
 * The form depends on the column's relation type (see the design spec):
 * M2A tokens are field-key-prefixed and carry the `item:<collection>` scope
 * (plus an optional `:lang` suffix on nested-translation paths); non-M2A
 * relational tokens are written relative to the related collection.
 */
export type TemplateTokenContext =
  | { mode: 'm2a-collection'; fieldKey: string }
  | {
      mode: 'm2a-item';
      fieldKey: string;
      targetCollection: string;
      path: string;
      language?: string | null;
    }
  | { mode: 'relative'; path: string };

export function buildTemplateToken(ctx: TemplateTokenContext): string {
  switch (ctx.mode) {
    case 'm2a-collection':
      return `{{${ctx.fieldKey}.collection}}`;
    case 'm2a-item': {
      const lang = ctx.language ? `:${ctx.language}` : '';
      return `{{${ctx.fieldKey}.item:${ctx.targetCollection}.${ctx.path}${lang}}}`;
    }
    case 'relative':
      return `{{${ctx.path}}}`;
  }
}
