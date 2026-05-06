import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = crypto.randomBytes(12).toString("hex");
    cb(null, `${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.post(
  "/uploads",
  requireAuth(),
  upload.single("file"),
  (req, res): void => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }
    res.json({
      url: `/api/uploads/${file.filename}`,
      name: file.originalname,
    });
  },
);

router.get("/uploads/:filename", requireAuth(), (req, res) => {
  const filename = req.params.filename;
  if (!filename || Array.isArray(filename) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    res.status(400).json({ message: "Invalid filename" });
    return;
  }
  const safeName = String(filename);
  const filePath = path.join(UPLOAD_DIR, safeName);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
    res.status(400).json({ message: "Invalid path" });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: "Not found" });
    return;
  }
  res.sendFile(filePath);
});

export default router;
