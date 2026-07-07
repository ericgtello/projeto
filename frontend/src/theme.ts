// FitJourney theme tokens (dark-first utility).
export const theme = {
  color: {
    surface: "#0D0F12",
    onSurface: "#F2F4F7",
    surfaceSecondary: "#1A1D21",
    onSurfaceSecondary: "#98A2B3",
    surfaceTertiary: "#272A30",
    onSurfaceTertiary: "#D0D5DD",
    brand: "#FF5900",
    brandSecondary: "#FF7A33",
    brandTertiary: "#331200",
    onBrand: "#FFFFFF",
    success: "#00E676",
    warning: "#FFD600",
    error: "#FF3B30",
    border: "#272A30",
    borderStrong: "#474D57",
    divider: "#1A1D21",
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: {
    display: "System",
    text: "System",
  },
};

export type Theme = typeof theme;
