const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfList = JSON.parse(localStorage.getItem('pdfMetadata')) || [];
let savedHighlights = JSON.parse(localStorage.getItem('pdfHighlights')) || {};
let currentPDF = null, currentPDFId = null;
let pageNum = 1, currentScale = 1;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedPDFs();
    renderCalendar(currentMonth, currentYear);
});

// --- CARGA DE MÚLTIPLES ARCHIVOS ---
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer(); // Método moderno
            const id = Date.now().toString() + i; // ID único
            
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

// --- PORTADAS Y BOTÓN DE BORRAR ---
async function renderPDFCard(meta, arrayBuffer) {
    const container = document.getElementById('pdf-container');
    const card = document.createElement('div');
    card.className = 'pdf-card';
    card.onclick = () => openPDFViewer(meta.id, meta.name, arrayBuffer);
    
    const canvas = document.createElement('canvas');
    const title = document.createElement('h3');
    title.innerText = meta.name;
    
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerText = '×';
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
    } catch (e) { console.error("Error portada", e); }
}

async function deletePDF(id, event) {
    event.stopPropagation(); // Evita que se abra el lector al tocar borrar
    if (confirm("¿Estás seguro de eliminar este PDF de tu dispositivo?")) {
        await localforage.removeItem(id);
        pdfList = pdfList.filter(p => p.id !== id);
        localStorage.setItem('pdfMetadata', JSON.stringify(pdfList));
        
        delete savedHighlights[id];
        localStorage.setItem('pdfHighlights', JSON.stringify(savedHighlights));
        
        loadSavedPDFs(); // Recargar lista
    }
}

// --- LECTOR A PANTALLA COMPLETA ---
const mainApp = document.getElementById('main-app');
const readerScreen = document.getElementById('reader-screen');
const renderCanvas = document.getElementById('pdf-render');
const pageWrapper = document.getElementById('page-wrapper');
const textLayerDiv = document.getElementById('text-layer');

async function openPDFViewer(id, name, arrayBuffer) {
    currentPDFId = id;
    document.getElementById('pdf-title').innerText = name;
    
    // Cambiar de vista
    mainApp.classList.add('hidden-section');
    readerScreen.classList.remove('hidden-section');
    window.scrollTo(0, 0);
    
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    currentPDF = await loadingTask.promise;
    pageNum = 1;
    document.getElementById('page-count').innerText = currentPDF.numPages;
    renderPage(pageNum);
}

document.getElementById('close-reader').onclick = () => {
    readerScreen.classList.add('hidden-section');
    mainApp.classList.remove('hidden-section');
};

// --- RENDERIZADO Y ESCALADO PERFECTO ---
async function renderPage(num) {
    const page = await currentPDF.getPage(num);
    
    // Calcular escala exacta para el ancho del iPhone (restando 20px de márgenes)
    const containerWidth = document.getElementById('viewer-container').clientWidth - 20;
    const unscaledViewport = page.getViewport({ scale: 1 });
    currentScale = containerWidth / unscaledViewport.width;
    
    const viewport = page.getViewport({ scale: currentScale });
    
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;
    
    await page.render({ canvasContext: renderCanvas.getContext('2d'), viewport: viewport }).promise;
    document.getElementById('page-num').innerText = num;

    // Capa de texto para selección perfecta
    textLayerDiv.innerHTML = ''; 
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] }).promise;
    
    drawSavedHighlights();
}

