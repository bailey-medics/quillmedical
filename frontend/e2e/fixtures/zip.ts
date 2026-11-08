/**
 * Read a zip the browser saved: the names of its files, and one file's
 * text.
 *
 * Enough for a test to say what a person would find on opening a
 * downloaded bundle, without a zip library: every zip ends with a
 * directory listing each file's name and where its bytes are, and this
 * reads that listing. See the zip format's description, sections 4.3
 * and 4.4 of https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT.
 */

import fs from "node:fs";
import zlib from "node:zlib";

/** Marks the record at the end of a zip that says where its listing is. */
const END_OF_LISTING = 0x06054b50;

/** Marks each entry in the listing. */
const LISTING_ENTRY = 0x02014b50;

/** Marks the header in front of each file's bytes. */
const FILE_HEADER = 0x04034b50;

/** How a file's bytes are kept: as they are, or deflated. */
const STORED = 0;
const DEFLATED = 8;

/** One file in the zip's listing, and where its bytes start. */
interface ListedFile {
  name: string;
  method: number;
  compressedSize: number;
  headerOffset: number;
}

/** Every file in the listing of *zip*, read from the file at *path*. */
function listing(zip: Buffer, path: string): ListedFile[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

  if (end < 0 || zip.readUInt32LE(end) !== END_OF_LISTING) {
    throw new Error(`${path} is not a zip`);
  }

  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const files: ListedFile[] = [];

  for (let entry = 0; entry < count; entry += 1) {
    if (zip.readUInt32LE(offset) !== LISTING_ENTRY) {
      throw new Error(`${path} has a damaged listing`);
    }

    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    files.push({
      name: zip.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      headerOffset: zip.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/** The names of every file in the zip at *path*. */
export function namesInZip(path: string): string[] {
  return listing(fs.readFileSync(path), path).map((file) => file.name);
}

/**
 * The text of the one file in the zip at *path* whose name ends with
 * *ending*, as a person would read on opening it.
 *
 * Throws unless exactly one file matches, so a test cannot read the
 * wrong one without saying so.
 */
export function textInZip(path: string, ending: string): string {
  const zip = fs.readFileSync(path);
  const matching = listing(zip, path).filter((file) =>
    file.name.endsWith(ending),
  );

  if (matching.length !== 1) {
    throw new Error(
      `${path} has ${matching.length} files ending ${ending}, not one`,
    );
  }

  const file = matching[0];
  if (zip.readUInt32LE(file.headerOffset) !== FILE_HEADER) {
    throw new Error(`${path} has a damaged header for ${file.name}`);
  }

  // The header repeats the name and may carry its own extra field, of a
  // length that can differ from the listing's, so both are read here.
  const nameLength = zip.readUInt16LE(file.headerOffset + 26);
  const extraLength = zip.readUInt16LE(file.headerOffset + 28);
  const start = file.headerOffset + 30 + nameLength + extraLength;
  const bytes = zip.subarray(start, start + file.compressedSize);

  if (file.method === STORED) return bytes.toString("utf8");
  if (file.method === DEFLATED) {
    return zlib.inflateRawSync(bytes).toString("utf8");
  }

  throw new Error(`${file.name} is kept in a way this cannot read`);
}
