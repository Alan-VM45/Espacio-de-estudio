// API KEY & CONFIG (Loads from localStorage)
let apiKey = localStorage.getItem('gemini_api_key') || "";
let activeModel = localStorage.getItem('gemini_model') || "gemini-1.5-flash";

// ESTADO GLOBAL
let subjects = JSON.parse(localStorage.getItem('studyflow_v4_data')) || [
    { id: '1', title: 'Probabilidad y Estadística', type: 'math', topics: [{ name: 'Variables Aleatorias' }], files: [], repo: '' },
    { id: '2', title: 'Programación II', type: 'prog', topics: [{ name: 'Estructuras de Datos' }], files: [], repo: '' }
];
let activeId = null;
let activeTopicIndex = null;
let timerInterval;
let timeLeft = 1500;
let timerRunning = false;

const CONFIG = {
    math: {
        icon: 'fa-calculator',
        color: 'border-purple-500/30 text-purple-400',
        prompt: 'Explícame {topic} con rigor estadístico. Incluye axiomas, un problema resuelto paso a paso y su interpretación en ciencia de datos.',
        steps: ['Derivación de Fórmulas', 'Resolución de Problemas de Guía', 'Validación con Python (NumPy/SciPy)']
    },
    prog: {
        icon: 'fa-code',
        color: 'border-emerald-500/30 text-emerald-400',
        prompt: 'Implementación técnica de {topic}. Explica complejidad temporal, manejo de memoria y mejores prácticas de codificación.',
        steps: ['Pseudocódigo del Algoritmo', 'Codificación y Debugging', 'Análisis de Complejidad Big O']
    },
    db: {
        icon: 'fa-database',
        color: 'border-blue-500/30 text-blue-400',
        prompt: 'Analiza {topic} en el contexto de bases de datos relacionales. Incluye script SQL de ejemplo y plan de ejecución.',
        steps: ['Modelado Lógico (DER)', 'Optimización de Queries (Explain)', 'Implementación de Triggers/SP']
    },
    design: {
        icon: 'fa-project-diagram',
        color: 'border-amber-500/30 text-amber-400',
        prompt: 'Diseño de sistemas para {topic}. Muestra diagramas UML y explica cómo este patrón mejora la escalabilidad del sistema.',
        steps: ['Dibujo de Diagrama de Clases', 'Definición de Contratos/Interfaces', 'Validación de Atributos de Calidad']
    }
};

// PERSISTENCIA
function sync() { localStorage.setItem('studyflow_v4_data', JSON.stringify(subjects)); }

// NAVEGACIÓN
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white');
        b.classList.add('text-slate-400');
    });
    document.getElementById(`btn-${tab}`).classList.add('bg-indigo-600', 'text-white');
    if (tab === 'overview') renderOverview();
    if (tab === 'subjects') renderSidebar();
    if (tab === 'focus') renderTimerSelectors();
}

// GESTIÓN DE MATERIAS
function toggleModal(s) { document.getElementById('modal-subject').classList.toggle('hidden', !s); document.getElementById('modal-subject').classList.toggle('flex', s); }

// GESTIÓN DE CONFIGURACIÓN (API KEY)
function toggleSettings(s) {
    const modal = document.getElementById('modal-settings');
    modal.classList.toggle('hidden', !s);
    modal.classList.toggle('flex', s);
    if (s) {
        document.getElementById('api-key-input').value = apiKey;
        document.getElementById('model-select').value = activeModel;
    }
}

function saveApiKey() {
    const key = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-select').value;
    if (key) {
        apiKey = key;
        activeModel = model;
        localStorage.setItem('gemini_api_key', key);
        localStorage.setItem('gemini_model', model);
        alert("Configuración guardada.");
        toggleSettings(false);
    } else {
        alert("Introduce una API Key.");
    }
}

function saveSubject() {
    const name = document.getElementById('subject-name').value;
    const type = document.getElementById('subject-type').value;
    if (!name) return;
    subjects.push({ id: Date.now().toString(), title: name, type, topics: [], files: [], repo: '' });
    sync();
    toggleModal(false);
    renderOverview();
}

function renderOverview() {
    const grid = document.getElementById('subjects-grid');
    grid.innerHTML = subjects.map(s => `
        <div class="glass border-l-4 ${CONFIG[s.type].color.split(' ')[0]} p-6 rounded-3xl hover:bg-slate-900 transition cursor-pointer group relative" onclick="openSubject('${s.id}')">
            <button onclick="event.stopPropagation(); deleteSubject('${s.id}')" class="absolute top-4 right-4 text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-2">
                <i class="fas fa-trash-alt text-xs"></i>
            </button>
            <div class="flex justify-between items-center mb-4">
                <i class="fas ${CONFIG[s.type].icon} text-xl ${CONFIG[s.type].color.split(' ')[1]}"></i>
                <span class="text-[10px] font-bold uppercase tracking-widest text-slate-600">${s.type}</span>
            </div>
            <h3 class="font-bold text-slate-100 mb-1 group-hover:text-indigo-400 transition">${s.title}</h3>
            <div class="flex items-center justify-between mt-4">
                <span class="text-[10px] text-slate-500 uppercase tracking-tighter">${s.topics.length} Temas • ${s.files.length} Docs</span>
                <i class="fas fa-chevron-right text-[10px] text-slate-700"></i>
            </div>
        </div>
    `).join('');
    renderRecentDocs();
}

