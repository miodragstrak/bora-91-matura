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

async function getDefaultBranch({ owner, repo, token }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new HttpError(502, `GitHub repository metadata failed: ${raw}`);
  }

  const repoData = await response.json();
  return repoData.default_branch || "main";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const github = getGitHubConfig();
    const defaultBranch = await getDefaultBranch(github);
    const indexFile = await getRepoFile(github, "photos/photos.json");

    if (!indexFile?.content) {
      return res.status(200).json([]);
    }

    const decoded = Buffer.from(indexFile.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    const photos = Array.isArray(parsed) ? parsed : [];
    const withUrls = photos.map((photo) => {
      const safeFileName = String(photo?.file || "").replace(/^\/+/, "");
      return {
        ...photo,
        imageUrl: `https://raw.githubusercontent.com/${github.owner}/${github.repo}/${defaultBranch}/photos/${encodeURIComponent(safeFileName)}`
      };
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(withUrls);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || "Failed to load photos"
    });
  }
}
