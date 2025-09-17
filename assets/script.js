// Basic client-side OCR using Tesseract.js
(function(){
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const placeholder = document.getElementById('placeholder');
  const preview = document.getElementById('preview');
  const extractBtn = document.getElementById('extractBtn');
  const clearBtn = document.getElementById('clearBtn');
  const output = document.getElementById('output');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const langSelect = document.getElementById('langSelect');

  let currentFile = null;

  function resetUI(full=false){
    if(full){ currentFile = null; fileInput.value = ''; preview.src = ''; }
    output.value = '';
    progress(0);
    toggle(progressWrap, false);
    toggle(preview, !currentFile);
    toggle(placeholder, !!currentFile);
    extractBtn.disabled = !currentFile;
    copyBtn.disabled = output.value.length === 0;
    downloadBtn.disabled = output.value.length === 0;
  }

  function toggle(el, hide){ el.classList.toggle('hidden', hide); }

  function progress(pct){
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    progressBar.style.width = clamped + '%';
    progressText.textContent = clamped + '%';
  }

  function loadImage(file){
    if(!file) return;
    if(!file.type.startsWith('image/')){
      alert('Please choose an image file.');
      return;
    }
    currentFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      toggle(preview, false);
      toggle(placeholder, true);
      extractBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  // Drag & drop handlers
  dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e)=>{
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    loadImage(file);
    resetUI();
  });

  browseBtn.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', ()=>{
    const file = fileInput.files && fileInput.files[0];
    loadImage(file);
    resetUI();
  });

  clearBtn.addEventListener('click', ()=>{
    resetUI(true);
    toggle(placeholder, false);
    toggle(preview, true);
  });

  copyBtn.addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(output.value);
      copyBtn.textContent = 'Copied';
      setTimeout(()=> copyBtn.textContent = 'Copy', 1200);
    }catch(err){ alert('Copy failed. You can select the text and press Ctrl+C.'); }
  });

  downloadBtn.addEventListener('click', ()=>{
    const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ocr.txt';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  });

  extractBtn.addEventListener('click', async ()=>{
    if(!currentFile) return;
    toggle(progressWrap, false);
    progress(0);

    const lang = langSelect.value || 'eng';

    try{
      const imageDataUrl = preview.src;
      if(typeof Tesseract === 'undefined' || !Tesseract.recognize){
        alert('Tesseract.js failed to load. Check your internet connection and reload the page.');
        return;
      }

      const result = await Tesseract.recognize(imageDataUrl, lang, {
        logger: (m)=>{
          if(m && typeof m.progress === 'number'){
            progress(m.progress * 100);
          }
        }
      });

      output.value = (result && result.data && result.data.text) ? result.data.text : '';
      copyBtn.disabled = output.value.length === 0;
      downloadBtn.disabled = output.value.length === 0;

      if(!output.value){
        alert('No text detected. Try a clearer image, higher contrast, or different language.');
      }
    }catch(err){
      console.error(err);
      const offline = !navigator.onLine;
      const msg = offline
        ? 'OCR failed because you appear to be offline and the language data could not be fetched. Please reconnect and try again.'
        : 'OCR failed. Check the console for details. If this is the first run for a language, allow time to download trained data.';
      alert(msg);
    }finally{
      progress(100);
      setTimeout(()=> toggle(progressWrap, true), 600);
    }
  });

  // Initial
  resetUI();

  // Paste from clipboard (Ctrl+V)
  window.addEventListener('paste', (e)=>{
    const items = e.clipboardData && e.clipboardData.items;
    if(!items || !items.length) return;
    for(const it of items){
      if(it.type && it.type.startsWith('image/')){
        const file = it.getAsFile();
        if(file){
          loadImage(file);
          resetUI();
          e.preventDefault();
          break;
        }
      }
    }
  });
})();

