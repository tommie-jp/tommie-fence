import { describe, expect, test } from 'vitest';
import { element, escapeHtml } from './html.ts';

describe('escapeHtml', () => {
  test('turns the characters that would start markup into entities', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('escapes quotes so a value cannot break out of an attribute', () => {
    expect(escapeHtml(`"'`)).toBe('&quot;&apos;');
  });

  test('escapes the ampersand first so an entity is not produced twice', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  test('drops control characters that would break the page', () => {
    expect(escapeHtml('a\u0000b\u001Fc')).toBe('abc');
  });

  test('keeps the whitespace a message is laid out with', () => {
    expect(escapeHtml('a\nb\tc')).toBe('a\nb\tc');
  });
});

describe('element', () => {
  test('writes a tag with escaped attributes', () => {
    expect(element('div', { class: 'circuit' }, 'x')).toBe('<div class="circuit">x</div>');
  });

  test('escapes an attribute value that carries a quote', () => {
    expect(element('div', { title: '"x"' }, '')).toBe('<div title="&quot;x&quot;"></div>');
  });

  test('leaves out an attribute that has no value', () => {
    expect(element('div', { class: 'circuit', title: undefined }, 'x')).toBe('<div class="circuit">x</div>');
  });

  test('does not escape the children, which the caller has already built', () => {
    expect(element('div', {}, '<span>x</span>')).toBe('<div><span>x</span></div>');
  });
});
