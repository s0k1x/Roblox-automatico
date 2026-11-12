// Ambientaciones de mapa (solo decorado: el campo y la física son idénticos en todos).
export const MAPS = [
  { id: 'clasico', name: 'Estadio Clásico' },
  { id: 'neon', name: 'Ciudad Neón' },
  { id: 'templo', name: 'Templo del Dragón' },
];

// Devuelve { group, update(dt) } o null si el mapa no tiene decorado propio.
export function buildTheme(THREE, scene, id) {
  return null;
}
