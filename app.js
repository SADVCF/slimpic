/* =============================================
   SlimPic — app.js
   All compression runs in the browser via
   browser-image-compression (no server needed)
   ============================================= */

const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const controls     = document.getElementById('controls');
const compressBtn  = document.getElementById('compressBtn');
const resetBtn     = document.getElementById('resetBtn');
const qualitySlider= document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const resultsSection = document.getElementById('resultsSection');
const summaryBar   = document.getElementById('summaryBar');
const cardsGrid    = document.getElementById('cardsGrid');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const totalOriginal  = document.getElementById('totalOriginal');
const totalCompressed= document.getElementById('totalCompressed');
const totalSaved     = document.getElementById('totalSaved');

// State
let pendingFiles = [];     // File[] waiting to compress
let results = [];          // { file, originalBlob, compressedBlob, name }

// ── Quality slider ──────────────────────────────
qualitySlider.addEventListener('input', () => {
  qualityValue.textContent = qualitySlider.value;
});

// ── Drop zone interactions ──────────────────────
dropZone.addEventListener('click', e => {
  if (e.target.closest('label')) return;
  fileInput.click();
});
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles(Array.from(e.dataTransfer.files));
});

fileInput.addEventListener('change', () => {
  handleFiles(Array.from(fileInput.files));
  fileInput.value = ''; // allow re-selecting same files
});

// ── File intake ─────────────────────────────────
function handleFiles(files) {
  const valid = files.filter(f =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
  );

  if (valid.length === 0) {
    alert('Please upload JPEG, PNG, or WebP images.');
    return;
  }

  pendingFiles = valid.slice(0, 50); // cap at 50
  showPendingPreviews();
  controls.hidden = false;
  resultsSection.hidden = false;
  summaryBar.hidden = true;
  downloadAllBtn.hidden = true;
}

// ── Show pending (not yet compressed) previews ──
function showPendingPreviews() {
  cardsGrid.innerHTML = '';
  results = [];

  pendingFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const card = buildCard({
      id: idx,
      name: file.name,
      imgSrc: url,
      labelText: 'Original',
      originalSize: formatBytes(file.size),
      compressedSize: null,
      savingPct: null,
      compressedBlob: null,
    });
    cardsGrid.appendChild(card);
  });
}

// ── Compress all ────────────────────────────────
compressBtn.addEventListener('click', async () => {
  if (pendingFiles.length === 0) return;

  const quality = parseInt(qualitySlider.value) / 100;

  compressBtn.disabled = true;
  compressBtn.textContent = '⏳ Compressing…';
  results = [];

  let totalOrigBytes = 0;
  let totalCompBytes = 0;

  for (let idx = 0; idx < pendingFiles.length; idx++) {
    const file = pendingFiles[idx];
    const card = cardsGrid.children[idx];

    // Show spinner on card
    setCardLoading(card, true);

    try {
      const compressed = await imageCompression(file, {
        initialQuality: quality,
        useWebWorker: true,
        preserveExif: false,
      });

      const origURL = URL.createObjectURL(file);
      const compURL = URL.createObjectURL(compressed);

      totalOrigBytes += file.size;
      totalCompBytes += compressed.size;

      results.push({
        file,
        originalBlob: file,
        compressedBlob: compressed,
        name: file.name,
      });

      // Replace card with full result card
      const saving = Math.round((1 - compressed.size / file.size) * 100);
      const newCard = buildCard({
        id: idx,
        name: file.name,
        imgSrc: origURL,
        compImgSrc: compURL,
        labelText: 'Before',
        originalSize: formatBytes(file.size),
        compressedSize: formatBytes(compressed.size),
        savingPct: saving,
        compressedBlob: compressed,
      });

      setCardLoading(card, false);
      cardsGrid.replaceChild(newCard, card);

    } catch (err) {
      console.error('Compression failed for', file.name, err);
      setCardLoading(card, false);
    }
  }

  // Update summary
  const saved = totalOrigBytes - totalCompBytes;
  const savedPct = Math.round((saved / totalOrigBytes) * 100);

  totalOriginal.textContent = formatBytes(totalOrigBytes);
  totalCompressed.textContent = formatBytes(totalCompBytes);
  totalSaved.textContent = `${formatBytes(saved)} (${savedPct}%)`;

  summaryBar.hidden = false;
  if (results.length > 1) downloadAllBtn.hidden = false;

  compressBtn.disabled = false;
  compressBtn.textContent = '⚡ Compress All';
});

