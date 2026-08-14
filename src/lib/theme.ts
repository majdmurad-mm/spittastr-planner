import type { Owner } from '../types'

export type ThemeName = 'paper' | 'dark'

export interface Theme {
  background: string
  /** Wall poché — the solid fill of a wall cut. */
  wall: string
  wallLine: string
  /** Structural thickness in metres, used for open wall traces. */
  wallWeight: number
  builtin: string
  builtinFill: string
  window: string
  windowGlass: string
  door: string
  furnitureLabel: string
  boundary: string
  clash: string
  clashFill: string
  warn: string
  warnFill: string
  owner: Record<Owner, { name: string; stroke: string; fill: string; fillSelected: string; symbol: string }>
}

export const THEMES: Record<ThemeName, Theme> = {
  // Architectural drawing: dark ink on warm paper.
  paper: {
    background: '#f4f1ea',
    wall: '#23262f',
    wallLine: '#23262f',
    wallWeight: 0.055,
    builtin: '#8d8778',
    builtinFill: 'rgba(141, 135, 120, 0.14)',
    window: '#3f4854',
    windowGlass: '#ffffff',
    door: '#9a958a',
    furnitureLabel: '#3a3f4b',
    boundary: '#7b8496',
    clash: '#c62f4e',
    clashFill: 'rgba(198, 47, 78, 0.20)',
    warn: '#b57516',
    warnFill: 'rgba(181, 117, 22, 0.20)',
    owner: {
      majd: {
        name: 'Majd',
        stroke: '#2a5db0',
        fill: 'rgba(42, 93, 176, 0.16)',
        fillSelected: 'rgba(42, 93, 176, 0.30)',
        symbol: '#2a5db0',
      },
      laura: {
        name: 'Laura',
        stroke: '#b8288f',
        fill: 'rgba(184, 40, 143, 0.16)',
        fillSelected: 'rgba(184, 40, 143, 0.30)',
        symbol: '#b8288f',
      },
    },
  },

  dark: {
    background: '#16161e',
    wall: '#a9b1d6',
    wallLine: '#c0caf5',
    wallWeight: 0.055,
    builtin: '#565f89',
    builtinFill: 'rgba(86, 95, 137, 0.18)',
    window: '#7dcfff',
    windowGlass: '#16161e',
    door: '#4a5273',
    furnitureLabel: '#c8d3f5',
    boundary: '#6b7394',
    clash: '#f7768e',
    clashFill: 'rgba(247, 118, 142, 0.32)',
    warn: '#e0af68',
    warnFill: 'rgba(224, 175, 104, 0.32)',
    owner: {
      majd: {
        name: 'Majd',
        stroke: '#7aa2f7',
        fill: 'rgba(122, 162, 247, 0.26)',
        fillSelected: 'rgba(122, 162, 247, 0.44)',
        symbol: '#9db9fa',
      },
      laura: {
        name: 'Laura',
        stroke: '#ff5fd2',
        fill: 'rgba(255, 95, 210, 0.26)',
        fillSelected: 'rgba(255, 95, 210, 0.44)',
        symbol: '#ff8ade',
      },
    },
  },
}