function deleteSubject(id) {
    if (confirm("¿Estás seguro de que quieres eliminar esta materia? Se perderán todos los temas y archivos asociados.")) {
        subjects = subjects.filter(s => s.id !== id);
        if (activeId === id) {
            activeId = null;
            activeTopicIndex = null;
            // Ocultar detalles si la materia activa fue eliminada
            document.getElementById('subject-files').classList.add('hidden');
            document.getElementById('ai-notes-lab').classList.add('hidden');
        }
        sync();
        renderOverview();
        renderSidebar();
    }
}

function openSubject(id) {
    activeId = id;
    switchTab('subjects');
    document.getElementById('subject-files').classList.remove('hidden');
    document.getElementById('ai-notes-lab').classList.remove('hidden');
    renderDetail();
    renderFiles();
    closeViewer();
}

function renderSidebar() {
    const sb = document.getElementById('subjects-sidebar');
    sb.innerHTML = subjects.map(s => `
        <button onclick="openSubject('${s.id}')" class="w-full text-left p-4 rounded-2xl transition flex items-center gap-3 ${activeId === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 text-slate-500 hover:bg-slate-800'}">
            <i class="fas ${CONFIG[s.type].icon} text-sm"></i>
            <span class="text-sm font-semibold truncate">${s.title}</span>
        </button>
    `).join('');
}

