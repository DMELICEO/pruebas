const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfList = JSON.parse(localStorage.getItem('pdfMetadata')) || [];
let currentPDF = null;
let pageNum = 1;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

let touchStartX = 0, touchEndX = 0;
let lastTapTime = 0;
const viewportMeta = document.getElementById('viewport-meta');

document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedPDFs();
    renderCalendar(currentMonth, currentYear);
});

// --- CARGAR Y RENDERIZAR ARCHIVOS ---
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const id = Date.now().toString() + i;
            await localforage.setItem(id, arrayBuffer);
            const meta = { id, name: file.name, date: new Date().toISOString() };
            pdfList.push(meta);
            localStorage.setItem('pdfMetadata', JSON.stringify(pdfList));
            renderPDFCard(meta, arrayBuffer);
        }
    }
});

async function loadSavedPDFs() {
    document.getElementById('pdf-container').innerHTML = '';
    for (let meta of pdfList) {
        const arrayBuffer = await localforage.getItem(meta.id);
        if (arrayBuffer) renderPDFCard(meta, arrayBuffer);
    }
}

async function renderPDFCard(meta, arrayBuffer) {
    const container = document.getElementById('pdf-container');
    const card = document.createElement('div');
    card.className = 'pdf-card';
    card.onclick = () => openPDFViewer(meta.name, arrayBuffer);
    
    const canvas = document.createElement('canvas');
    const title = document.createElement('h3'); title.innerText = meta.name;
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn'; delBtn.innerText = '×';
    delBtn.onclick = (e) => deletePDF(meta.id, e);
    
    card.append(canvas, title, delBtn);
    container.insertBefore(card, container.firstChild);

    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 }); 
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
    } catch (e) {}
}

async function deletePDF(id, event) {
    event.stopPropagation();
    if (confirm("¿Eliminar este PDF?")) {
        await localforage.removeItem(id);
        pdfList = pdfList.filter(p => p.id !== id);
        localStorage.setItem('pdfMetadata', JSON.stringify(pdfList));
        loadSavedPDFs();
    }
}

// --- LECTOR DE PDF ---
const mainApp = document.getElementById('main-app');
const readerScreen = document.getElementById('reader-screen');
const renderCanvas = document.getElementById('pdf-render');
const pageWrapper = document.getElementById('page-wrapper');
const readerBody = document.getElementById('viewer-container');
const readerHeader = document.getElementById('reader-header');
const pageBadge = document.getElementById('page-badge');

// Esta función permite que el usuario haga zoom (pellizco) solo dentro del PDF
function toggleNativeZoom(enable) {
    if (enable) {
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
    } else {
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

async function openPDFViewer(name, arrayBuffer) {
    document.getElementById('pdf-title').innerText = name;
    mainApp.classList.add('hidden-section');
    readerScreen.classList.remove('hidden-section');
    
    toggleNativeZoom(true);
    
    readerHeader.classList.remove('hidden-ui');
    pageBadge.classList.remove('hidden-ui');

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    currentPDF = await loadingTask.promise;
    pageNum = 1;
    document.getElementById('page-count').innerText = currentPDF.numPages;
    
    readerBody.scrollTop = 0; 
    renderPage(pageNum);
}

document.getElementById('close-reader').onclick = () => {
    toggleNativeZoom(false);
    readerScreen.classList.add('hidden-section');
    mainApp.classList.remove('hidden-section');
};

async function renderPage(num) {
    const page = await currentPDF.getPage(num);
    
    // 1. Ajuste perfecto al 100% del ancho del celular (sin bordes)
    const containerWidth = window.innerWidth; 
    const unscaledViewport = page.getViewport({ scale: 1 });
    const currentScale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: currentScale });
    
    // 2. High-DPI Rendering para nitidez máxima
    const outputScale = window.devicePixelRatio || 1;
    
    renderCanvas.width = Math.floor(viewport.width * outputScale);
    renderCanvas.height = Math.floor(viewport.height * outputScale);
    
    // Se fuerza por CSS a ocupar todo el espacio disponible
    renderCanvas.style.width = "100%";
    renderCanvas.style.height = "auto";
    
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    const renderContext = {
        canvasContext: renderCanvas.getContext('2d'),
        transform: transform,
        viewport: viewport
    };
    
    await page.render(renderContext).promise;
    document.getElementById('page-num').innerText = num;
}

// --- MODO LECTURA INMERSIVA ---
readerBody.addEventListener('click', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;
    
    if (tapLength < 500 && tapLength > 0) return; // Evita conflictos con el doble toque
    
    lastTapTime = currentTime;
    
    readerHeader.classList.toggle('hidden-ui');
    pageBadge.classList.toggle('hidden-ui');
});

