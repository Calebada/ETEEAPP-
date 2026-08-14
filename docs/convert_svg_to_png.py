from pathlib import Path
import cairosvg

root = Path(__file__).resolve().parent
svg = root / 'architecture.svg'
png = root / 'architecture.png'

if not svg.exists():
    raise SystemExit(f"SVG not found: {svg}")

cairosvg.svg2png(url=str(svg), write_to=str(png), output_width=1600)
print('Wrote', png)
