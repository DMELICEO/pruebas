// Configuración global de PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfList = [];
let currentPDF = null;
let pageNum = 1;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    await loadSavedPDFs();
    renderCalendar(currentMonth, currentYear);
});

// --- SISTEMA DE ALMACENAMIENTO DE PDFs ---
document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async function(event) {
            const arrayBuffer = event.target.result;
            const id = Date.now().toString();
            
            // Guardar en la caché interna
            await localforage.setItem(id, arrayBuffer);
            
            // Guardar metadatos
            const meta = { id, name: file.name, date: new Date().toISOString() };
            pdfList.push(meta);
            localStorage.setItem('pdfMetadata', JSON.stringify(pdfList));
            
            renderPDFCard(meta, arrayBuffer);
        };
        reader.readAsArrayBuffer(file);
    }
});

async function loadSavedPDFs() {
    const saved = localStorage.getItem('pdfMetadata');
    if (saved) {
        pdfList = JSON.parse(saved);
        document.getElementById('pdf-container').innerHTML = '';
        for (let meta of pdfList) {
            const arrayBuffer = await localforage.getItem(meta.id);
            if (arrayBuffer) renderPDFCard(meta, arrayBuffer);
        }
    }
}

// --- VISUALIZACIÓN DE PORTADAS ---
async function renderPDFCard(meta, arrayBuffer) {
    const container = document.getElementById('pdf-container');
    const card = document.createElement('div');
    card.className = 'pdf-card';
    
    const canvas = document.createElement('canvas');
    card.appendChild(canvas);
    
    const title = document.createElement('h3');
    title.innerText = meta.name;
    card.appendChild(title);
    
    card.onclick = () => openPDFViewer(meta.name, arrayBuffer);
    container.insertBefore(card, container.firstChild);

    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 0.6 }); 
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
    } catch (error) {
        console.error("Error renderizando portada:", error);
    }
}

// --- LECTOR DE PDF Y CAPA DE TEXTO (SUBRAYADO) ---
const modal = document.getElementById('pdf-viewer-modal');
const renderCanvas = document.getElementById('pdf-render');
const textLayerDiv = document.getElementById('text-layer');
const pageWrapper = document.getElementById('page-wrapper');

async function openPDFViewer(name, arrayBuffer) {
    document.getElementById('pdf-title').innerText = name;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
    
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    currentPDF = await loadingTask.promise;
    pageNum = 1;
    document.getElementById('page-count').innerText = currentPDF.numPages;
    
    renderPage(pageNum);
}

async function renderPage(num) {
    const page = await currentPDF.getPage(num);
    
    // Ajustar escala para la pantalla del móvil
    const containerWidth = document.getElementById('viewer-container').clientWidth - 40;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: scale > 1 ? scale : 1.2 });
    
    // Configurar Canvas
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;
    
    // Renderizar gráfico
    await page.render({ canvasContext: renderCanvas.getContext('2d'), viewport: viewport }).promise;
    document.getElementById('page-num').innerText = num;

    // Renderizar Capa de Texto (Permite seleccionar y subrayar)
    textLayerDiv.innerHTML = ''; 
    const textContent = await page.getTextContent();
    
    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    });
}

// Herramienta de Subrayado visual
document.getElementById('highlight-tool').onclick = () => {
    const selection = window.getSelection();
    if (!selection.isCollapsed) {
        // En navegadores modernos esto aplica un fondo al texto seleccionado
        document.execCommand("hiliteColor", false, "rgba(255, 234, 112, 0.8)");
        alert("Texto subrayado. (Nota: el subrayado visual dura mientras mantengas abierto el PDF).");
    } else {
        alert("Primero selecciona el texto que deseas subrayar manteniendo el dedo pulsado sobre la pantalla.");
    }
};

document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};
document.getElementById('prev-page').onclick = () => { if (pageNum <= 1) return; pageNum--; renderPage(pageNum); };
document.getElementById('next-page').onclick = () => { if (pageNum >= currentPDF.numPages) return; pageNum++; renderPage(pageNum); };

// --- NAVEGACIÓN DE VISTAS (Grid / Lista) ---
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

// --- NAVEGACIÓN INFERIOR ---
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

// --- CALENDARIO ORGANIZADOR ---
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
        
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }
        
        const num = document.createElement('span');
        num.innerText = i;
        cell.appendChild(num);
        
        // Cargar nota guardada del Storage
        const savedNote = localStorage.getItem(`note-${year}-${month}-${i}`);
        if (savedNote) {
            const note = document.createElement('div');
            note.className = 'day-note';
            note.innerText = savedNote;
            cell.appendChild(note);
        }
        
        // Agregar o editar nota al hacer clic
        cell.onclick = () => {
            const newNote = prompt(`¿Qué archivo PDF estudiarás el ${i} de ${monthNames[month]}?`, savedNote || "");
            if (newNote !== null) {
                if (newNote.trim() === "") {
                    localStorage.removeItem(`note-${year}-${month}-${i}`);
                } else {
                    localStorage.setItem(`note-${year}-${month}-${i}`, newNote);
                }
                renderCalendar(month, year); // Recargar calendario para mostrar cambios
            }
        };
        calendar.appendChild(cell);
    }
}

// Controles del mes
document.getElementById('prev-month').onclick = () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar(currentMonth, currentYear);
};

document.getElementById('next-month').onclick = () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar(currentMonth, currentYear);
};