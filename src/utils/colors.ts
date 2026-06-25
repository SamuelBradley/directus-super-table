// Shared color-theme options + helpers for filter/view selectors.

export const colorOptions: { text: string; value: string }[] = [
  { text: 'Primary (Blue)', value: 'primary' },
  { text: 'Gray', value: 'gray' },
  { text: 'Success (Green)', value: 'success' },
  { text: 'Warning (Orange)', value: 'warning' },
  { text: 'Danger (Red)', value: 'danger' },
  { text: 'Info (Light Blue)', value: 'info' },
];

export function getColorValue(colorName: string): string {
  const colorMap: Record<string, string> = {
    primary: 'var(--primary)',
    gray: '#6c757d', // Bootstrap gray - works in both light and dark themes
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
  };
  return colorMap[colorName] || 'var(--primary)';
}

export function getColorLabel(colorName: string): string {
  const option = colorOptions.find((opt) => opt.value === colorName);
  return option ? option.text : 'Primary (Blue)';
}
