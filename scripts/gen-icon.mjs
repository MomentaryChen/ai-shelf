import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "../src/assets");
const svgPath = join(assetsDir, "icon.svg");
const svgBuf = readFileSync(svgPath);

/** Windows .ico sizes */
const icoSizes = [16, 32, 48, 64, 128, 256];
/** Linux / macOS packaging + runtime window icon */
const PNG_SIZE = 1024;

async function main() {
  const pngBuffers = await Promise.all(
    icoSizes.map((s) =>
      sharp(svgBuf, { density: 300 })
        .resize(s, s)
        .png()
        .toBuffer(),
    ),
  );

  const ico = await pngToIco(pngBuffers);
  const icoPath = join(assetsDir, "icon.ico");
  writeFileSync(icoPath, ico);
  console.log(`✅ icon.ico written (${icoSizes.join(", ")}px)`);

  const pngPath = join(assetsDir, "icon.png");
  await sharp(svgBuf, { density: 300 }).resize(PNG_SIZE, PNG_SIZE).png().toFile(pngPath);
  console.log(`✅ icon.png written (${PNG_SIZE}px) for mac/linux`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
