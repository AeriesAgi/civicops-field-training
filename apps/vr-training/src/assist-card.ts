import {assistCanvasSize,ASSIST_TEXT_DENSITY} from './training/assist-texture-budget.js';
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/** Glasses-style translucent card drawn on a canvas. Redrawn only when its content changes. */
export interface CardSpec {
  eyebrow?: string;
  title: string;
  lines?: string[];
  small?: string;
  tone?: 'dark' | 'stop' | 'warn' | 'ok' | 'button' | 'button-stop' | 'button-ok' | 'chip';
  chips?: { text: string; shape: 'triangle' | 'square' | 'circle' | 'diamond'; color: string }[];
  dots?: { total: number; done: number };
  icon?: 'bolt' | 'flame' | 'trench' | 'drop' | 'gas' | 'shield' | 'compass' | 'sos' | 'list' | 'eye';
  highContrast?: boolean;
  /** Single-row banner: icon, bold title and one supporting line. */
  compact?: boolean;
}

const TONES: Record<NonNullable<CardSpec['tone']>, { bg: string; fg: string; accent: string; border: string }> = {
  dark: { bg: 'rgba(10,22,28,0.86)', fg: '#ffffff', accent: '#8fe3d6', border: 'rgba(143,227,214,0.55)' },
  stop: { bg: 'rgba(120,10,16,0.92)', fg: '#ffffff', accent: '#ffd2d2', border: '#ff5a5a' },
  warn: { bg: 'rgba(110,70,0,0.92)', fg: '#ffffff', accent: '#ffe08a', border: '#ffc93c' },
  ok: { bg: 'rgba(14,70,44,0.9)', fg: '#ffffff', accent: '#b6f5cf', border: '#4fd68b' },
  button: { bg: 'rgba(232,244,241,0.95)', fg: '#0b2a33', accent: '#0b2a33', border: '#0b2a33' },
  'button-stop': { bg: 'rgba(190,24,32,0.96)', fg: '#ffffff', accent: '#ffffff', border: '#ffffff' },
  'button-ok': { bg: 'rgba(22,110,64,0.96)', fg: '#ffffff', accent: '#ffffff', border: '#ffffff' },
  chip: { bg: 'rgba(10,22,28,0.8)', fg: '#d8fff6', accent: '#8fe3d6', border: 'rgba(143,227,214,0.5)' },
};



function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function shape(ctx: CanvasRenderingContext2D, kind: 'triangle' | 'square' | 'circle' | 'diamond', cx: number, cy: number, s: number): void {
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(cx, cy, s, 0, Math.PI * 2);
  else if (kind === 'square') ctx.rect(cx - s, cy - s, s * 2, s * 2);
  else if (kind === 'diamond') { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); }
  else { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * 0.85); ctx.lineTo(cx - s, cy + s * 0.85); ctx.closePath(); }
}