// --- SISTEMA DE SUBRAYADO PERSISTENTE (SIN MODIFICAR EL PDF) ---
document.getElementById('highlight-tool').onclick = () => {
    const selection = window.getSelection();
    if (selection.isCollapsed) {
        alert("Selecciona texto en el documento primero."); return;
    }
    
    // Obtener las coordenadas exactas de lo seleccionado
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const wrapperRect = pageWrapper.getBoundingClientRect();
    const normalizedRects = [];
    
    for (let i = 0; i < rects.length; i++) {
        // Normalizamos los rectángulos para que funcionen si cambias de celular o pantalla
        normalizedRects.push({
            top: (rects[i].top - wrapperRect.top) / currentScale,
            left: (rects[i].left - wrapperRect.left) / currentScale,
            width: rects[i].width / currentScale,
            height: rects[i].height / currentScale
        });
    }
    
    // Guardar en la estructura de datos
    if (!savedHighlights[currentPDFId]) savedHighlights[currentPDFId] = {};
    if (!savedHighlights[currentPDFId][pageNum]) savedHighlights[currentPDFId][pageNum] = [];
    
    savedHighlights[currentPDFId][pageNum].push(normalizedRects);
    localStorage.setItem('pdfHighlights', JSON.stringify(savedHighlights));
    
    selection.removeAllRanges(); // Limpiar selección azul
    drawSavedHighlights(); // Dibujar el nuevo subrayado
};

// Botón Deshacer
document.getElementById('undo-highlight').onclick = () => {
    if (savedHighlights[currentPDFId] && savedHighlights[currentPDFId][pageNum]) {
        const arr = savedHighlights[currentPDFId][pageNum];
        if (arr.length > 0) {
            arr.pop(); // Eliminar el último subrayado
            localStorage.setItem('pdfHighlights', JSON.stringify(savedHighlights));
            drawSavedHighlights();
        }
    }
};

function drawSavedHighlights() {
    // Borrar subrayados visuales anteriores
    document.querySelectorAll('.saved-highlight').forEach(el => el.remove());
    
    if (!savedHighlights[currentPDFId] || !savedHighlights[currentPDFId][pageNum]) return;
    
    const pageHighlights = savedHighlights[currentPDFId][pageNum];
    pageHighlights.forEach(rectGroup => {
        rectGroup.forEach(rect => {
            const div = document.createElement('div');
            div.className = 'saved-highlight';
            div.style.top = `${rect.top * currentScale}px`;
            div.style.left = `${rect.left * currentScale}px`;
            div.style.width = `${rect.width * currentScale}px`;
            div.style.height = `${rect.height * currentScale}px`;
            pageWrapper.appendChild(div);
        });
    });
}

// Navegación de páginas
document.getElementById('prev-page').onclick = () => { if (pageNum > 1) { pageNum--; renderPage(pageNum); } };
document.getElementById('next-page').onclick = () => { if (pageNum < currentPDF.numPages) { pageNum++; renderPage(pageNum); } };

// --- NAVEGACIÓN Y CALENDARIO (Se mantiene igual que antes) ---
document.getElementById('btnList').onclick = (e) => {
    document.getElementById('pdf-container').className = 'pdf-list';
    document.getElementById('btnList').classList.add('active');
    document.getElementById('btnGrid').classList.remove('active');
};
document.getElementById('btnGrid').onclick = (e) => {
    document.getElementById('pdf-container').className = 'pdf-grid';
    document.getElementById('btnGrid').classList.add('active');
    document.getElementById('btnList').classList.remove('active');
};

document.getElementById('nav-calendar').onclick = () => switchSection('calendar-section', 'nav-calendar');
document.getElementById('nav-pdfs').onclick = () => switchSection('pdf-section', 'nav-pdfs');

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
        
        cell.onclick = () => {
            const newNote = prompt(`¿Qué archivo PDF estudiarás el ${i} de ${monthNames[month]}?`, savedNote || "");
            if (newNote !== null) {
                if (newNote.trim() === "") localStorage.removeItem(`note-${year}-${month}-${i}`);
                else localStorage.setItem(`note-${year}-${month}-${i}`, newNote);
                renderCalendar(month, year);
            }
        };
        calendar.appendChild(cell);
    }
}

document.getElementById('prev-month').onclick = () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar(currentMonth, currentYear);
};
document.getElementById('next-month').onclick = () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar(currentMonth, currentYear);
};