// Zips dist/ as release/triffidesu-site.zip, ready to extract in public_html
// with 20i's File Manager. Run through `npm run package`, which builds first.
import { deflateRawSync, crc32 } from 'node:zlib';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative('dist', path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .sort();

const local = [];
const central = [];
let offset = 0;
for (const name of files) {
  const data = await readFile(path.join('dist', name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  // Local file header, then the data. Flag 0x0800: names are UTF-8.
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  local.push(header, nameBytes, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(0x031e, 4); // made by Unix, so permissions below apply
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBytes.length, 28);
  entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBytes);

  offset += header.length + nameBytes.length + packed.length;
}

const centralSize = central.reduce((sum, buf) => sum + buf.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

await mkdir('release', { recursive: true });
await writeFile('release/triffidesu-site.zip', Buffer.concat([...local, ...central, end]));
console.log(`release/triffidesu-site.zip: ${files.length} files, ${(offset / 1048576).toFixed(1)}MB`);
