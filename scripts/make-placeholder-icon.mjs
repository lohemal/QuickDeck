// 임시 앱 아이콘(1024x1024 PNG)을 외부 라이브러리 없이 만든다.
// 사용: node scripts/make-placeholder-icon.mjs  →  app-icon.png  →  npx tauri icon app-icon.png
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 1024
const rows = []
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 4)
  row[0] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    // 둥근 사각형 배경 + 2x2 격자 (덱을 암시하는 단순 모양)
    const r = 180
    const inRounded = insideRoundedRect(x, y, 64, 64, SIZE - 128, SIZE - 128, r)
    let [R, G, B, A] = [0, 0, 0, 0]
    if (inRounded) {
      ;[R, G, B, A] = [0x2f, 0x3a, 0x4f, 255]
      const cells = [
        [224, 224],
        [544, 224],
        [224, 544],
        [544, 544],
      ]
      for (const [cx, cy] of cells) {
        if (insideRoundedRect(x, y, cx, cy, 256, 256, 48)) [R, G, B, A] = [0xe8, 0xed, 0xf5, 255]
      }
    }
    const o = 1 + x * 4
    row[o] = R
    row[o + 1] = G
    row[o + 2] = B
    row[o + 3] = A
  }
  rows.push(row)
}

function insideRoundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x >= rx + w || y >= ry + h) return false
  const dx = Math.max(rx + r - x, 0, x - (rx + w - r))
  const dy = Math.max(ry + r - y, 0, y - (ry + h - r))
  return dx * dx + dy * dy <= r * r
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync('app-icon.png', png)
console.log('app-icon.png written')
