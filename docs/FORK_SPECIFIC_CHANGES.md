# Fork-Specific Changes

This document tracks the behavior that remains intentionally different in this fork after merging from `upstream/main`.

## Baseline

- Upstream remote: `smartlabsAT/directus-super-table`
- Last merged upstream baseline: `upstream/main` at `05bb665` (`v0.6.4`)
- Local merge commit: `5a9533f` (`Merge remote-tracking branch 'upstream/main'`)

At the time of writing, the fork-specific delta against `upstream/main` is intentionally limited to a small set of files:

- `src/actions.vue`
- `src/components/EditableCellRelational.vue`
- `src/composables/api.ts`
- `src/composables/useTableFields.ts`
- `src/options.vue`
- `src/super-table.vue`
- `src/utils/adjustFieldsForDisplays.ts`

## What Upstream Already Replaced

Several older fork changes are no longer carried as fork-only behavior because upstream now provides stronger native support.

### Relational and Translation Search

The earlier fork-specific search fix for linked collections is effectively superseded by upstream's extracted search pipeline:

- `src/utils/buildSearchFilter.ts`
- `src/utils/searchSync.ts`
- `src/utils/buildQueryFingerprint.ts`
- `src/utils/coalesce.ts`

Upstream now handles:

- dot-path relational filters
- translation field search
- top-level translations alias search
- hidden text-field fallback search
- debounced search synchronization
- stable request fingerprinting for refetch decisions

Because of that, the old fork search implementation should not be reintroduced.

## Active Fork-Specific Behavior

The following local changes still add behavior that upstream does not currently provide in the same way.

### 1. Human-readable `user_created` / `user_updated` display

Files:

- `src/super-table.vue`
- `src/utils/adjustFieldsForDisplays.ts`
- `src/components/EditableCellRelational.vue`

Why it exists:

- Some collections expose audit fields such as `user_created` and `user_updated` without explicit display metadata.
- Upstream does not always default those fields to a user display pipeline.
- Without the fork behavior, those cells can degrade to IDs, raw objects, or `[object Object]` style output.

What the fork adds:

- defaults audit fields to display type `user` when appropriate
- expands the relational API field set needed for `directus_users`
- renders name/email fallbacks from returned user objects

Why it is still needed:

- This is a real behavior fix, not a styling preference.
- The fork ensures audit columns remain legible even when schema display settings are incomplete.

### 2. Update the currently opened bookmark in place

Files:

- `src/actions.vue`
- `src/composables/api.ts`

Why it exists:

- Upstream added shared-view and save-view creation flows.
- That is not the same as updating the exact bookmark currently selected in the route query.

What the fork adds:

- detects the active `bookmark` route query value
- fetches the existing preset row
- patches the active preset with current filter, search, layout query, and layout options
- exposes a dedicated toolbar action for this overwrite flow

Why it is still needed:

- Users can refine an existing bookmark and save back into that bookmark directly.
- Upstream's shared-view functionality focuses on create/upsert flows by name and scope, not in-place bookmark overwrite from the current page state.

### 3. Configurable row spacing for non-image tables

Files:

- `src/options.vue`
- `src/super-table.vue`

What the fork adds:

- a layout option for row spacing: `compact`, `cozy`, `comfortable`
- matching row-height behavior for standard table rows
- supporting CSS adjustments so cells stay vertically centered at those sizes

Why it is still needed:

- Upstream keeps a simpler default row-height model.
- The fork adds a user-facing layout control for denser or roomier tables without changing image-row behavior.

This is a product customization rather than a bug fix, but it is intentional and user-visible.

### 4. Keep `fieldsInCollection` reactive instead of snapshotting it

Files:

- `src/composables/useTableFields.ts`
- `src/super-table.vue`

What the fork changes:

- passes the reactive `fieldsInCollection` ref through instead of freezing it with `ref(fieldsInCollection.value)`
- widens the composable signature to accept a computed/ref source

Why it is still needed:

- snapshotting schema fields at mount can leave later field-dependent behavior stale
- this matters during collection switches and other schema-reactive flows

This is a correctness fix and should be preserved unless upstream adopts the same reactive contract.

## Merge Guidance

When merging future upstream changes:

1. Prefer upstream behavior by default.
2. Re-check whether upstream has absorbed any of the four active fork-specific behaviors above.
3. If upstream has added equivalent support, remove the local customization rather than layering both.
4. Pay special attention to conflicts in:
   - `src/actions.vue`
   - `src/super-table.vue`
   - `src/utils/adjustFieldsForDisplays.ts`
   - `src/components/EditableCellRelational.vue`

## Validation Checklist

After reconciling future merges, run:

```sh
pnpm install
pnpm run test:run
pnpm run type-check
pnpm run lint
```

These checks passed for the merge that produced this document.