// Batch OCR to PDF
(function(){
  const batchInput = document.getElementById('batchInput');
  const batchBrowseBtn = document.getElementById('batchBrowseBtn');
  const batchClearBtn = document.getElementById('batchClearBtn');
  const batchStartBtn = document.getElementById('batchStartBtn');
  const batchCancelBtn = document.getElementById('batchCancelBtn');
  const batchDownloadPdfBtn = document.getElementById('batchDownloadPdfBtn');
  const batchList = document.getElementById('batchList');
  const batchLangSelect = document.getElementById('batchLangSelect');
  const batchProgressWrap = document.getElementById('batchProgressWrap');
  const batchProgressBar = document.getElementById('batchProgressBar');
  const batchProgressText = document.getElementById('batchProgressText');

  let files = [];
  let cancelFlag = false;
  let aggregatedText = [];

  function setOverallProgress(pct){
    const c = Math.max(0, Math.min(100, Math.round(pct)));
    batchProgressBar.style.width = c + '%';
    batchProgressText.textContent = c + '%';
  }

  function toggle(el, hide){ el && el.classList.toggle('hidden', hide); }

  function refreshControls(){
    const hasFiles = files.length > 0;
    batchStartBtn.disabled = !hasFiles;
    batchClearBtn.disabled = !hasFiles;
    batchCancelBtn.disabled = true;
    batchDownloadPdfBtn.disabled = aggregatedText.length === 0;
  }

  function renderList(){
    batchList.innerHTML = '';
    for(const f of files){
      const url = URL.createObjectURL(f);
      const item = document.createElement('div');
      item.className = 'batch-item';
      item.innerHTML = `
        <img class="batch-thumb" src="${url}" alt="thumb">
        <div class="batch-name" title="${f.name}">${f.name}</div>
        <div class="batch-status" id="status-${f._id}">Queued</div>
      `;
      batchList.appendChild(item);
    }
  }

  function addFiles(newFiles){
    const arr = Array.from(newFiles || []);
    // tag with id
    arr.forEach((f,i)=> f._id = `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    files = files.concat(arr);
    renderList();
    refreshControls();
  }

  batchBrowseBtn.addEventListener('click', ()=> batchInput.click());
  batchInput.addEventListener('change', ()=> addFiles(batchInput.files));

  // Support drag & drop onto the list area
  batchList.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  batchList.addEventListener('drop', (e)=>{
    e.preventDefault();
    if(e.dataTransfer && e.dataTransfer.files){
      addFiles(e.dataTransfer.files);
    }
  });

  batchClearBtn.addEventListener('click', ()=>{
    files = [];
    aggregatedText = [];
    batchList.innerHTML = '';
    setOverallProgress(0);
    toggle(batchProgressWrap, true);
    refreshControls();
  });

  batchStartBtn.addEventListener('click', async ()=>{
    if(files.length === 0) return;
    if(typeof Tesseract === 'undefined' || !Tesseract.recognize){
      alert('Tesseract.js failed to load. Check your internet connection and reload the page.');
      return;
    }
    cancelFlag = false;
    aggregatedText = [];
    batchDownloadPdfBtn.disabled = true;
    batchStartBtn.disabled = true;
    batchCancelBtn.disabled = false;
    toggle(batchProgressWrap, false);
    setOverallProgress(0);

    const lang = batchLangSelect.value || 'eng';

    for(let i=0;i<files.length;i++){
      if(cancelFlag) break;
      const f = files[i];
      const statusEl = document.getElementById(`status-${f._id}`);
      if(statusEl) statusEl.textContent = 'Recognizing...';
      try{
        const url = URL.createObjectURL(f);
        const result = await Tesseract.recognize(url, lang, {
          logger: (m)=>{
            if(m && typeof m.progress === 'number'){
              const perItem = Math.floor(m.progress * 100);
              if(statusEl) statusEl.textContent = `Recognizing ${perItem}%`;
            }
          }
        });
        const text = (result && result.data && result.data.text) ? result.data.text.trim() : '';
        aggregatedText.push({ name: f.name, text });
        if(statusEl) statusEl.textContent = text ? 'Done' : 'No text';
      }catch(err){
        console.error('Batch OCR error', err);
        if(statusEl) statusEl.textContent = 'Error';
        aggregatedText.push({ name: f.name, text: '' });
      }
      const pct = ((i+1)/files.length)*100;
      setOverallProgress(pct);
    }

    batchCancelBtn.disabled = true;
    batchStartBtn.disabled = false;
    batchDownloadPdfBtn.disabled = aggregatedText.length === 0;
  });

  batchCancelBtn.addEventListener('click', ()=>{
    cancelFlag = true;
    batchCancelBtn.disabled = true;
  });

  batchDownloadPdfBtn.addEventListener('click', ()=>{
    if(!aggregatedText.length){ return; }
    // Using jsPDF to build a simple multi-page document
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){
      alert('PDF library failed to load. Please check your internet connection.');
      return;
    }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36; // 0.5in
    const maxWidth = pageWidth - margin*2;
    const lineHeight = 14;

    function addHeaderFooter(pageNum){
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated by Image→Text OCR`, margin, pageHeight - 18);
      doc.text(String(pageNum), pageWidth - margin, pageHeight - 18, { align: 'right' });
      doc.setTextColor(20);
    }

    let pageNum = 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    aggregatedText.forEach((entry, idx)=>{
      const title = `File: ${entry.name}`;
      const body = entry.text || '(No text recognized)';
      const wrappedTitle = doc.splitTextToSize(title, maxWidth);
      const wrappedBody = doc.splitTextToSize(body, maxWidth);

      let y = margin;
      if(idx > 0){ doc.addPage(); pageNum++; }
      doc.text(wrappedTitle, margin, y); y += lineHeight * (wrappedTitle.length + 1);
      doc.setFontSize(10);
      doc.text(wrappedBody, margin, y);
      doc.setFontSize(11);
      addHeaderFooter(pageNum);
    });

    doc.save('ocr_batch.pdf');
  });

  // initialize
  refreshControls();
  toggle(batchProgressWrap, true);
})();
