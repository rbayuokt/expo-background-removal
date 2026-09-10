import { Platform } from 'react-native';

/**
 * A gallery wall, not an editor. The product lifts a subject out of a photograph, which
 * is the language of cut-out photomontage: flat colour, a mounted print, large type.
 */
export const color = {
  wall: '#DEE3D5',
  wallDeep: '#D1D8C4',
  mat: '#F4F5EE',
  ink: '#1E231B',
  inkSoft: '#5B6255',
  inkFaint: '#8A9082',
  rule: '#BEC5B1',
  cobalt: '#2D3FA6',
  cobaltDeep: '#22318A',
  alert: '#9B3A2E',
  checkA: '#E7E9E0',
  checkB: '#D6DACC',
};

export const font = {
  display: Platform.select({ ios: 'Didot', default: 'serif' }) as string,
  sans: Platform.select({ ios: 'Avenir Next', default: 'sans-serif' }) as string,
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
};