// CONTENIDO: PROMPTS Y ACTIVIDADES
function renderDetail() {
    const s = subjects.find(sub => sub.id === activeId);
    const detail = document.getElementById('subject-detail');
    if (!s) return;
    const conf = CONFIG[s.type];

    detail.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start mb-10 gap-4 animate-in">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded">${s.type}</span>
                </div>
                <h2 class="text-3xl font-bold text-white">${s.title}</h2>
            </div>
            <div class="flex flex-col gap-2 w-full md:w-auto">
                <div class="flex gap-2">
                    <input id="topic-input" type="text" placeholder="Agregar tema (ej: Recursividad)..." class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition">
                    <button onclick="addTopic()" class="bg-indigo-600 px-4 rounded-xl hover:bg-indigo-500 transition"><i class="fas fa-plus"></i></button>
                </div>
                <div class="flex gap-2 items-center">
                    <i class="fab fa-github text-slate-600 text-sm"></i>
                    <input id="repo-input" type="text" placeholder="URL Repo / Carpeta Local" class="bg-transparent border-b border-slate-800 text-[10px] outline-none text-slate-500 w-full focus:border-indigo-500 transition" value="${s.repo || ''}" onchange="updateRepo(this.value)">
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 gap-6">
            ${s.topics.map((t, idx) => `
                <div class="bg-slate-950/40 border ${activeTopicIndex === idx ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-slate-800/50'} p-6 rounded-3xl relative group animate-in">
                    <div class="flex justify-between items-start mb-4">
                        <h4 class="text-lg font-bold text-indigo-100 cursor-pointer" onclick="setActiveTopic(${idx})">${t.name}</h4>
                        <div class="flex gap-2">
                            <button onclick="setActiveTopic(${idx})" class="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white transition">Estudiar con IA</button>
                            <button onclick="deleteTopic(${idx})" class="text-slate-800 hover:text-red-500 transition"><i class="fas fa-trash-alt text-xs"></i></button>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div class="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                            <h5 class="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                <i class="fas fa-robot text-indigo-400"></i> Prompt para Estudiar
                            </h5>
                            <p class="text-xs font-mono text-indigo-300 leading-relaxed italic">
                                "${conf.prompt.replace('{topic}', t.name)}"
                            </p>
                            <button onclick="copyPrompt('${conf.prompt.replace('{topic}', t.name)}')" class="mt-3 text-[10px] bg-slate-800 px-3 py-1 rounded-lg hover:bg-slate-700 transition">Copiar Prompt</button>
                        </div>
                        <div class="space-y-2">
                            <h5 class="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                <i class="fas fa-tasks text-emerald-400"></i> Actividades Prácticas (${s.title})
                            </h5>
                            <div class="space-y-1">
                                ${conf.steps.map(step => `
                                    <div class="bg-slate-900/50 p-2.5 rounded-lg text-xs border border-slate-800 text-slate-400 flex items-center gap-3">
                                        <div class="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        ${step}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('') || '<div class="text-center py-10 text-slate-600 text-sm">No hay temas agregados.</div>'}
        </div>
    `;
}

function setActiveTopic(idx) {
    activeTopicIndex = idx;
    renderDetail();
    const topic = subjects.find(s => s.id === activeId).topics[idx].name;
    document.getElementById('notes-area').placeholder = `Escribe tus apuntes sobre "${topic}"...`;
    document.getElementById('ai-notes-lab').scrollIntoView({ behavior: 'smooth' });
}

// IA CORRECTION LOGIC
async function reviewNotes() {
    const notes = document.getElementById('notes-area').value;
    const resultArea = document.getElementById('ai-review-result');
    const s = subjects.find(sub => sub.id === activeId);
    const topic = activeTopicIndex !== null ? s.topics[activeTopicIndex].name : "General";

    if (!notes) return alert("Por favor escribe algo para corregir.");
    if (!apiKey) {
        alert("Configura tu Gemini API Key en los ajustes (icono de engranaje) para usar esta función.");
        toggleSettings(true);
        return;
    }

    resultArea.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-4 ai-loading">
            <i class="fas fa-brain text-emerald-500 text-4xl"></i>
            <p class="text-sm text-slate-500 font-mono">Analizando apuntes técnicos...</p>
        </div>
    `;

    const systemPrompt = `Eres un tutor experto en ${s.title}. Tu objetivo es corregir los apuntes del estudiante sobre "${topic}". 
    Analiza el contenido técnica y conceptualmente.
    Estructura tu respuesta en:
    1. Conceptos Correctos (✓)
    2. Errores o Imprecisiones (✗)
    3. Sugerencia de Mejora (lo que falta para un examen de 10)
    4. Un mini-desafío para validar el conocimiento.
    Usa un tono crítico pero constructivo, enfocado en el rigor académico.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: notes }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || `Error ${response.status}: ${response.statusText}`);
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo procesar la corrección.";

        // Formateo simple de Markdown a HTML (solo para visualización básica)
        const formattedText = text.replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<b class="text-emerald-400">$1</b>')
            .replace(/### (.*?)(<br>|$)/g, '<h4 class="text-lg font-bold text-white mt-4 mb-2">$1</h4>')
            .replace(/- (.*?)(<br>|$)/g, '<div class="flex gap-2 mb-1"><span class="text-indigo-500">•</span><span>$1</span></div>');

        resultArea.innerHTML = `
            <div class="animate-in">
                <div class="flex items-center justify-between mb-4">
                    <h4 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Resultado del Análisis</h4>
                    <span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">IA FEEDBACK</span>
                </div>
                <div class="text-sm text-slate-300 leading-relaxed">
                    ${formattedText}
                </div>
            </div>
        `;
    } catch (err) {
        let msg = err.message;
        if (msg.includes("quota") || msg.includes("429")) {
            msg = "Cuota excedida. Prueba cambiando el modelo en ajustes (ej: de Flash a Pro o viceversa) o espera un minuto.";
        }
        resultArea.innerHTML = `<p class="text-red-400 text-sm">Error: ${msg}</p>`;
    }
}

function addTopic() {
    const input = document.getElementById('topic-input');
    if (!input.value) return;
    subjects.find(s => s.id === activeId).topics.push({ name: input.value });
    sync();
    renderDetail();
}

function deleteTopic(idx) {
    subjects.find(s => s.id === activeId).topics.splice(idx, 1);
    if (activeTopicIndex === idx) activeTopicIndex = null;
    sync();
    renderDetail();
}

function updateRepo(val) {
    subjects.find(s => s.id === activeId).repo = val;
    sync();
}

function copyPrompt(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    alert("Prompt copiado");
}

// VAULT LOGIC
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !activeId) return;

    // Límite aproximado de 2MB para evitar saturar localStorage rápidamente
    if (file.size > 2 * 1024 * 1024) {
        return alert("El archivo es demasiado grande (máximo 2MB). Para archivos grandes, usa enlaces a Google Drive.");
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const sub = subjects.find(s => s.id === activeId);
            const fileData = { id: Date.now().toString(), name: file.name, type: file.type, data: e.target.result };
            sub.files.push(fileData);
            sync(); // Aquí es donde suele fallar por cuota
            renderFiles();
            renderRecentDocs();
        } catch (err) {
            console.error("Storage error:", err);
            alert("No se pudo guardar el archivo. El almacenamiento local está lleno. Elimina otros documentos para liberar espacio.");
            // Revertir el push si falló el sync
            const sub = subjects.find(s => s.id === activeId);
            sub.files.pop();
        }
    };
    reader.readAsDataURL(file);
}

function renderFiles() {
    const sub = subjects.find(s => s.id === activeId);
    const container = document.getElementById('files-list');
    if (!sub) return;
    container.innerHTML = sub.files.map(f => `
        <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 group relative animate-in hover:border-indigo-500/50 transition cursor-pointer" onclick="viewFile('${f.id}')">
            <div class="flex flex-col items-center gap-2">
                <i class="fas ${f.type.includes('pdf') ? 'fa-file-pdf text-red-500' :
            f.type.includes('word') || f.name.endsWith('.doc') || f.name.endsWith('.docx') ? 'fa-file-word text-blue-400' :
                'fa-file-image text-blue-500'} text-3xl"></i>
                <span class="text-[10px] text-slate-400 text-center truncate w-full px-1">${f.name}</span>
            </div>
            <button onclick="event.stopPropagation(); deleteFile('${f.id}')" class="absolute top-1 right-1 text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                <i class="fas fa-minus-circle"></i>
            </button>
        </div>
    `).join('') || '<p class="text-[10px] text-slate-600 col-span-full italic py-4 text-center">Sin documentos subidos.</p>';
}

function viewFile(fileId) {
    const sub = subjects.find(s => s.id === activeId);
    const file = sub.files.find(f => f.id === fileId);
    const viewer = document.getElementById('pdf-viewer');
    const container = document.getElementById('viewer-container');
    document.getElementById('viewing-filename').innerText = file.name;
    viewer.classList.remove('hidden');

    if (file.type.includes('pdf')) {
        container.innerHTML = `<iframe src="${file.data}"></iframe>`;
    } else if (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 bg-slate-950 rounded-xl border border-slate-800 gap-4">
                <i class="fas fa-file-word text-blue-400 text-5xl"></i>
                <p class="text-sm text-slate-400">Los archivos Word no pueden previsualizarse directamente.</p>
                <a href="${file.data}" download="${file.name}" class="bg-indigo-600 px-6 py-2 rounded-xl text-xs font-bold hover:bg-indigo-500 transition">Descargar para ver</a>
            </div>
        `;
    } else {
        container.innerHTML = `<div class="flex items-center justify-center h-full bg-slate-950"><img src="${file.data}" class="max-h-full rounded-lg shadow-xl"></div>`;
    }

    container.scrollIntoView({ behavior: 'smooth' });
}

