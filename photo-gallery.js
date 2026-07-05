(function () {
  const galleryGrid = document.getElementById("galleryGrid");
  const gallerySpinner = document.getElementById("gallerySpinner");
  const galleryEmpty = document.getElementById("galleryEmpty");
  const galleryError = document.getElementById("galleryError");

  const uploadModal = document.getElementById("uploadModal");
  const openUploadBtn = document.getElementById("openUploadModal");
  const closeUploadBtn = document.getElementById("closeUploadModal");
  const uploadCancelBtn = document.getElementById("uploadCancel");
  const uploadForm = document.getElementById("photoUploadForm");

  const uploadProgressWrap = document.getElementById("uploadProgressWrap");
  const uploadProgressBar = document.getElementById("uploadProgressBar");
  const uploadProgressText = document.getElementById("uploadProgressText");
  const uploadStatus = document.getElementById("uploadStatus");
  const uploadButton = document.getElementById("uploadSubmit");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function formatDate(isoDate) {
    if (!isoDate) return "";

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("sr-RS", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function showGalleryState(state) {
    if (!gallerySpinner || !galleryEmpty || !galleryError || !galleryGrid) {
      return;
    }

    gallerySpinner.hidden = true;
    galleryEmpty.hidden = true;
    galleryError.hidden = true;
    galleryGrid.hidden = true;

    if (state === "loading") {
      gallerySpinner.hidden = false;
      return;
    }

    if (state === "empty") {
      galleryEmpty.hidden = false;
      return;
    }

    if (state === "error") {
      galleryError.hidden = false;
      return;
    }

    if (state === "ready") {
      galleryGrid.hidden = false;
    }
  }

  function createPhotoCard(photo) {
    const card = document.createElement("article");
    card.className = "photo-card";

    const image = document.createElement("img");
    image.className = "photo-img";
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = photo.comment
      ? `Fotografija: ${photo.comment}`
      : `Fotografija autora ${photo.author || "Nepoznato"}`;
    image.src = photo.imageUrl || (photo.file ? `/photos/${encodeURIComponent(photo.file)}` : "");

    const meta = document.createElement("div");
    meta.className = "photo-meta";

    const author = document.createElement("p");
    author.className = "photo-author";
    author.textContent = photo.author || "Nepoznat autor";

    const comment = document.createElement("p");
    comment.className = "photo-comment";
    comment.innerHTML = escapeHtml(photo.comment || "");
    comment.hidden = !photo.comment;

    const date = document.createElement("p");
    date.className = "photo-date";
    date.textContent = formatDate(photo.uploaded);

    meta.appendChild(author);
    meta.appendChild(comment);
    meta.appendChild(date);

    card.appendChild(image);
    card.appendChild(meta);

    return card;
  }

  async function loadGallery() {
    if (!galleryGrid) {
      return;
    }

    showGalleryState("loading");
    galleryGrid.innerHTML = "";

    try {
      const response = await fetch("/api/photos", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Failed to load gallery (${response.status})`);
      }

      const photos = await response.json();
      if (!Array.isArray(photos) || photos.length === 0) {
        showGalleryState("empty");
        return;
      }

      const fragment = document.createDocumentFragment();
      photos.forEach(function (photo) {
        fragment.appendChild(createPhotoCard(photo));
      });

      galleryGrid.appendChild(fragment);
      showGalleryState("ready");
    } catch (_error) {
      showGalleryState("error");
    }
  }

  function openModal() {
    if (!uploadModal) return;

    uploadModal.hidden = false;
    uploadModal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    if (!uploadModal) return;

    uploadModal.classList.remove("is-open");
    uploadModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function resetUploadState() {
    if (!uploadProgressWrap || !uploadProgressBar || !uploadProgressText || !uploadStatus || !uploadButton) {
      return;
    }

    uploadProgressWrap.hidden = true;
    uploadProgressBar.value = 0;
    uploadProgressText.textContent = "0%";
    uploadStatus.textContent = "";
    uploadStatus.className = "small muted";
    uploadButton.disabled = false;
  }

  function submitUpload(formData) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload-photo", true);

      xhr.upload.onprogress = function (event) {
        if (!event.lengthComputable || !uploadProgressWrap || !uploadProgressBar || !uploadProgressText) {
          return;
        }

        const percentage = Math.round((event.loaded / event.total) * 100);
        uploadProgressWrap.hidden = false;
        uploadProgressBar.value = percentage;
        uploadProgressText.textContent = `${percentage}%`;
      };

      xhr.onerror = function () {
        reject(new Error("Network error"));
      };

      xhr.onload = function () {
        let payload = {};

        try {
          payload = JSON.parse(xhr.responseText || "{}");
        } catch (_error) {
          payload = {};
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }

        reject(new Error(payload.error || "Upload failed"));
      };

      xhr.send(formData);
    });
  }

  function bindUploadForm() {
    if (!uploadForm) {
      return;
    }

    uploadForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!uploadButton || !uploadStatus) {
        return;
      }

      uploadButton.disabled = true;
      uploadStatus.className = "small muted";
      uploadStatus.textContent = "Otpremanje u toku...";

      const formData = new FormData(uploadForm);

      if (!formData.get("consent")) {
        uploadButton.disabled = false;
        uploadStatus.className = "err";
        uploadStatus.textContent = "Morate potvrditi dozvolu za objavljivanje.";
        return;
      }

      formData.set("consent", "true");

      try {
        await submitUpload(formData);
        uploadStatus.className = "toast";
        uploadStatus.textContent = "Fotografija je uspešno objavljena.";

        await loadGallery();

        setTimeout(function () {
          uploadForm.reset();
          resetUploadState();
          closeModal();
        }, 900);
      } catch (error) {
        uploadButton.disabled = false;
        uploadStatus.className = "err";
        uploadStatus.textContent = error.message || "Otpremanje nije uspelo.";
      }
    });
  }

  function bindModalActions() {
    if (openUploadBtn) {
      openUploadBtn.addEventListener("click", function () {
        resetUploadState();
        openModal();
      });
    }

    if (closeUploadBtn) {
      closeUploadBtn.addEventListener("click", closeModal);
    }

    if (uploadCancelBtn) {
      uploadCancelBtn.addEventListener("click", function () {
        closeModal();
      });
    }

    if (uploadModal) {
      uploadModal.addEventListener("click", function (event) {
        if (event.target === uploadModal) {
          closeModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && uploadModal && uploadModal.classList.contains("is-open")) {
        closeModal();
      }
    });
  }

  function initPhotoGallery() {
    bindModalActions();
    bindUploadForm();
    loadGallery();
  }

  window.loadGallery = loadGallery;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPhotoGallery);
  } else {
    initPhotoGallery();
  }
})();