function icon(ctx: CanvasRenderingContext2D, kind: NonNullable<CardSpec['icon']>, x: number, y: number, s: number, color: string): void {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const c = (fx: number, fy: number): [number, number] => [x + fx * s, y + fy * s];
  ctx.beginPath();
  switch (kind) {
    case 'bolt': ctx.moveTo(...c(0.55, 0)); ctx.lineTo(...c(0.2, 0.55)); ctx.lineTo(...c(0.48, 0.55)); ctx.lineTo(...c(0.35, 1)); ctx.lineTo(...c(0.8, 0.4)); ctx.lineTo(...c(0.52, 0.4)); ctx.closePath(); ctx.fill(); break;
    case 'flame': ctx.moveTo(...c(0.5, 0)); ctx.bezierCurveTo(...c(0.95, 0.4), ...c(0.85, 1), ...c(0.5, 1)); ctx.bezierCurveTo(...c(0.15, 1), ...c(0.05, 0.5), ...c(0.5, 0)); ctx.fill(); break;
    case 'drop': ctx.moveTo(...c(0.5, 0)); ctx.bezierCurveTo(...c(0.95, 0.55), ...c(0.8, 1), ...c(0.5, 1)); ctx.bezierCurveTo(...c(0.2, 1), ...c(0.05, 0.55), ...c(0.5, 0)); ctx.fill(); break;
    case 'trench': ctx.moveTo(...c(0, 0.35)); ctx.lineTo(...c(0.25, 0.35)); ctx.lineTo(...c(0.35, 0.9)); ctx.lineTo(...c(0.65, 0.9)); ctx.lineTo(...c(0.75, 0.35)); ctx.lineTo(...c(1, 0.35)); ctx.stroke(); break;
    case 'gas': ctx.arc(...c(0.5, 0.6), s * 0.32, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(...c(0.3, 0.2)); ctx.quadraticCurveTo(...c(0.5, 0), ...c(0.7, 0.2)); ctx.stroke(); break;
    case 'shield': ctx.moveTo(...c(0.5, 0)); ctx.lineTo(...c(0.9, 0.15)); ctx.lineTo(...c(0.85, 0.6)); ctx.lineTo(...c(0.5, 1)); ctx.lineTo(...c(0.15, 0.6)); ctx.lineTo(...c(0.1, 0.15)); ctx.closePath(); ctx.stroke(); break;
    case 'compass': ctx.arc(...c(0.5, 0.5), s * 0.45, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(...c(0.5, 0.12)); ctx.lineTo(...c(0.62, 0.5)); ctx.lineTo(...c(0.5, 0.88)); ctx.lineTo(...c(0.38, 0.5)); ctx.closePath(); ctx.fill(); break;
    case 'sos': ctx.arc(...c(0.5, 0.5), s * 0.45, 0, Math.PI * 2); ctx.stroke(); ctx.font = `800 ${s * 0.32}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SOS', ...c(0.5, 0.52)); break;
    case 'list': for (let i = 0; i < 3; i += 1) { ctx.moveTo(...c(0.1, 0.2 + i * 0.3)); ctx.lineTo(...c(0.9, 0.2 + i * 0.3)); } ctx.stroke(); break;
    case 'eye': ctx.moveTo(...c(0, 0.5)); ctx.quadraticCurveTo(...c(0.5, 0), ...c(1, 0.5)); ctx.quadraticCurveTo(...c(0.5, 1), ...c(0, 0.5)); ctx.stroke(); ctx.beginPath(); ctx.arc(...c(0.5, 0.5), s * 0.15, 0, Math.PI * 2); ctx.fill(); break;
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

export class AssistCard {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private key = '';

  constructor(readonly widthM: number, readonly heightM: number, density=ASSIST_TEXT_DENSITY) {
    this.canvas = document.createElement('canvas');
    const size=assistCanvasSize(widthM,heightM,density);
    this.canvas.width=size.width;this.canvas.height=size.height;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 900;
  }

  draw(spec: CardSpec): void {
    const key = JSON.stringify(spec);
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const W = this.canvas.width; const H = this.canvas.height; const u = H / 100;
    const base = TONES[spec.tone ?? 'dark'];
    // High contrast keeps meaning: stop/No stays red (thick red border, red-on-black); go stays yellow.
    const t = spec.tone ?? 'dark';
    const stopLike = t === 'stop' || t === 'button-stop';
    const tone = !spec.highContrast ? base
      : stopLike ? { bg: '#000000', fg: '#ffffff', accent: '#ff3b3b', border: '#ff3b3b' }
        : t.startsWith('button') ? { bg: '#ffff00', fg: '#000000', accent: '#000000', border: '#ffffff' }
          : { bg: '#000000', fg: '#ffffff', accent: '#ffff00', border: '#ffffff' };
    ctx.clearRect(0, 0, W, H);
    const pad = Math.min(W, H) * 0.06;
    round(ctx, 3, 3, W - 6, H - 6, Math.min(W, H) * 0.12); ctx.fillStyle = tone.bg; ctx.fill();
    ctx.lineWidth = Math.max(3, Math.min(W, H) * (spec.highContrast && stopLike ? 0.06 : 0.02)); ctx.strokeStyle = tone.border; ctx.stroke();
    if (spec.compact) {
      const s = H * 0.56; let x = H * 0.22;
      if (spec.icon) { icon(ctx, spec.icon, x, (H - s) / 2, s, tone.accent); x += s + H * 0.2; }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = tone.fg;
      ctx.font = `800 ${H * 0.34}px system-ui, sans-serif`; ctx.fillText(spec.title, x, H * 0.46);
      ctx.fillStyle = tone.accent; ctx.font = `600 ${H * 0.21}px system-ui, sans-serif`; ctx.fillText(spec.lines?.[0] ?? '', x, H * 0.8, W - x - H * 0.2);
      this.texture.needsUpdate = true;
      return;
    }
    const isButton = spec.tone?.startsWith('button') || spec.tone === 'chip';
    if (isButton) {
      let x = W / 2;
      ctx.font = `700 ${H * 0.36}px system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = spec.highContrast && stopLike ? '#ff5c5c' : tone.fg;
      const tw = ctx.measureText(spec.title).width;
      if (spec.icon) { const s = H * 0.42; const total = s + H * 0.15 + tw; x = (W - total) / 2; icon(ctx, spec.icon, x, (H - s) / 2, s, tone.accent); x += s + H * 0.15; ctx.textAlign = 'left'; ctx.fillText(spec.title, x, H / 2); }
      else { ctx.textAlign = 'center'; ctx.fillText(spec.title, x, H / 2); }
      this.texture.needsUpdate = true;
      return;
    }
    let y = pad;
    let left = pad;
    if (spec.icon) { const s = 13 * u; icon(ctx, spec.icon, pad, y + 1 * u, s, tone.accent); left = pad + s + 3 * u; }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (spec.eyebrow) { ctx.fillStyle = tone.accent; ctx.font = `700 ${5.2 * u}px system-ui, sans-serif`; ctx.fillText(spec.eyebrow.toUpperCase(), left, y); y += 7.5 * u; }
    ctx.fillStyle = tone.fg; ctx.font = `800 ${9 * u}px system-ui, sans-serif`;
    for (const line of wrap(ctx, spec.title, W - left - pad)) { ctx.fillText(line, left, y); y += 10.5 * u; }
    y = Math.max(y, spec.icon ? pad + 15 * u : y) + 1.5 * u;
    ctx.font = `500 ${6.2 * u}px system-ui, sans-serif`;
    for (const text of spec.lines ?? []) for (const line of wrap(ctx, text, W - 2 * pad)) { ctx.fillText(line, pad, y); y += 7.6 * u; }
    if (spec.chips?.length) {
      y += 1.5 * u; let x = pad; ctx.font = `700 ${5 * u}px system-ui, sans-serif`;
      for (const chip of spec.chips) {
        const w = ctx.measureText(chip.text).width + 12 * u;
        if (x + w > W - pad) { x = pad; y += 9.5 * u; }
        round(ctx, x, y, w, 8 * u, 2 * u); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = chip.color; ctx.lineWidth = 0.5 * u; ctx.stroke();
        ctx.fillStyle = chip.color; shape(ctx, chip.shape, x + 4.5 * u, y + 4 * u, 2.2 * u); ctx.fill();
        ctx.fillStyle = tone.fg; ctx.fillText(chip.text, x + 8.5 * u, y + 1.6 * u); x += w + 2 * u;
      }
      y += 10 * u;
    }
    if (spec.dots) {
      const r = 1.6 * u; const gap = 5 * u; const by = H - pad - 9 * u;
      for (let i = 0; i < spec.dots.total; i += 1) { ctx.beginPath(); ctx.arc(pad + r + i * gap, by, r, 0, Math.PI * 2); ctx.fillStyle = i < spec.dots.done ? tone.accent : 'rgba(255,255,255,0.25)'; ctx.fill(); }
    }
    if (spec.small) { ctx.fillStyle = tone.accent; ctx.font = `600 ${4.6 * u}px system-ui, sans-serif`; ctx.textBaseline = 'bottom'; const lines = wrap(ctx, spec.small, W - 2 * pad); lines.forEach((line, i) => ctx.fillText(line, pad, H - pad - (lines.length - 1 - i) * 5.6 * u)); }
    this.texture.needsUpdate = true;
  }

  /** For compass and other custom drawings. */
  custom(key: string, painter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    painter(ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  dispose(): void { this.texture.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

export { icon as drawAssistIcon, shape as drawAssistShape };
