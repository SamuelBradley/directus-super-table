import { defineLayout } from '@directus/extensions-sdk';
import LayoutComponent from './src/super-table.vue';
import ActionsComponent from './src/actions.vue';
import OptionsComponent from './src/options.vue';

// Workaround: TS 6.0.2 crashes on complex SDK v17 types in defineLayout() inline objects.
// Extract config to bypass the compiler crash (same fix as expandable-blocks).
const layoutConfig = {
  id: 'super-layout-table',
  name: 'Super Table',
  icon: 'table_rows',
  component: LayoutComponent,
  slots: {
    options: OptionsComponent,
    sidebar: () => null,
    actions: ActionsComponent,
  },
  headerShadow: false,
  setup(props: any, { emit }: any) {
    return {
      ...props,
      emit,
    };
  },
} as any;

export default defineLayout(layoutConfig);
