export function hashString(string) {
  let hash = 0
  if (string.length === 0) return hash
  for (let i = 0; i < string.length; i++) {
    const chr = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash
}

// from https://stackoverflow.com/a/47593316/6257921
export function mulberry32(seed) {
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
