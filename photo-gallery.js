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
  const adminBanner = document.getElementById("adminBanner");
  const body = document.body;

  const adminToken = new URLSearchParams(window.location.search).get("admin") || "";
  const isAdminMode = Boolean(adminToken);

  let activeGalleryRequestId = 0;
  let galleryPhotos = [];
  let activePhotoIndex = -1;

  const lightbox = {
    element: null,
    panel: null,
    counter: null,
    image: null,
    author: null,
    comment: null,
    date: null,
    prevButton: null,
    nextButton: null,
    closeButton: null,
    isOpen: false
  };

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

  function getPhotoImageSrc(photo) {
    return photo?.imageUrl || (photo?.file ? `/photos/${encodeURIComponent(photo.file)}` : "");
  }

  function getPhotoAlt(photo) {
    return photo?.comment
      ? `Fotografija: ${photo.comment}`
      : `Fotografija autora ${photo?.author || "Nepoznato"}`;
  }

  function getPhotoCounterText(index) {
    return `Photo ${index + 1} / ${galleryPhotos.length}`;
  }

  function isUploadModalOpen() {
    return Boolean(uploadModal && !uploadModal.hidden && uploadModal.classList.contains("is-open"));
  }

  function syncBodyScrollLock() {
    body.classList.toggle("modal-open", isUploadModalOpen() || lightbox.isOpen);
  }

  function ensureLightbox() {
    if (lightbox.element) {
      return lightbox;
    }

    const overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Pregled fotografije");

    const panel = document.createElement("div");
    panel.className = "lightbox-panel";

    const header = document.createElement("div");
    header.className = "lightbox-header";

    const counter = document.createElement("div");
    counter.className = "lightbox-counter";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "lightbox-close";
    closeButton.setAttribute("aria-label", "Zatvori pregled fotografije");
    closeButton.textContent = "×";

    header.appendChild(counter);
    header.appendChild(closeButton);

    const stage = document.createElement("div");
    stage.className = "lightbox-stage";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "lightbox-nav lightbox-nav-prev";
    prevButton.setAttribute("aria-label", "Prethodna fotografija");
    prevButton.textContent = "‹";

    const imageWrap = document.createElement("div");
    imageWrap.className = "lightbox-image-wrap";

    const image = document.createElement("img");
    image.className = "lightbox-image";
    image.alt = "";
    imageWrap.appendChild(image);

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "lightbox-nav lightbox-nav-next";
    nextButton.setAttribute("aria-label", "Sledeća fotografija");
    nextButton.textContent = "›";

    stage.appendChild(prevButton);
    stage.appendChild(imageWrap);
    stage.appendChild(nextButton);

    const meta = document.createElement("div");
    meta.className = "lightbox-meta";

    const author = document.createElement("p");
    author.className = "lightbox-author";

    const comment = document.createElement("p");
    comment.className = "lightbox-comment";

    const date = document.createElement("p");
    date.className = "lightbox-date";

    meta.appendChild(author);
    meta.appendChild(comment);
    meta.appendChild(date);

    panel.appendChild(header);
    panel.appendChild(stage);
    panel.appendChild(meta);
    overlay.appendChild(panel);
    body.appendChild(overlay);

    lightbox.element = overlay;
    lightbox.panel = panel;
    lightbox.counter = counter;
    lightbox.image = image;
    lightbox.author = author;
    lightbox.comment = comment;
    lightbox.date = date;
    lightbox.prevButton = prevButton;
    lightbox.nextButton = nextButton;
    lightbox.closeButton = closeButton;

    closeButton.addEventListener("click", closeLightbox);
    prevButton.addEventListener("click", function (event) {
      event.stopPropagation();
      showPreviousPhoto();
    });
    nextButton.addEventListener("click", function (event) {
      event.stopPropagation();
      showNextPhoto();
    });
    stage.addEventListener("click", function (event) {
      if (event.target === prevButton || event.target === nextButton) {
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      const clickX = event.clientX - stageRect.left;

      if (clickX < stageRect.width / 2) {
        showPreviousPhoto();
      } else {
        showNextPhoto();
      }
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeLightbox();
      }
    });

    return lightbox;
  }

  function updateLightboxContent(photo, index) {
    if (!photo || !lightbox.element) {
      return;
    }

    lightbox.counter.textContent = getPhotoCounterText(index);
    lightbox.image.src = getPhotoImageSrc(photo);
    lightbox.image.alt = getPhotoAlt(photo);
    lightbox.author.textContent = `Autor: ${photo.author || "Nepoznat autor"}`;

    if (photo.comment) {
      lightbox.comment.textContent = `Komentar: ${photo.comment}`;
      lightbox.comment.hidden = false;
    } else {
      lightbox.comment.textContent = "";
      lightbox.comment.hidden = true;
    }

    lightbox.date.textContent = `Datum objave: ${formatDate(photo.uploaded) || "Nepoznat datum"}`;
  }

  function openLightbox(index) {
    if (!galleryPhotos.length || index < 0 || index >= galleryPhotos.length) {
      return;
    }

    ensureLightbox();
    activePhotoIndex = index;
    updateLightboxContent(galleryPhotos[index], index);

    lightbox.element.hidden = false;
    lightbox.element.classList.add("is-open");
    lightbox.isOpen = true;
    syncBodyScrollLock();
  }

  function closeLightbox() {
    if (!lightbox.element) {
      return;
    }

    lightbox.element.classList.remove("is-open");
    lightbox.element.hidden = true;
    lightbox.isOpen = false;
    syncBodyScrollLock();
  }

  function showPhotoAt(index) {
    if (!galleryPhotos.length) {
      return;
    }

    const nextIndex = (index + galleryPhotos.length) % galleryPhotos.length;
    activePhotoIndex = nextIndex;
    updateLightboxContent(galleryPhotos[nextIndex], nextIndex);
  }

  function showPreviousPhoto() {
    if (!lightbox.isOpen) {
      return;
    }

    showPhotoAt(activePhotoIndex - 1);
  }

  function showNextPhoto() {
    if (!lightbox.isOpen) {
      return;
    }

    showPhotoAt(activePhotoIndex + 1);
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

  async function deletePhoto(fileName) {
    const response = await fetch("/api/photo", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: fileName,
        admin: adminToken
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || "Brisanje nije uspelo.");
    }
  }

  function createPhotoCard(photo, photoIndex) {
    const card = document.createElement("article");
    card.className = "photo-card";
    card.dataset.photoIndex = String(photoIndex);

    const image = document.createElement("img");
    image.className = "photo-img";
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = getPhotoAlt(photo);
    image.src = getPhotoImageSrc(photo);
    image.classList.add("photo-img-clickable");
    image.addEventListener("click", function () {
      openLightbox(photoIndex);
    });

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

    if (isAdminMode) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn photo-delete-btn";
      deleteButton.textContent = "DELETE";

      deleteButton.addEventListener("click", async function () {
        if (!photo?.file) {
          window.alert("Nedostaje naziv fajla za brisanje.");
          return;
        }

        const isConfirmed = window.confirm("Da li ste sigurni?");
        if (!isConfirmed) {
          return;
        }

        deleteButton.disabled = true;
        deleteButton.textContent = "Brišem...";

        try {
          await deletePhoto(photo.file);
          await loadGallery();
        } catch (error) {
          window.alert(error.message || "Brisanje nije uspelo.");
          deleteButton.disabled = false;
          deleteButton.textContent = "DELETE";
        }
      });

      meta.appendChild(deleteButton);
    }

    card.appendChild(image);
    card.appendChild(meta);

    return card;
  }

  async function loadGallery() {
    if (!galleryGrid) {
      return;
    }

    const requestId = ++activeGalleryRequestId;

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

      if (requestId !== activeGalleryRequestId) {
        return;
      }

      galleryPhotos = Array.isArray(photos) ? photos : [];

      if (galleryPhotos.length === 0) {
        showGalleryState("empty");
        if (lightbox.isOpen) {
          closeLightbox();
        }
        return;
      }

      const fragment = document.createDocumentFragment();
      galleryPhotos.forEach(function (photo, index) {
        fragment.appendChild(createPhotoCard(photo, index));
      });

      galleryGrid.appendChild(fragment);
      showGalleryState("ready");
    } catch (_error) {
      if (requestId !== activeGalleryRequestId) {
        return;
      }

      showGalleryState("error");
    }
  }

  function openModal() {
    if (!uploadModal) return;

    uploadModal.hidden = false;
    uploadModal.classList.add("is-open");
    syncBodyScrollLock();
  }

  function closeModal() {
    if (!uploadModal) return;

    uploadModal.classList.remove("is-open");
    uploadModal.hidden = true;
    syncBodyScrollLock();
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
      if (lightbox.isOpen) {
        if (event.key === "Escape") {
          closeLightbox();
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          showPreviousPhoto();
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          showNextPhoto();
          return;
        }
      }

      if (event.key === "Escape" && uploadModal && uploadModal.classList.contains("is-open")) {
        closeModal();
      }
    });
  }

  function initPhotoGallery() {
    if (adminBanner) {
      adminBanner.hidden = !isAdminMode;
    }

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
