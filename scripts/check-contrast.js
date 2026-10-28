// SlotSync WCAG AA Automated Contrast Verification Script
// Computes relative luminance and contrast ratios for all design tokens.

function sRgbToLinear(c) {
  const norm = c / 255.0;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export const TOKENS = {
  ink: '#14212B',
  inkMuted: '#5B6770',
  surface: '#FAF8F5',
  card: '#FFFFFF',
  border: '#E7E2DA',
  accent: '#0F766E',
  accentHover: '#0B5D57',
  accentTint: '#E6F3F1',
  success: '#15803D',
  successTint: '#DCFCE7',
  warning: '#B45309',
  warningTint: '#FEF3C7',
  danger: '#B42318',
  dangerTint: '#FEE2E2',
  info: '#1D4ED8',
  infoTint: '#DBEAFE',
  white: '#FFFFFF',
};

export const PAIRS_TO_AUDIT = [
  { name: 'Body Ink on Surface', fg: TOKENS.ink, bg: TOKENS.surface, min: 4.5 },
  { name: 'Body Ink on Card', fg: TOKENS.ink, bg: TOKENS.card, min: 4.5 },
  { name: 'Muted Ink on Surface', fg: TOKENS.inkMuted, bg: TOKENS.surface, min: 4.5 },
  { name: 'Muted Ink on Card', fg: TOKENS.inkMuted, bg: TOKENS.card, min: 4.5 },
  { name: 'Accent Text on Surface', fg: TOKENS.accent, bg: TOKENS.surface, min: 4.5 },
  { name: 'Accent Text on Card', fg: TOKENS.accent, bg: TOKENS.card, min: 4.5 },
  { name: 'White Text on Accent Button', fg: TOKENS.white, bg: TOKENS.accent, min: 4.5 },
  { name: 'White Text on Accent Hover', fg: TOKENS.white, bg: TOKENS.accentHover, min: 4.5 },
  { name: 'Accent Badge (Text on Tint)', fg: TOKENS.accent, bg: TOKENS.accentTint, min: 4.5 },
  { name: 'Success Badge (Text on Tint)', fg: TOKENS.success, bg: TOKENS.successTint, min: 4.5 },
  { name: 'Warning Badge (Text on Tint)', fg: TOKENS.warning, bg: TOKENS.warningTint, min: 4.5 },
  { name: 'Danger Badge (Text on Tint)', fg: TOKENS.danger, bg: TOKENS.dangerTint, min: 4.5 },
  { name: 'Info Badge (Text on Tint)', fg: TOKENS.info, bg: TOKENS.infoTint, min: 4.5 },
];

export function runContrastCheck() {
  console.log('=== SlotSync WCAG AA Contrast Audit ===');
  let hasFailure = false;

  for (const pair of PAIRS_TO_AUDIT) {
    const ratio = getContrastRatio(pair.fg, pair.bg);
    const passed = ratio >= pair.min;
    const ratioStr = ratio.toFixed(2) + ':1';
    const tag = passed ? '[PASS]' : '[FAIL]';

    console.log(`${tag} ${pair.name}: ${ratioStr} (Required: >= ${pair.min}:1)`);
    if (!passed) hasFailure = true;
  }

  if (hasFailure) {
    console.error('\nERROR: Contrast check failed one or more WCAG AA criteria.');
    process.exit(1);
  } else {
    console.log('\nAll token pairs successfully meet WCAG AA requirements (>= 4.5:1).');
  }
}

// Run directly if executed as main module
runContrastCheck();
