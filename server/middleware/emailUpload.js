// ─────────────────────────────────────────────────────────────
// EMAIL ATTACHMENT UPLOAD (multer)
// Memory storage: Vercel (and most serverless platforms) run functions on
// a read-only filesystem with no persistent disk between invocations, so
// multer.diskStorage() cannot work in production there — it either throws
// or silently vanishes before the file can be attached/sent. Keeping the
// upload in memory (file.buffer) instead means it only ever needs to
// survive for the lifetime of a single request, which serverless supports
// fine. Mime allow-list + size cap unchanged; executables are never accepted.
// ─────────────────────────────────────────────────────────────
import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

// Deliberately broad (email carries many document types) but no
// executables / scripts / archives that commonly smuggle malware.
const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const BLOCKED_EXT = [
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".js", ".jse", ".vbs", ".vbe", ".ps1", ".sh", ".jar", ".app", ".dll",
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXT.includes(ext)) {
    return cb(new Error(`Executable files (${ext}) cannot be attached.`));
  }
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error(`File type "${file.mimetype}" is not allowed as an attachment.`));
  }
  cb(null, true);
};

const uploadEmailAttachment = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB per file — typical provider ceiling
    files: 10,                  // max attachments per message
  },
});

export default uploadEmailAttachment;