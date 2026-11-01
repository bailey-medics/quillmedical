/**
 * Read the names of the files in a zip the browser saved.
 *
 * Enough for a test to say what a person would find on opening a
 * downloaded bundle, without a zip library: every zip ends with a
 * directory listing each file's name, and this reads that listing.
 * Contents are not read. See the zip format's description, section 4.3
 * of https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT.
 */

import fs from "node:fs";

/** Marks the record at the end of a zip that says where its listing is. */
const END_OF_LISTING = 0x06054b50;

/** Marks each entry in the listing. */
const LISTING_ENTRY = 0x02014b50;

/** The names of every file in the zip at *path*. */
export function namesInZip(path: string): string[] {
  const zip = fs.readFileSync(path);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

  if (end < 0 || zip.readUInt32LE(end) !== END_OF_LISTING) {
    throw new Error(`${path} is not a zip`);
  }

  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names: string[] = [];

  for (let entry = 0; entry < count; entry += 1) {
    if (zip.readUInt32LE(offset) !== LISTING_ENTRY) {
      throw new Error(`${path} has a damaged listing`);
    }

    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return names;
}
