import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

/** Measures the actual composited backdrop, including gradients, behind each
 * text fragment. Axe cannot resolve this site's layered gradient backgrounds.
 * Text is hidden for this one screenshot; layout, media and backgrounds remain.
 */
export async function measureRenderedContrast(page: Page) {
  const texts = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const dialog = document.querySelector('[aria-modal="true"]');
    const fragments: { text: string; color: number[]; opacity: number; rect: { x: number; y: number; width: number; height: number } }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (!element || !node.textContent?.trim() || element.closest('script, style, svg')) continue;
      if (dialog && !dialog.contains(element)) continue;
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible') continue;
      const color = style.color.match(/[\d.]+/g)?.map(Number) ?? [];
      if (color.length === 4 && color[3] === 0) {
        const stroke = style.getPropertyValue('-webkit-text-stroke-color').match(/[\d.]+/g)?.map(Number);
        if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0 && stroke) color.splice(0, color.length, ...stroke);
        else continue;
      }
      let opacity = color[3] ?? 1;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
      if (opacity === 0) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        fragments.push({ text: node.textContent.trim().slice(0, 90), color: color.slice(0, 3), opacity, rect: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height } });
      }
    }
    return fragments;
  });
  const hideText = await page.addStyleTag({ content: '* { color: transparent !important; -webkit-text-stroke-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }' });
  let buffer: Buffer;
  try { buffer = await page.screenshot({ fullPage: true, animations: 'disabled' }); }
  finally { await hideText.evaluate(el => el.parentNode?.removeChild(el)); }
  const image = PNG.sync.read(buffer);
  const lum = (color: number[]) => color.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [.2126, .7152, .0722][i], 0);
  return texts.map(({ text, color, opacity, rect }) => {
    let minimum = Infinity;
    for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(image.height, Math.floor(rect.y + rect.height)); y += 2) {
      for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(image.width, Math.floor(rect.x + rect.width)); x += 2) {
        const offset = (y * image.width + x) * 4;
        const bg = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
        const foreground = color.map((c, i) => c * opacity + bg[i] * (1 - opacity));
        const a = lum(foreground), b = lum(bg);
        minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05));
      }
    }
    return { text, ratio: Number(minimum.toFixed(2)) };
  }).filter(item => Number.isFinite(item.ratio));
}