// ── Reset ───────────────────────────────────────
resetBtn.addEventListener('click', () => {
  pendingFiles = [];
  results = [];
  cardsGrid.innerHTML = '';
  controls.hidden = true;
  resultsSection.hidden = true;
  summaryBar.hidden = true;
  downloadAllBtn.hidden = true;
});

// ── Download all as ZIP ─────────────────────────
downloadAllBtn.addEventListener('click', async () => {
  if (results.length === 0) return;

  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = '⏳ Zipping…';

  const zip = new JSZip();

  results.forEach(r => {
    const baseName = r.name.replace(/\.[^.]+$/, '');
    const ext = getExt(r.compressedBlob.type);
    zip.file(`${baseName}_compressed.${ext}`, r.compressedBlob);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, 'slimpic_compressed.zip');

  downloadAllBtn.disabled = false;
  downloadAllBtn.textContent = '⬇ Download All (.zip)';
});

// ── Build card DOM ──────────────────────────────
function buildCard({ id, name, imgSrc, compImgSrc, labelText, originalSize, compressedSize, savingPct, compressedBlob }) {
  const card = document.createElement('article');
  card.className = 'img-card';
  card.dataset.id = id;

  const hasComp = !!compressedBlob;

  card.innerHTML = `
    ${hasComp ? `
    <div class="preview-tabs">
      <button class="preview-tab active" data-view="before">Before</button>
      <button class="preview-tab" data-view="after">After</button>
    </div>
    ` : ''}
    <div class="img-card__preview">
      <img src="${imgSrc}" alt="Preview of ${escapeHtml(name)}" loading="lazy">
      ${!hasComp ? `<span class="preview-label">${escapeHtml(labelText)}</span>` : ''}
    </div>
    <div class="img-card__body">
      <p class="img-card__name" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
      ${hasComp ? `
      <div class="img-card__sizes">
        <span class="size-original">${originalSize}</span>
        <span class="size-arrow">→</span>
        <span class="size-compressed">${compressedSize}</span>
        <span class="size-badge">-${savingPct}%</span>
      </div>
      <div class="img-card__actions">
        <button class="btn btn-primary download-btn">⬇ Download</button>
      </div>
      ` : `
      <div class="img-card__sizes">
        <span class="size-original">${originalSize}</span>
      </div>
      `}
    </div>
  `;

  // Before/After tab toggle
  if (hasComp) {
    const tabs = card.querySelectorAll('.preview-tab');
    const previewImg = card.querySelector('.img-card__preview img');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        previewImg.src = tab.dataset.view === 'before' ? imgSrc : compImgSrc;
      });
    });

    // Download button
    const dlBtn = card.querySelector('.download-btn');
    dlBtn.addEventListener('click', () => {
      const baseName = name.replace(/\.[^.]+$/, '');
      const ext = getExt(compressedBlob.type);
      triggerDownload(compressedBlob, `${baseName}_compressed.${ext}`);
    });
  }

  return card;
}

// ── Loading state on card ───────────────────────
function setCardLoading(card, loading) {
  const preview = card.querySelector('.img-card__preview');
  if (loading) {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.id = 'spinner-' + card.dataset.id;
    preview.appendChild(spinner);
  } else {
    const spinner = preview.querySelector('.spinner');
    if (spinner) spinner.remove();
  }
}

// ── Helpers ──────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getExt(mimeType) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return map[mimeType] || 'jpg';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
