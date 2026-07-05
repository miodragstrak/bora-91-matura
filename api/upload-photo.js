import Busboy from "busboy";
import { randomBytes } from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new HttpError(500, "Missing GitHub configuration in environment variables.");
  }

  return { token, owner, repo };
}

function githubContentUrl(owner, repo, path) {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
}

async function getRepoFile({ owner, repo, token }, path) {
  const response = await fetch(githubContentUrl(owner, repo, path), {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const raw = await response.text();
    throw new HttpError(502, `GitHub read failed: ${raw}`);
  }

  return response.json();
}

async function putRepoFile({ owner, repo, token }, { path, message, bytes, sha }) {
  const payload = {
    message,
    content: Buffer.from(bytes).toString("base64")
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(githubContentUrl(owner, repo, path), {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new HttpError(502, `GitHub write failed: ${raw}`);
  }
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    let author = "";
    let comment = "";
    let consent = "";

    let photoMimeType = "";
    let photoBuffer = null;
    let photoFound = false;
    let fileTooLarge = false;

    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_FILE_SIZE,
        fields: 10
      }
    });

    bb.on("field", (fieldName, value) => {
      if (fieldName === "author") {
        author = String(value || "").trim();
      }

      if (fieldName === "comment") {
        comment = String(value || "").trim();
      }

      if (fieldName === "consent") {
        consent = String(value || "").trim().toLowerCase();
      }
    });

    bb.on("file", (fieldName, stream, info) => {
      if (fieldName !== "photo") {
        stream.resume();
        return;
      }

      photoFound = true;
      photoMimeType = info?.mimeType || "";

      const chunks = [];
      let total = 0;

      stream.on("data", (chunk) => {
        total += chunk.length;
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        fileTooLarge = true;
      });

      stream.on("end", () => {
        if (!fileTooLarge) {
          photoBuffer = Buffer.concat(chunks, total);
        }
      });
    });

    bb.on("error", (error) => {
      reject(new HttpError(400, `Invalid multipart request: ${error.message}`));
    });

    bb.on("finish", () => {
      if (consent !== "true") {
        return reject(new HttpError(400, "Consent must be explicitly accepted."));
      }

      if (!photoFound || !photoBuffer) {
        return reject(new HttpError(400, "Photo is required."));
      }

      if (fileTooLarge) {
        return reject(new HttpError(413, "Photo exceeds 10MB limit."));
      }

      if (!ALLOWED_MIME_TYPES.has(photoMimeType)) {
        return reject(new HttpError(400, "Only JPEG, PNG, and WEBP images are allowed."));
      }

      if (!author) {
        return reject(new HttpError(400, "Author is required."));
      }

      if (author.length > 120) {
        return reject(new HttpError(400, "Author is too long."));
      }

      if (comment.length > 500) {
        return reject(new HttpError(400, "Comment is too long."));
      }

      resolve({
        photoBuffer,
        author,
        comment,
        consent
      });
    });

    req.pipe(bb);
  });
}

function createPhotoFileName(now = new Date()) {
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const random = randomBytes(2).toString("hex");

  return `${yyyy}${mm}${dd}-${hh}${min}${ss}-${random}.jpg`;
}

function isoWithoutMilliseconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const github = getGitHubConfig();
    const { photoBuffer, author, comment } = await parseMultipartUpload(req);

    const now = new Date();
    const fileName = createPhotoFileName(now);
    const uploaded = isoWithoutMilliseconds(now);

    await putRepoFile(github, {
      path: `photos/${fileName}`,
      message: `Add reunion photo ${fileName}`,
      bytes: photoBuffer
    });

    const photosIndexPath = "photos/photos.json";
    const existingIndexFile = await getRepoFile(github, photosIndexPath);

    let existingEntries = [];
    let existingSha;

    if (existingIndexFile?.content) {
      existingSha = existingIndexFile.sha;
      const decoded = Buffer.from(existingIndexFile.content, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        existingEntries = parsed;
      }
    }

    const nextEntry = {
      file: fileName,
      author,
      comment,
      uploaded
    };

    const nextIndex = [nextEntry, ...existingEntries];

    await putRepoFile(github, {
      path: photosIndexPath,
      message: `Update photo index for ${fileName}`,
      bytes: JSON.stringify(nextIndex, null, 2),
      sha: existingSha
    });

    return res.status(201).json({
      ok: true,
      file: fileName,
      uploaded
    });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || "Upload failed"
    });
  }
}
