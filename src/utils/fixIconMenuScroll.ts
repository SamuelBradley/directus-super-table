// Forces the teleported icon-selector menu to scroll instead of clipping its icon grid.
export function fixIconMenuScroll(): void {
  // Use multiple timeouts to catch the menu at different stages of rendering
  const delays = [0, 50, 100, 200, 300];

  delays.forEach((delay) => {
    setTimeout(() => {
      // Find all v-menu-content elements
      const menus = document.querySelectorAll('.v-menu-content');

      menus.forEach((menu) => {
        // Check if this menu has icons (is an icon selector)
        if (menu.querySelector('.icons')) {
          const menuEl = menu as HTMLElement;

          // Force the styles with inline style
          menuEl.style.cssText = `
            max-height: 400px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          `;
        }
      });
    }, delay);
  });
}
