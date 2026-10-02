import { ImageResponse } from "next/og";

/**
 * App icon: a coin split into two halves, on a teal tile.
 * Rendered to PNG at build time for the PWA manifest and Apple touch icon.
 */
export function renderAppIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const inner = maskable ? size * 0.5 : size * 0.6;
  const gap = Math.round(size * 0.05);
  const half = (inner - gap) / 2;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f766e",
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      <div style={{ display: "flex", gap }}>
        <div
          style={{
            width: half,
            height: inner,
            background: "#ffffff",
            borderTopLeftRadius: inner / 2,
            borderBottomLeftRadius: inner / 2,
          }}
        />
        <div
          style={{
            width: half,
            height: inner,
            background: "#99f6e4",
            borderTopRightRadius: inner / 2,
            borderBottomRightRadius: inner / 2,
          }}
        />
      </div>
    </div>,
    { width: size, height: size },
  );
}
