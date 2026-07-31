// Attachment file storage. This is the ONE seam to swap when going public:
// today it writes to the local filesystem; a public deployment would drop in an
// S3 / Cloudflare R2 implementation exposing the same interface. Keeping all
// file I/O behind this boundary is what makes that migration a one-file change.
import fs from "node:fs";
import path from "node:path";

/** Create a local-filesystem storage backend rooted at `dir` (one file per id). */
export function createStorage({ dir }) {
  fs.mkdirSync(dir, { recursive: true });
  const fileFor = (id) => path.join(dir, id);
  return {
    dir,
    /** Persist raw bytes for `id`. */
    write(id, buffer) {
      fs.writeFileSync(fileFor(id), buffer);
    },
    /** True if bytes exist for `id`. */
    exists(id) {
      return fs.existsSync(fileFor(id));
    },
    /** Copy stored bytes from `srcId` to a new `destId`. */
    copy(srcId, destId) {
      fs.copyFileSync(fileFor(srcId), fileFor(destId));
    },
    /** Delete stored bytes for `id` (no-op if absent). */
    remove(id) {
      fs.rmSync(fileFor(id), { force: true });
    },
    /** A readable stream of the stored bytes for `id`. */
    createReadStream(id) {
      return fs.createReadStream(fileFor(id));
    },
  };
}
