import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, "../src/assets/icon.svg");
const svgBuf = readFileSync(svgPath);

const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
  const pngBuffers = await Promise.all(
    sizes.map((s) =>
      sharp(svgBuf, { density: 300 })
        .resize(s, s)
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(pngBuffers);
  const outPath = join(__dirname, "../src/assets/icon.ico");
  writeFileSync(outPath, ico);
  console.log(`✅ icon.ico written (${sizes.join(", ")}px)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