function deleteFile(fileId) {
    const sub = subjects.find(s => s.id === activeId);
    sub.files = sub.files.filter(f => f.id !== fileId);
    sync(); renderFiles(); renderRecentDocs(); closeViewer();
}

function closeViewer() { document.getElementById('pdf-viewer').classList.add('hidden'); }

function renderRecentDocs() {
    const recent = document.getElementById('recent-docs');
    const allFiles = subjects.flatMap(s => s.files.map(f => ({ ...f, subTitle: s.title })));
    recent.innerHTML = allFiles.slice(-4).reverse().map(f => `
        <div class="bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex items-center gap-3 animate-in">
            <i class="fas fa-file-pdf text-red-500/40 text-sm"></i>
            <div class="overflow-hidden">
                <span class="text-[10px] text-slate-300 font-bold block truncate">${f.name}</span>
                <span class="text-[8px] text-slate-600 uppercase">${f.subTitle}</span>
            </div>
        </div>
    `).join('') || '<p class="text-[10px] text-slate-700 italic text-center py-4">Sin documentos</p>';
}

// TIMER
function renderTimerSelectors() {
    const container = document.getElementById('timer-subject-selector');
    container.innerHTML = subjects.map(s => `
        <button onclick="setTimerSubject('${s.title}')" class="bg-slate-900 border border-slate-800 p-3 rounded-xl text-[10px] font-bold hover:border-indigo-500 transition text-slate-400">${s.title}</button>
    `).join('');
}

function setTimerSubject(name) { document.getElementById('timer-subject').innerText = `Enfoque: ${name}`; }

function toggleTimer() {
    const icon = document.getElementById('timer-icon');
    const display = document.getElementById('timer-display');
    if (timerRunning) {
        clearInterval(timerInterval);
        icon.className = 'fas fa-play';
        display.classList.remove('border-indigo-500');
    } else {
        display.classList.add('border-indigo-500');
        icon.className = 'fas fa-pause';
        timerInterval = setInterval(() => {
            timeLeft--; updateTimerDisplay();
            if (timeLeft <= 0) { clearInterval(timerInterval); alert("Sesión terminada"); resetTimer(); }
        }, 1000);
    }
    timerRunning = !timerRunning;
}

function resetTimer() {
    clearInterval(timerInterval); timeLeft = 1500; timerRunning = false;
    updateTimerDisplay(); document.getElementById('timer-icon').className = 'fas fa-play';
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60); const secs = timeLeft % 60;
    document.getElementById('time-left').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

window.onload = () => { renderOverview(); if (subjects.length > 0) openSubject(subjects[0].id); };
