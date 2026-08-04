const sharp = require('sharp');

async function gridScan(path, cell) {
  const img = sharp(path);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  console.log(`\n=== ${path} (${width}x${height}) — cell=${cell}px ===`);
  let header = '     ';
  for (let cx = 0; cx < cols; cx++) header += String(cx * cell).padStart(3, ' ') + ' ';
  console.log(header);
  for (let ry = 0; ry < rows; ry++) {
    let row = String(ry * cell).padStart(4, ' ') + ' ';
    for (let cx = 0; cx < cols; cx++) {
      let hasPixel = false;
      for (let dy = 0; dy < cell && !hasPixel; dy++) {
        for (let dx = 0; dx < cell && !hasPixel; dx++) {
          const px = cx * cell + dx, py = ry * cell + dy;
          if (px >= width || py >= height) continue;
          const idx = (py * width + px) * channels;
          const alpha = data[idx + 3];
          if (alpha > 10) hasPixel = true;
        }
      }
      row += (hasPixel ? ' # ' : ' . ') + ' ';
    }
    console.log(row);
  }
}

(async () => {
  const dir = process.argv[2] || '.';
  await gridScan(dir + '/steve.png', 4);
  await gridScan(dir + '/iron_layer_1.png', 4);
  await gridScan(dir + '/iron_layer_2.png', 4);
})();
