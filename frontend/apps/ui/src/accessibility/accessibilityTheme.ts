import type {MantineThemeOverride} from "@mantine/core"
import {rem} from "@mantine/core"

/** Mantine overrides: larger type, spacing, and touch targets (GOST R 52872 / WCAG). */
export const accessibilityThemeOverrides: MantineThemeOverride = {
  focusRing: "always",
  fontFamily:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  fontSizes: {
    xs: rem(14),
    sm: rem(16),
    md: rem(18),
    lg: rem(22),
    xl: rem(26)
  },
  lineHeights: {
    xs: "1.55",
    sm: "1.55",
    md: "1.6",
    lg: "1.6",
    xl: "1.65"
  },
  spacing: {
    xs: rem(12),
    sm: rem(16),
    md: rem(20),
    lg: rem(28),
    xl: rem(36)
  },
  headings: {
    fontWeight: "700",
    sizes: {
      h1: {fontSize: rem(40), lineHeight: "1.25"},
      h2: {fontSize: rem(34), lineHeight: "1.3"},
      h3: {fontSize: rem(28), lineHeight: "1.35"},
      h4: {fontSize: rem(24), lineHeight: "1.4"},
      h5: {fontSize: rem(20), lineHeight: "1.45"},
      h6: {fontSize: rem(18), lineHeight: "1.5"}
    }
  },
  defaultRadius: rem(4),
  components: {
    Button: {
      defaultProps: {
        size: "md"
      },
      styles: {
        root: {
          minHeight: rem(48),
          fontWeight: 600
        }
      }
    },
    ActionIcon: {
      defaultProps: {
        size: "lg"
      },
      styles: {
        root: {
          minWidth: rem(48),
          minHeight: rem(48)
        }
      }
    },
    TextInput: {
      defaultProps: {
        size: "md"
      }
    },
    Select: {
      defaultProps: {
        size: "md"
      }
    },
    Switch: {
      styles: {
        track: {
          minWidth: rem(52),
          minHeight: rem(28),
          cursor: "pointer"
        },
        thumb: {
          width: rem(22),
          height: rem(22)
        }
      }
    },
    Table: {
      styles: {
        th: {
          fontSize: rem(16),
          fontWeight: 700
        },
        td: {
          fontSize: rem(16)
        }
      }
    },
    NavLink: {
      styles: {
        root: {
          fontSize: rem(16),
          fontWeight: 600,
          minHeight: rem(48)
        }
      }
    }
  }
}