// --- SWIPE (DESLIZAR) PARA CAMBIAR PÁGINA ---
readerBody.addEventListener('touchstart', e => {
    if (e.touches.length === 1) touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

readerBody.addEventListener('touchend', e => {
    // IMPORTANTE: Si el usuario hizo zoom, NO cambiamos de página al deslizar
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    if (scale > 1.05) return; 

    if (e.changedTouches.length === 1) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }
});

function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    if (deltaX < -70) { 
        if (pageNum < currentPDF.numPages) { 
            pageNum++; renderPage(pageNum); readerBody.scrollTop = 0; 
        }
    } else if (deltaX > 70) { 
        if (pageNum > 1) { 
            pageNum--; renderPage(pageNum); readerBody.scrollTop = 0; 
        }
    }
}


// --- NAVEGACIÓN Y CALENDARIO ---
document.getElementById('btnList').onclick = (e) => { document.getElementById('pdf-container').className = 'pdf-list'; e.target.classList.add('active'); document.getElementById('btnGrid').classList.remove('active'); };
document.getElementById('btnGrid').onclick = (e) => { document.getElementById('pdf-container').className = 'pdf-grid'; e.target.classList.add('active'); document.getElementById('btnList').classList.remove('active'); };

document.getElementById('nav-calendar').onclick = () => { switchSection('calendar-section', 'nav-calendar'); };
document.getElementById('nav-pdfs').onclick = () => { switchSection('pdf-section', 'nav-pdfs'); };

function switchSection(sectionId, navId) {
    document.getElementById('pdf-section').classList.add('hidden-section');
    document.getElementById('calendar-section').classList.add('hidden-section');
    document.getElementById(sectionId).classList.remove('hidden-section');
    document.getElementById(sectionId).classList.add('active-section');
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(navId).classList.add('active');
}

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function renderCalendar(month, year) {
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    document.getElementById('month-year').innerText = `${monthNames[month]} ${year}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) cell.classList.add('today');
        
        const num = document.createElement('span'); num.innerText = i; cell.appendChild(num);
        const savedNote = localStorage.getItem(`note-${year}-${month}-${i}`);
        
        if (savedNote) {
            const note = document.createElement('div'); note.className = 'day-note'; note.innerText = savedNote; cell.appendChild(note);
        }
        
        cell.onclick = () => openNoteModal(year, month, i, savedNote);
        calendar.appendChild(cell);
    }
}

document.getElementById('prev-month').onclick = () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(currentMonth, currentYear); };
document.getElementById('next-month').onclick = () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(currentMonth, currentYear); };

const noteModal = document.getElementById('note-modal');
const noteDisplay = document.getElementById('note-display');
const noteInput = document.getElementById('note-input');
const btnEditNote = document.getElementById('btn-edit-note');
const btnSaveNote = document.getElementById('btn-save-note');
let selectedDate = { y: null, m: null, d: null };

function openNoteModal(year, month, day, text) {
    selectedDate = { y: year, m: month, d: day };
    document.getElementById('note-modal-title').innerText = `${day} de ${monthNames[month]}`;
    
    if (text) {
        noteDisplay.innerText = text; noteDisplay.style.display = 'block'; noteInput.style.display = 'none';
        btnEditNote.style.display = 'block'; btnSaveNote.style.display = 'none';
    } else {
        noteDisplay.style.display = 'none'; noteInput.style.display = 'block'; noteInput.value = '';
        btnEditNote.style.display = 'none'; btnSaveNote.style.display = 'block';
    }
    
    noteModal.classList.remove('hidden-section');
    noteModal.style.display = 'flex';
}

btnEditNote.onclick = () => {
    noteDisplay.style.display = 'none'; noteInput.style.display = 'block'; noteInput.value = noteDisplay.innerText;
    btnEditNote.style.display = 'none'; btnSaveNote.style.display = 'block'; noteInput.focus();
};

btnSaveNote.onclick = () => {
    const text = noteInput.value.trim();
    const key = `note-${selectedDate.y}-${selectedDate.m}-${selectedDate.d}`;
    if (text === "") localStorage.removeItem(key);
    else localStorage.setItem(key, text);
    
    noteModal.classList.add('hidden-section'); noteModal.style.display = 'none';
    renderCalendar(currentMonth, currentYear);
};

document.getElementById('btn-close-note').onclick = () => {
    noteModal.classList.add('hidden-section'); noteModal.style.display = 'none';
};