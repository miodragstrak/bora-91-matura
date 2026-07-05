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

function getAdminSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new HttpError(500, "Missing ADMIN_SECRET environment variable.");
  }

  return secret;
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

async function deleteRepoFile({ owner, repo, token }, { path, message, sha }) {
  const response = await fetch(githubContentUrl(owner, repo, path), {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, sha })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new HttpError(502, `GitHub delete failed: ${raw}`);
  }
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      throw new HttpError(400, "Invalid JSON body.");
    }
  }

  if (typeof req.body === "object") {
    return req.body;
  }

  return {};
}

function normalizeFileName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/^\/+/, "").split("/").pop() || "";
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const github = getGitHubConfig();
    const adminSecret = getAdminSecret();
    const body = parseBody(req);

    const providedAdmin = String(body.admin || "");
    if (!providedAdmin || providedAdmin !== adminSecret) {
      throw new HttpError(403, "Forbidden");
    }

    const fileName = normalizeFileName(body.file);
    if (!fileName) {
      throw new HttpError(400, "Missing file name.");
    }

    const photoPath = `photos/${fileName}`;
    const repoPhoto = await getRepoFile(github, photoPath);
    if (!repoPhoto?.sha) {
      throw new HttpError(404, "Photo not found.");
    }

    await deleteRepoFile(github, {
      path: photoPath,
      message: `Delete reunion photo ${fileName}`,
      sha: repoPhoto.sha
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

    const nextIndex = existingEntries.filter((entry) => normalizeFileName(entry?.file) !== fileName);

    await putRepoFile(github, {
      path: photosIndexPath,
      message: `Update photo index after delete ${fileName}`,
      bytes: JSON.stringify(nextIndex, null, 2),
      sha: existingSha
    });

    return res.status(200).json({
      ok: true,
      deleted: fileName
    });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || "Delete failed"
    });
  }
}
