/**
 * Predefined gradient color combinations for ProfilePic avatars.
 * Each gradient flows from a darker base color to a lighter shade.
 *
 * These colors are designed to be highly distinguishable for clinical use,
 * ensuring patients can be quickly identified at a glance.
 */

export interface AvatarGradient {
  colorFrom: string;
  colorTo: string;
}

/**
 * Array of 30 predefined gradient combinations.
 * Access by index (0-29) for consistent avatar colors.
 */
export const AVATAR_GRADIENTS: AvatarGradient[] = [
  // Row 1: Primary colors
  { colorFrom: "#F44336", colorTo: "#E57373" }, // 0: Red
  { colorFrom: "#2196F3", colorTo: "#64B5F6" }, // 1: Blue
  { colorFrom: "#4CAF50", colorTo: "#81C784" }, // 2: Green
  { colorFrom: "#9C27B0", colorTo: "#BA68C8" }, // 3: Purple
  { colorFrom: "#E91E63", colorTo: "#F06292" }, // 4: Pink
  { colorFrom: "#FF9800", colorTo: "#FFB74D" }, // 5: Orange

  // Row 2: Bright colors
  { colorFrom: "#00BCD4", colorTo: "#4DD0E1" }, // 6: Cyan
  { colorFrom: "#FFEB3B", colorTo: "#FFF176" }, // 7: Yellow
  { colorFrom: "#673AB7", colorTo: "#9575CD" }, // 8: Deep Purple
  { colorFrom: "#009688", colorTo: "#4DB6AC" }, // 9: Teal
  { colorFrom: "#FF4081", colorTo: "#FF80AB" }, // 10: Hot Pink
  { colorFrom: "#8BC34A", colorTo: "#AED581" }, // 11: Lime Green

  // Row 3: Rich tones
  { colorFrom: "#3F51B5", colorTo: "#7986CB" }, // 12: Indigo
  { colorFrom: "#FF5722", colorTo: "#FF8A65" }, // 13: Deep Orange
  { colorFrom: "#536DFE", colorTo: "#8C9EFF" }, // 14: Bright Indigo
  { colorFrom: "#69F0AE", colorTo: "#B9F6CA" }, // 15: Mint Green
  { colorFrom: "#F50057", colorTo: "#FF4081" }, // 16: Deep Pink
  { colorFrom: "#03A9F4", colorTo: "#4FC3F7" }, // 17: Light Blue

  // Row 4: Vibrant accents
  { colorFrom: "#7C4DFF", colorTo: "#B388FF" }, // 18: Bright Purple
  { colorFrom: "#1DE9B6", colorTo: "#64FFDA" }, // 19: Bright Teal
  { colorFrom: "#FF80AB", colorTo: "#FFC1E3" }, // 20: Light Pink
  { colorFrom: "#B39DDB", colorTo: "#D1C4E9" }, // 21: Lavender
  { colorFrom: "#FFD740", colorTo: "#FFE57F" }, // 22: Gold
  { colorFrom: "#00796B", colorTo: "#009688" }, // 23: Dark Teal

  // Row 5: Special colors
  { colorFrom: "#E0E0E0", colorTo: "#F5F5F5" }, // 24: Light Grey
  { colorFrom: "#FFF44F", colorTo: "#FFEB3B" }, // 25: Lemon Yellow
  { colorFrom: "#FF6E40", colorTo: "#FF9E80" }, // 26: Coral
  { colorFrom: "#9FA8DA", colorTo: "#C5CAE9" }, // 27: Periwinkle
  { colorFrom: "#FF1744", colorTo: "#FF5252" }, // 28: Bright Red
  { colorFrom: "#00E676", colorTo: "#69F0AE" }, // 29: Bright Green
];

/**
 * Get a gradient by index. Returns the gradient at the specified index,
 * or wraps around if index exceeds array length.
 *
 * @param index - Index to retrieve (0-based)
 * @returns The gradient color pair
 */
export function getGradient(index: number): AvatarGradient {
  return AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
}
