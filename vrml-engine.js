/*
==========================================================================
BUILD: 1.1.5
DATA: 2026-01-22
DESCRIZIONE: NASA VRML Ultimate Explorer - Core Engine
MODIFICHE:
- Build 1.1.4: Ripristinata retrocompatibilità e texture nell'albero.
- Build 1.1.5: Aggiunta Barra di Progresso e gestione asincrona per
               evitare freeze della UI. Rotazione mesh Area 2.
==========================================================================
*/

let processedPaths = new Map();
let selectedPath = null;
let totalTasks = 0;
let completedTasks = 0;

// In cima al file vrml-engine.js
window.abortAnalysis = false;

function cancelAnalysis() {
    if (confirm("Interrompere il caricamento? Le mesh già elaborate resteranno visibili.")) {
        window.abortAnalysis = true;
    }
}

async function startAnalysis() {
    window.abortAnalysis = false; // Reset
    document.getElementById("btn-stop").style.display = "block";
    document.getElementById("btn-start").disabled = true;

    document.getElementById("tree-container").innerHTML = "";
    processedPaths.forEach(node => node.dispose());
    processedPaths.clear();

    await loadRecursive(document.getElementById("rootSelect").value, rootNode, document.getElementById("tree-container"));

    document.getElementById("btn-stop").style.display = "none";
    document.getElementById("btn-start").disabled = false;
    updateProgress(100);
    //focusCamera();
}

function updateProgress(percent) {
    const wrap = document.getElementById("progress-bar-wrap");
    const fill = document.getElementById("progress-bar-fill");
    wrap.style.display = "block";
    fill.style.width = percent + "%";
    if (percent >= 100) setTimeout(() => wrap.style.display = "none", 500);
}



async function autoDetectVersion() {
    const path = document.getElementById("rootSelect").value;
    const infoBox = document.getElementById("file-header-info");
    const fileName = path.split('/').pop();
    try {
        const data = await getZipData(path);
        const text = new TextDecoder().decode(data.slice(0, 3000));
        let ver = "Sconosciuta";
        if (text.includes("V1.0")) {
            ver = "VRML 1.0";
            document.getElementById('mapX').value = 'X+'; document.getElementById('mapY').value = 'Z-'; document.getElementById('mapZ').value = 'Y+';
        } else {
            ver = "VRML 2.0 (97)";
            document.getElementById('mapX').value = 'X+'; document.getElementById('mapY').value = 'Y+'; document.getElementById('mapZ').value = 'Z+';
        }

// Aggiungi questo controllo dopo il check VRML 1.0
if (text.includes("#Inventor")) {
    ver = "OpenInventor 2.1";
    document.getElementById('mapX').value = 'X+';
    document.getElementById('mapY').value = 'Y+';
    document.getElementById('mapZ').value = 'Z+';
}

        let title = "Nessun titolo trovato";
        const titleRegexV1 = /DEF\s+Title\s+Info\s*\{[^]*?string\s*"([^"]+)"/i;
        const titleRegexV2 = /TITLE\s+"([^"]+)"/i;
        const match = text.match(titleRegexV1) || text.match(titleRegexV2);
        if (match) title = match[1].trim();

        const lines = text.split('\n');
        let comments = [];
        for(let line of lines) {
            line = line.trim();
            if (line.startsWith('#')) comments.push(line.replace(/^#\s*/, ''));
            else if (line.length > 0 && !line.startsWith('#') && !line.includes('VRML')) break;
        }
        infoBox.style.display = "block";
        document.getElementById("info-ver").innerText = ver;
        document.getElementById("info-name").innerText = fileName;
        const titleEl = document.getElementById("info-title");
        titleEl.innerText = title;
        titleEl.parentElement.title = comments.join('\n').trim();
    } catch(e) {}
}






async function loadRecursive(path, parentBjs, uiParent) {
    const normPath = path.replace(/\\/g, '/').replace(/^\//, '');
    const fileName = normPath.split('/').pop();
    const isWrl = normPath.toLowerCase().endsWith('.wrl') ||
                  normPath.toLowerCase().endsWith('.wrz') ||
                  normPath.toLowerCase().endsWith('.iv');

    // --- FIX DUPLICATI: Controllo se il file è già stato processato ---
    if (processedPaths.has(normPath) && isWrl) {
        // Se è già presente, aggiungiamo solo una nota nell'albero e non ricarichiamo
        const refNode = document.createElement("div");
        refNode.className = "tree-node collapsed";
        refNode.innerHTML = `<div class="tree-header" style="opacity:0.6"><span>•</span> 🔗 <i>${fileName} (Già caricato)</i></div>`;
        uiParent.appendChild(refNode);
        return;
    }

    // Creazione Nodo UI
    const nodeContainer = document.createElement("div");
    nodeContainer.className = "tree-node collapsed";
    const header = document.createElement("div");
    header.className = "tree-header";
    header.innerHTML = `<span class="tree-toggle">${isWrl ? "▶" : "•"}</span> ${isWrl ? "📄" : "🖼️"} <span class="node-label">${fileName}</span>`;
    nodeContainer.appendChild(header);
    uiParent.appendChild(nodeContainer);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-children";
    nodeContainer.appendChild(childrenContainer);

    header.onclick = (e) => {
        e.stopPropagation();
        nodeContainer.classList.toggle("collapsed");
        header.querySelector(".tree-toggle").innerText = nodeContainer.classList.contains("collapsed") ? "▶" : "▼";
    };

    header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedPath = normPath;
        document.querySelectorAll('.selected-node').forEach(n => n.classList.remove('selected-node'));
        header.classList.add('selected-node');
        openMenu(e);
    };

    if (!isWrl) return;

    // Creazione contenitore 3D
    const fileContainer = new BABYLON.TransformNode(normPath, scene);
    fileContainer.parent = parentBjs;
    processedPaths.set(normPath, fileContainer);

    try {
        let data = replacementMap.has(normPath) ? replacementMap.get(normPath) : await getZipData(normPath);
        if (normPath.toLowerCase().endsWith(".wrz") || (data[0] === 0x1f && data[1] === 0x8b)) data = pako.ungzip(data);
        const text = new TextDecoder("utf-8").decode(data);

        // --- SUPPORTO OPEN INVENTOR ---
if (normPath.toLowerCase().endsWith('.iv') || text.includes("#Inventor")) {
    console.log("🛠️ [ENGINE] Rilevato formato OpenInventor. Passo il controllo a iv-engine.js");
    await parseIVStructure(text, normPath, fileContainer, childrenContainer);
} else {
            // --- ANALISI VRML STANDARD ---
            const globalGeo = parseVRMLGeometry(text);
            if (globalGeo.points.length > 0) {
                const mesh = createMesh(globalGeo, fileName + "_geo");
                mesh.parent = fileContainer;
                const texMatch = text.match(/(?:ImageTexture|Texture2)\s*\{[^]*?(?:url|filename)\s*["']?([^"'\s>]+)["']/i);
                if (texMatch) {
                    const texPath = resolve(normPath, texMatch[1].replace(/[\[\]"]/g, ""));
                    await applyTexture(mesh, texPath);
                    await loadRecursive(texPath, fileContainer, childrenContainer);
                }
            }
            await parseVrmlStructure(text, normPath, fileContainer, childrenContainer);
        }

    } catch (e) {
        console.error("Errore nel caricamento di:", normPath, e);
        header.style.color = "#d9534f";
        header.querySelector(".node-label").innerText += " [ERRORE/MANCANTE]";
    }
}




async function parseVrmlStructure(text, currentPath, parentBjs, uiParent) {
    let i = 0;
    const keywords = ["Separator", "Transform", "Group", "WWWInline", "Inline", "Shape"];
    const totalLen = text.length;
    let lastProgressUpdate = 0;

    while (i < text.length) {
        // Aggiornamento Barra Progresso (ogni 5% del file corrente)
        let currentProgress = Math.floor((i / totalLen) * 90);
        if (currentProgress > lastProgressUpdate) {
            updateProgress(10 + currentProgress);
            lastProgressUpdate = currentProgress;
            // Yield al browser per permettere il refresh della UI
            await new Promise(r => setTimeout(r, 0));
        }

        let earliest = Infinity;
        let type = null;

        keywords.forEach(kw => {
            const idx = text.indexOf(kw + " {", i);
            if (idx !== -1 && idx < earliest) { earliest = idx; type = kw; }
        });

        if (earliest === Infinity) break;
        const block = extractBlock(text, earliest);

        if (type === "Transform" || type === "Separator" || type === "Group") {
const tNode = new BABYLON.TransformNode(type, scene);
tNode.parent = parentBjs;

// valori di default VRML
let t = BABYLON.Vector3.Zero();
let s = new BABYLON.Vector3(1, 1, 1);
let q = BABYLON.Quaternion.Identity();

// translation
const tr = block.match(/translation\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/i);
if (tr) {
    t = convertCoords(
        parseFloat(tr[1]),
        parseFloat(tr[2]),
        parseFloat(tr[3])
    );
}

// rotation (asse + angolo)
const ro = block.match(/rotation\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/i);
if (ro) {
    const axis = convertCoords(
        parseFloat(ro[1]),
        parseFloat(ro[2]),
        parseFloat(ro[3])
    ).normalize();
    q = BABYLON.Quaternion.RotationAxis(axis, parseFloat(ro[4]));
}

// scale
const sc = block.match(/scale\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/i);
if (sc) {
    s = convertCoords(
        parseFloat(sc[1]),
        parseFloat(sc[2]),
        parseFloat(sc[3])
    );
}

// MATRICE VRML: T * R * S
const m = BABYLON.Matrix.Compose(s, q, t);

// applica come pre-transform (fondamentale)
tNode.setPreTransformMatrix(m);

tNode.position.set(0, 0, 0);
tNode.scaling.set(1, 1, 1);
tNode.rotationQuaternion = BABYLON.Quaternion.Identity();

// forza Babylon a NON decomporre
tNode._usePivotMatrixForWorldMatrix = true;
tNode.computeWorldMatrix(true);


            await parseVrmlStructure(block, currentPath, tNode, uiParent);
        }
        else if (type === "Shape") {
            const geoData = parseVRMLGeometry(block);
            if (geoData.points.length > 0) {
                const mesh = createMesh(geoData, "Shape_Mesh");
                mesh.parent = parentBjs;

                const texMatch = block.match(/(?:ImageTexture|Texture2)\s*\{[^]*?(?:url|filename)\s*["']?([^"'\s>]+)["']/i);
                if (texMatch) {
                    const texPath = resolve(currentPath, texMatch[1].replace(/[\[\]"]/g, ""));
                    await applyTexture(mesh, texPath);
                    await loadRecursive(texPath, parentBjs, uiParent);
                }
            }
        }
else if (type === "WWWInline" || type === "Inline") {
    const urlMatch = block.match(/(?:name|url)\s*["']?([^"'\s>]+)["']/i);
    if (urlMatch)
await loadRecursive(
    resolve(currentPath, urlMatch[1]),
    parentBjs, // ← SOLO se non c’è Transform sopra
    uiParent
);

}



i = earliest + type.length + block.length + 2;

    }
}




function parseVRMLGeometry(t) {
    const points = [], indices = [], uvs = [], uvIndices = [];
    const cMatch = t.match(/Coordinate(?:3)?\s*\{[^]*?point\s*\[([^\]]+)\]/m);
    if (cMatch) {
        const raw = cMatch[1].trim().split(/[\s,]+/);
        for (let i = 0; i < raw.length; i += 3) {
            if(raw[i+2]) {
                const v = convertCoords(parseFloat(raw[i]), parseFloat(raw[i+1]), parseFloat(raw[i+2]));
                points.push(v.x, v.y, v.z);
            }
        }
    }
    const uvMatch = t.match(/TextureCoordinate(?:2)?\s*\{[^]*?point\s*\[([^\]]+)\]/m);
    if (uvMatch) {
        const rawUV = uvMatch[1].trim().split(/[\s,]+/);
        for (let i = 0; i < rawUV.length; i += 2) uvs.push(parseFloat(rawUV[i]), parseFloat(rawUV[i+1]));
    }
    const fMatch = t.match(/IndexedFaceSet\s*\{[^]*?coordIndex\s*\[([^\]]+)\]/m);
    const fuvMatch = t.match(/(?:texCoordIndex|textureCoordIndex)\s*\[([^\]]+)\]/m);
    if (fMatch) {
        const rawIdx = fMatch[1].trim().split(/[\s,]+/);
        const rawUVIdx = fuvMatch ? fuvMatch[1].trim().split(/[\s,]+/) : null;
        let face = [], uvFace = [];
        for (let i = 0; i < rawIdx.length; i++) {
            let v = parseInt(rawIdx[i]);
            let uvV = rawUVIdx ? parseInt(rawUVIdx[i]) : v;
            if (!isNaN(v) && v !== -1) { face.push(v); uvFace.push(uvV); }
            else {
                for (let j = 1; j < face.length - 1; j++) {
                    indices.push(face[0], face[j+1], face[j]);
                    uvIndices.push(uvFace[0], uvFace[j+1], uvFace[j]);
                }
                face = []; uvFace = [];
            }
        }
    }
    const finalUVs = new Array((points.length / 3) * 2).fill(0);
    if (uvs.length > 0) {
        for (let i = 0; i < indices.length; i++) {
            const vIdx = indices[i]; const uvIdx = uvIndices[i];
            finalUVs[vIdx * 2] = uvs[uvIdx * 2]; finalUVs[vIdx * 2 + 1] = uvs[uvIdx * 2 + 1];
        }
    }
    return { points, indices, uvs: finalUVs };
}

function createMesh(data, name) {
    console.log(`🔧 [MESH-DEBUG] Creazione mesh '${name}' con ${data.points.length/3} vertici`);

    const mesh = new BABYLON.Mesh(name, scene);

    // Crea vertex data
    const vertexData = new BABYLON.VertexData();

    // Punti
    vertexData.positions = data.points;

    // Indici
    vertexData.indices = data.indices;

    // UV
    if (data.uvs && data.uvs.length === (data.points.length / 3 * 2)) {
        vertexData.uvs = data.uvs;
        console.log(`📏 [MESH-DEBUG] UV applicate: ${data.uvs.length/2} coordinate`);
    } else {
        console.warn(`⚠️ [MESH-WARN] UV non valide o mancanti per ${name}`);
        // Crea UV default
        const defaultUVs = new Array(data.points.length / 3 * 2);
        for (let i = 0; i < defaultUVs.length; i += 2) {
            defaultUVs[i] = 0;
            defaultUVs[i+1] = 0;
        }
        vertexData.uvs = defaultUVs;
    }

    // Calcola le normali
    vertexData.normals = [];
    BABYLON.VertexData.ComputeNormals(data.points, data.indices, vertexData.normals);

    // Applica i dati
    vertexData.applyToMesh(mesh, true);

    // Imposta materiale di default
    const material = new BABYLON.StandardMaterial(name + "_mat", scene);
    material.specularColor = new BABYLON.Color3(0, 0, 0);
    mesh.material = material;

    return mesh;
}

function convertCoords(rawX, rawY, rawZ) {
    let bjs = { x: 0, y: 0, z: 0 };
    const mapping = [
        { val: rawX, map: document.getElementById('mapX').value },
        { val: rawY, map: document.getElementById('mapY').value },
        { val: rawZ, map: document.getElementById('mapZ').value }
    ];
    mapping.forEach(m => {
        let axis = m.map[0].toLowerCase();
        let sign = m.map[1] === '+' ? 1 : -1;
        bjs[axis] = m.val * sign;
    });
    return new BABYLON.Vector3(bjs.x, bjs.y, bjs.z);
}

async function applyTexture(mesh, texPath) {
    try {
        const data = await getZipData(texPath);
        let finalUrl = texPath.toLowerCase().endsWith('.rgb') ? decodeSGIToCanvas(data).toDataURL() : URL.createObjectURL(new Blob([data]));
        const tex = new BABYLON.Texture(finalUrl, scene, false, false);
        mesh.material.diffuseTexture = tex;
        mesh.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        tex.wAng = Math.PI; tex.uScale = -1; tex.uOffset = 1;
    } catch(e) { console.warn("Texture saltata:", texPath); }
}

function decodeSGIToCanvas(uint8Array) {
    try {
        const dv = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
        if (dv.getUint16(0, false) !== 0x01DA) throw "!";
        const storage = dv.getUint8(2), xsize = dv.getUint16(6, false), ysize = dv.getUint16(8, false), zsize = dv.getUint16(10, false);
        const canvas = document.createElement('canvas'); canvas.width = xsize; canvas.height = ysize;
        const ctx = canvas.getContext('2d'), imgData = ctx.createImageData(xsize, ysize), out = imgData.data;
        for (let i = 3; i < out.length; i += 4) out[i] = 255;
        if (storage === 0) {
            const off = 512, ps = xsize * ysize;
            for (let y = 0; y < ysize; y++) for (let x = 0; x < xsize; x++) {
                const oI = ((ysize-1-y)*xsize+x)*4, sI = y*xsize+x;
                if (zsize>=3){ out[oI]=uint8Array[off+sI]; out[oI+1]=uint8Array[off+ps+sI]; out[oI+2]=uint8Array[off+ps*2+sI]; }
                else { out[oI]=out[oI+1]=out[oI+2]=uint8Array[off+sI]; }
            }
        } else {
            const tab = 512;
            for (let z = 0; z < Math.min(zsize, 3); z++) for (let y = 0; y < ysize; y++) {
                let rP = dv.getUint32(tab+(y+z*ysize)*4, false), wP = 0, oY = ysize-1-y;
                while (wP < xsize) {
                    let p = uint8Array[rP++], c = p & 0x7f; if (c === 0) break;
                    if (p & 0x80) while (c--) { let v = uint8Array[rP++], oI = (oY*xsize+wP++)*4; if(zsize===1) out[oI]=out[oI+1]=out[oI+2]=v; else out[oI+z]=v; }
                    else { let v = uint8Array[rP++]; while (c--) { let oI = (oY*xsize+wP++)*4; if(zsize===1) out[oI]=out[oI+1]=out[oI+2]=v; else out[oI+z]=v; } }
                }
            }
        }
        ctx.putImageData(imgData,0,0); return canvas;
    } catch(e) { return document.createElement('canvas'); }
}

function extractBlock(text, start) {
    let d = 0;
    let first = text.indexOf("{", start);
    if (first === -1) return "";
    for (let i = first; i < text.length; i++) {
        if (text[i] === "{") d++;
        if (text[i] === "}") d--;
        if (d === 0) return text.substring(first + 1, i);
    }
    return "";
}

function resolve(base, rel) {
    const b = base.split('/'); b.pop();
    const r = rel.replace(/^\.\//, "").split('/');
    for (const p of r) { if (p === "..") b.pop(); else if (p !== ".") b.push(p); }
    return b.join('/');
}

function openMenu(e) {
    const menu = document.getElementById("context-menu");
    menu.style.display = "block";
    let x = e.pageX, y = e.pageY;
    if (x + 180 > window.innerWidth) x -= 180;
    if (y + 250 > window.innerHeight) y -= 250;
    menu.style.left = x + "px"; menu.style.top = y + "px";
}

async function menuAction(action) {
    const node = processedPaths.get(selectedPath);
    if (action === 'show') { processedPaths.forEach(n => n.setEnabled(false)); let curr = node; while(curr) { curr.setEnabled(true); curr = curr.parent; } }
    else if (action === 'hide') { processedPaths.forEach(n => n.setEnabled(true)); if (node) node.setEnabled(false); }
    else if (action === 'all') { processedPaths.forEach(n => n.setEnabled(true)); }
    else if (action === 'translate') {
        const v = prompt("X,Y,Z:", "0,0,0").split(",").map(parseFloat);
        if(node) node.position.addInPlace(new BABYLON.Vector3(v[0]||0, v[1]||0, v[2]||0));
    }
    else if (action === 'rotate') {
        const v = prompt("Gradi X,Y,Z:", "0,0,0").split(",").map(parseFloat);
        if(node && v.length===3) {
            node.rotation.x += BABYLON.Tools.ToRadians(v[0]);
            node.rotation.y += BABYLON.Tools.ToRadians(v[1]);
            node.rotation.z += BABYLON.Tools.ToRadians(v[2]);
        }
    }
    else if (action === 'replace') { document.getElementById("replaceInput").click(); }
    else if (action === 'view') {
        const data = await getZipData(selectedPath);
        const isRgb = selectedPath.toLowerCase().endsWith('.rgb'), isImg = isRgb || /\.(png|jpg|jpeg|gif)$/i.test(selectedPath);
        document.getElementById("notepad-title").innerText = selectedPath;
        const t = document.getElementById("notepad-text"), i = document.getElementById("notepad-img");
        if (isImg) { t.style.display = "none"; i.style.display = "block"; i.src = isRgb ? decodeSGIToCanvas(data).toDataURL() : URL.createObjectURL(new Blob([data])); }
        else { i.style.display = "none"; t.style.display = "block"; t.innerText = new TextDecoder().decode(data); }
        document.getElementById("notepad").style.display = "flex";
    }
}

function convertCoords(rawX, rawY, rawZ) {
    // Restituiamo il vettore originale senza trasformarlo qui.
    // La mappatura verrà gestita in tempo reale dal rootNode.
    return new BABYLON.Vector3(rawX, rawY, rawZ);
}

function applyMapping() {
    if (!rootNode) return;

    const getVec = (id) => {
        const val = document.getElementById(id).value;
        const s = val.endsWith('+') ? 1 : -1;
        if (val.startsWith('X')) return new BABYLON.Vector3(s, 0, 0);
        if (val.startsWith('Y')) return new BABYLON.Vector3(0, s, 0);
        if (val.startsWith('Z')) return new BABYLON.Vector3(0, 0, s);
        return BABYLON.Vector3.Zero();
    };

    const vX = getVec("mapX");
    const vY = getVec("mapY");
    const vZ = getVec("mapZ");

    // Creiamo una matrice di rotazione dai tre assi scelti
    const matrix = BABYLON.Matrix.Identity();
    matrix.setRowFromFloats(0, vX.x, vX.y, vX.z, 0);
    matrix.setRowFromFloats(1, vY.x, vY.y, vY.z, 0);
    matrix.setRowFromFloats(2, vZ.x, vZ.y, vZ.z, 0);

    // Applichiamo la mappatura come "Pre-trasformazione"
    // Questo permette di cambiare assi senza resettare le rotazioni fatte coi pulsanti
    rootNode.setPreTransformMatrix(matrix);

    console.log("Mappatura assi applicata in tempo reale.");
}

// Integriamo la chiamata a applyMapping dentro startAnalysis affinché
// l'orientamento sia corretto anche al primo caricamento.
const originalStartAnalysis = startAnalysis;
startAnalysis = async function() {
    await originalStartAnalysis();
    applyMapping();
};


window.onclick = () => document.getElementById("context-menu").style.display = "none";
function closeNotepad() { document.getElementById("notepad").style.display = "none"; }