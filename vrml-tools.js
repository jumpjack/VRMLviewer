/*
==========================================================================
BUILD: 1.0.2
DATA: 2026-01-22
DESCRIZIONE: NASA VRML Ultimate Explorer - Core Logic
MODIFICHE:
- Build 1.0.0: Versione iniziale unificata.
- Build 1.0.1: Separazione JS/CSS, gestione librerie locali,
               estrazione info VRML (versione, nome, titolo),
               pulsante caricamento spostato in cima.
- Build 1.0.2: Migliorato parser titolo (supporto DEF Title Info VRML 1.0),
               aggiunta estrazione commenti iniziali per tooltip.
==========================================================================
*/

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
let scene, camera, rootNode, ground, axesLines = [];
let zipInstance = null, processedPaths = new Map(), selectedPath = null;
let replacementMap = new Map(), textureList = [];

const initScene = () => {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.95, 0.95, 0.98, 1);
    camera = new BABYLON.ArcRotateCamera("cam", -Math.PI/2, Math.PI/3, 50, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.9;
    rootNode = new BABYLON.TransformNode("root", scene);

    const gridMat = new BABYLON.GridMaterial("gridMat", scene);
    gridMat.opacity = 0.2;
    ground = BABYLON.MeshBuilder.CreateGround("groundGrid", {width: 2000, height: 2000}, scene);
    ground.material = gridMat;
    ground.isPickable = false;

    createThinAxes();

    scene.onPointerObservable.add((info) => {
        if (info.type === BABYLON.PointerEventTypes.POINTERDOUBLETAP) {
            const pick = scene.pick(scene.pointerX, scene.pointerY);
            if (pick.hit) camera.setTarget(pick.pickedPoint);
        }
    });
};

function createThinAxes() {
    const size = 50;
    const x = BABYLON.MeshBuilder.CreateLines("axisX", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(size,0,0)], colors: [new BABYLON.Color4(1,0,0,1), new BABYLON.Color4(1,0,0,1)]}, scene);
    const y = BABYLON.MeshBuilder.CreateLines("axisY", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,size,0)], colors: [new BABYLON.Color4(0,1,0,1), new BABYLON.Color4(0,1,0,1)]}, scene);
    const z = BABYLON.MeshBuilder.CreateLines("axisZ", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,0,size)], colors: [new BABYLON.Color4(0,0,1,1), new BABYLON.Color4(0,0,1,1)]}, scene);
    axesLines = [x, y, z];
    axesLines.forEach(l => l.isPickable = false);
}

function toggleAxes() {
    const visible = document.getElementById("showAxes").checked;
    axesLines.forEach(l => l.setEnabled(visible));
    ground.setEnabled(visible);
}

initScene();
engine.runRenderLoop(() => scene.render());

async function handleZipUpload() {
    const file = document.getElementById("fileZipLoc").files[0];
    if (!file) return;
    zipInstance = await JSZip.loadAsync(file);
    const dropdown = document.getElementById("rootSelect");
    dropdown.innerHTML = "";
    Object.keys(zipInstance.files).filter(f => f.toLowerCase().endsWith('.wrl')).sort().forEach(f => {
        const opt = document.createElement("option"); opt.value = f; opt.innerText = f; dropdown.appendChild(opt);
    });
    document.getElementById("root-selection-area").style.display = "block";
    autoDetectVersion();
}

async function autoDetectVersion() {
    const path = document.getElementById("rootSelect").value;
    const infoBox = document.getElementById("file-header-info");
    const fileName = path.split('/').pop();

    try {
        const data = await getZipData(path);
        const text = new TextDecoder().decode(data.slice(0, 3000)); // Buffer più ampio per i commenti
        let ver = "Sconosciuta";

        if (text.includes("V1.0")) {
            ver = "VRML 1.0";
            document.getElementById('mapX').value = 'X+';
            document.getElementById('mapY').value = 'Z-';
            document.getElementById('mapZ').value = 'Y+';
        } else if (text.includes("V2.0") || text.includes("UTF8")) {
            ver = "VRML 2.0 (97)";
            document.getElementById('mapX').value = 'X+';
            document.getElementById('mapY').value = 'Y+';
            document.getElementById('mapZ').value = 'Z+';
        }

        // Estrazione Titolo (Supporto multi-versione)
        let title = "Nessun titolo trovato";
        const titleRegexV1 = /DEF\s+Title\s+Info\s*\{[^]*?string\s*"([^"]+)"/i;
        const titleRegexV2 = /TITLE\s+"([^"]+)"/i;
        const titleComment = /#\s*Title:\s*(.+)/i;

        const match = text.match(titleRegexV1) || text.match(titleRegexV2) || text.match(titleComment);
        if (match) title = match[1].trim();

        // Estrazione Commenti per Tooltip
        const lines = text.split('\n');
        let comments = [];
        for(let line of lines) {
            line = line.trim();
            if (line.startsWith('#')) {
                comments.push(line.replace(/^#\s*/, ''));
            } else if (line.length > 0 && !line.startsWith('#')) {
                // Se troviamo una riga non vuota che non è un commento, ci fermiamo
                if (!line.includes('VRML')) break;
            }
        }
        const tooltipText = comments.join('\n').trim();

        // Aggiorna UI info
        infoBox.style.display = "block";
        document.getElementById("info-ver").innerText = ver;
        document.getElementById("info-name").innerText = fileName;

        const titleEl = document.getElementById("info-title");
        titleEl.innerText = title;
        titleEl.parentElement.title = tooltipText || "Nessun commento aggiuntivo";
        titleEl.style.textDecoration = "underline dotted"; // Suggerisce che c'è un tooltip
        titleEl.style.cursor = "help";

    } catch(e) {
        console.error("Errore auto-detect:", e);
    }
}

function convertCoords(rawX, rawY, rawZ) {
    let bjs = { x: 0, y: 0, z: 0 };
    const mapping = [{ val: rawX, map: document.getElementById('mapX').value }, { val: rawY, map: document.getElementById('mapY').value }, { val: rawZ, map: document.getElementById('mapZ').value }];
    mapping.forEach(m => {
        let axis = m.map[0].toLowerCase();
        let sign = m.map[1] === '+' ? 1 : -1;
        bjs[axis] = m.val * sign;
    });
    return new BABYLON.Vector3(bjs.x, bjs.y, bjs.z);
}

async function startAnalysis() {
    document.getElementById("tree-container").innerHTML = "";
    processedPaths.forEach(node => node.dispose());
    processedPaths.clear();
    textureList = [];
    await loadRecursive(document.getElementById("rootSelect").value, rootNode, document.getElementById("tree-container"));
    focusCamera();
}

async function loadRecursive(path, parentBjs, uiParent) {
    const normPath = path.replace(/\\/g, '/').replace(/^\//, '');
    const fileName = normPath.split('/').pop();
    const isWrl = normPath.toLowerCase().endsWith('.wrl');

    const nodeContainer = document.createElement("div");
    nodeContainer.className = "tree-node";
    const header = document.createElement("div");
    header.className = "tree-header";
    header.innerHTML = `<span class="tree-toggle">${isWrl ? "▼" : "•"}</span> ${isWrl ? "📄" : "🖼️"} ${fileName}`;
    nodeContainer.appendChild(header);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-children";
    nodeContainer.appendChild(childrenContainer);
    uiParent.appendChild(nodeContainer);

    header.onclick = (e) => { e.stopPropagation(); nodeContainer.classList.toggle("collapsed"); header.querySelector(".tree-toggle").innerText = nodeContainer.classList.contains("collapsed") ? "▶" : "▼"; };
    header.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); selectedPath = normPath; document.querySelectorAll('.selected-node').forEach(n => n.classList.remove('selected-node')); header.classList.add('selected-node'); openMenu(e); };

    if (processedPaths.has(normPath)) return;
    const fileContainer = new BABYLON.TransformNode(normPath, scene);
    fileContainer.parent = parentBjs;
    processedPaths.set(normPath, fileContainer);

    if (!isWrl) return;

    try {
        let data = replacementMap.has(normPath) ? replacementMap.get(normPath) : await getZipData(normPath);
        if (normPath.endsWith(".wrz") || (data[0] === 0x1f && data[1] === 0x8b)) data = pako.ungzip(data);
        const text = new TextDecoder("utf-8").decode(data);
        const geo = parseVRMLGeometry(text);
        if (geo.points.length > 0) {
            const mesh = createMesh(geo, normPath);
            mesh.parent = fileContainer;
            const texMatch = text.match(/(?:ImageTexture|Texture2)\s*\{[^]*?(?:url|filename)\s*["']?([^"'\s>]+)["']/i);
            if (texMatch) {
                const texPath = resolve(normPath, texMatch[1].replace(/[\[\]"]/g, ""));
                await applyTexture(mesh, texPath);
                await loadRecursive(texPath, fileContainer, childrenContainer);
            }
        }
        await parseVrmlStructure(text, normPath, fileContainer, childrenContainer);
    } catch (e) { nodeContainer.style.color = "orange"; }
}

async function parseVrmlStructure(text, currentPath, parentBjs, uiParent) {
    let i = 0;
    while (i < text.length) {
        const sepStart = text.indexOf("Separator {", i);
        const transStart = text.indexOf("Transform {", i);
        const inlineStart = Math.min(text.indexOf("WWWInline {", i) === -1 ? Infinity : text.indexOf("WWWInline {", i), text.indexOf("Inline {", i) === -1 ? Infinity : text.indexOf("Inline {", i));
        const startIdx = Math.min(sepStart === -1 ? Infinity : sepStart, transStart === -1 ? Infinity : transStart, inlineStart);
        if (startIdx === Infinity) break;
        const block = extractBlock(text, startIdx);
        if (startIdx === sepStart || startIdx === transStart) {
            const tNode = new BABYLON.TransformNode("group", scene);
            tNode.parent = parentBjs;
            const tr = block.match(/Translation\s*\{\s*translation\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i) || block.match(/translation\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
            if (tr) tNode.position = convertCoords(parseFloat(tr[1]), parseFloat(tr[2]), parseFloat(tr[3]));
            const ro = block.match(/Rotation\s*\{\s*rotation\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i) || block.match(/rotation\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
            if (ro) {
                const axis = convertCoords(parseFloat(ro[1]), parseFloat(ro[2]), parseFloat(ro[3]));
                tNode.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, parseFloat(ro[4]));
            }
            await parseVrmlStructure(block, currentPath, tNode, uiParent);
            i = startIdx + block.length + 12;
        } else {
            const urlMatch = block.match(/(?:name|url)\s*["']?([^"'\s>]+)["']/i);
            if (urlMatch) await loadRecursive(resolve(currentPath, urlMatch[1]), parentBjs, uiParent);
            i = startIdx + block.length + 10;
        }
    }
}

function parseVRMLGeometry(t) {
    const points = [], indices = [], uvs = [], uvIndices = [];
    const cMatch = t.match(/Coordinate(?:3)?\s*\{[^]*?point\s*\[([^\]]+)\]/m);
    if (cMatch) {
        const raw = cMatch[1].trim().split(/[\s,]+/);
        for (let i = 0; i < raw.length; i += 3) {
            if(raw[i+2]) { const v = convertCoords(parseFloat(raw[i]), parseFloat(raw[i+1]), parseFloat(raw[i+2])); points.push(v.x, v.y, v.z); }
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
            else { for (let j = 1; j < face.length - 1; j++) { indices.push(face[0], face[j+1], face[j]); uvIndices.push(uvFace[0], uvFace[j+1], uvFace[j]); } face = []; uvFace = []; }
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

function createMesh(d, name) {
    const m = new BABYLON.Mesh(name, scene);
    const vd = new BABYLON.VertexData();
    vd.positions = d.points; vd.indices = d.indices; vd.uvs = d.uvs;
    const norms = []; BABYLON.VertexData.ComputeNormals(d.points, d.indices, norms);
    vd.normals = norms; vd.applyToMesh(m);
    m.material = new BABYLON.StandardMaterial("m", scene);
    m.material.specularColor = new BABYLON.Color3(0, 0, 0); m.material.backFaceCulling = false;
    return m;
}

async function applyTexture(mesh, texPath) {
    try {
        const data = await getZipData(texPath);
        let finalUrl;

        if (texPath.toLowerCase().endsWith('.rgb')) {
            const canvasRgb = decodeSGIToCanvas(data);
            finalUrl = canvasRgb.toDataURL();
        } else {
            finalUrl = URL.createObjectURL(new Blob([data]));
        }

        const tex = new BABYLON.Texture(finalUrl, scene, false, false);
        mesh.material.diffuseTexture = tex;
        mesh.material.diffuseColor = new BABYLON.Color3(1, 1, 1);

        tex.wAng = Math.PI;
        tex.uScale = -1;
        tex.uOffset = 1;
    } catch(e) {
        console.error("Errore texture:", texPath, e);
    }
}

function openMenu(e) {
    const menu = document.getElementById("context-menu");
    menu.style.display = "block";
    let x = e.pageX; let y = e.pageY;
    if (x + 180 > window.innerWidth) x -= 180;
    if (y + 250 > window.innerHeight) y -= 250;
    menu.style.left = x + "px"; menu.style.top = y + "px";
}

async function menuAction(action) {
    const node = processedPaths.get(selectedPath);
    if (action === 'show') { processedPaths.forEach(n => n.setEnabled(false)); let curr = node; while(curr) { curr.setEnabled(true); curr = curr.parent; } }
    else if (action === 'hide') { processedPaths.forEach(n => n.setEnabled(true)); if (node) node.setEnabled(false); }
    else if (action === 'all') { processedPaths.forEach(n => n.setEnabled(true)); }
    else if (action === 'translate') { const v = prompt("Trasla X,Y,Z:", "0,0,0").split(",").map(parseFloat); node.position.addInPlace(new BABYLON.Vector3(v[0]||0, v[1]||0, v[2]||0)); }
    else if (action === 'rotate') { const v = prompt("Ruota Gradi (X,Y,Z):", "0,0,0").split(",").map(parseFloat); if(v.length===3) { node.rotation.x += BABYLON.Tools.ToRadians(v[0]); node.rotation.y += BABYLON.Tools.ToRadians(v[1]); node.rotation.z += BABYLON.Tools.ToRadians(v[2]); } }
    else if (action === 'replace') { document.getElementById("replaceInput").click(); }
    else if (action === 'view') {
        const data = await getZipData(selectedPath);
        const isRgb = selectedPath.toLowerCase().endsWith('.rgb');
        const isStdImg = /\.(png|jpg|jpeg|gif)$/i.test(selectedPath);
        const isImg = isRgb || isStdImg;

        document.getElementById("notepad-title").innerText = "Visualizzatore: " + selectedPath;
        const t = document.getElementById("notepad-text");
        const i = document.getElementById("notepad-img");

        if (isImg) {
            t.style.display = "none"; i.style.display = "block";
            if (isRgb) {
                const canvasRgb = decodeSGIToCanvas(data);
                i.src = canvasRgb.toDataURL();
            } else {
                i.src = URL.createObjectURL(new Blob([data]));
            }
        } else {
            i.style.display = "none"; t.style.display = "block";
            t.innerText = new TextDecoder().decode(data);
        }
        document.getElementById("notepad").style.display = "flex";
    }
}

async function exportToGLB() {
    const options = {
        shouldExportNode: (node) => {
            return node.name !== "axisX" && node.name !== "axisY" && node.name !== "axisZ" &&
                   node.name !== "groundGrid" && node.name !== "cam" && node.name !== "light";
        }
    };
    await BABYLON.GLTF2Export.GLBAsync(scene, "NASA_Export", options).then((glb) => glb.downloadFiles());
}

function exportConfig() {
    const config = { axes: { x: document.getElementById('mapX').value, y: document.getElementById('mapY').value, z: document.getElementById('mapZ').value }, replacements: Array.from(replacementMap.keys()) };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nasa_config.json"; a.click();
}

async function getZipData(path) {
    let entry = zipInstance.file(path) || zipInstance.file(path.toLowerCase());
    if (!entry) { const key = Object.keys(zipInstance.files).find(k => k.toLowerCase() === path.toLowerCase()); if (key) entry = zipInstance.file(key); }
    if (!entry) throw "404"; return await entry.async("uint8array");
}

function decodeSGIToCanvas(uint8Array) {
    try {
        const dv = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
        const magic = dv.getUint16(0, false);
        if (magic !== 0x01DA) throw new Error('Non è un file SGI RGB');

        const storage = dv.getUint8(2);     // 0 = Verbatim, 1 = RLE
        const bpc = dv.getUint8(3);         // Bytes per channel
        const xsize = dv.getUint16(6, false);
        const ysize = dv.getUint16(8, false);
        const zsize = dv.getUint16(10, false);

        const canvas = document.createElement('canvas');
        canvas.width = xsize; canvas.height = ysize;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(xsize, ysize);
        const out = imgData.data;

        for (let i = 3; i < out.length; i += 4) out[i] = 255;

        if (storage === 0) {
            const dataOffset = 512;
            const planeSize = xsize * ysize;
            for (let y = 0; y < ysize; y++) {
                for (let x = 0; x < xsize; x++) {
                    const outIdx = ((ysize - 1 - y) * xsize + x) * 4;
                    const sgiIdx = (y * xsize + x);
                    if (zsize >= 3) {
                        out[outIdx]     = uint8Array[dataOffset + sgiIdx];
                        out[outIdx + 1] = uint8Array[dataOffset + planeSize + sgiIdx];
                        out[outIdx + 2] = uint8Array[dataOffset + planeSize * 2 + sgiIdx];
                    } else {
                        const val = uint8Array[dataOffset + sgiIdx];
                        out[outIdx] = out[outIdx+1] = out[outIdx+2] = val;
                    }
                }
            }
        } else {
            const tabOff = 512;
            for (let z = 0; z < Math.min(zsize, 3); z++) {
                for (let y = 0; y < ysize; y++) {
                    const rowIdx = y + (z * ysize);
                    const offset = dv.getUint32(tabOff + (rowIdx * 4), false);
                    let readPtr = offset;
                    let writePtr = 0;
                    const outY = ysize - 1 - y;

                    while (writePtr < xsize) {
                        let pixel = uint8Array[readPtr++];
                        let count = pixel & 0x7f;
                        if (count === 0) break;
                        if (pixel & 0x80) {
                            while (count--) {
                                const val = uint8Array[readPtr++];
                                const outIdx = (outY * xsize + writePtr++) * 4;
                                if (zsize === 1) { out[outIdx]=out[outIdx+1]=out[outIdx+2]=val; } else { out[outIdx + z] = val; }
                            }
                        } else {
                            const val = uint8Array[readPtr++];
                            while (count--) {
                                const outIdx = (outY * xsize + writePtr++) * 4;
                                if (zsize === 1) { out[outIdx]=out[outIdx+1]=out[outIdx+2]=val; } else { out[outIdx + z] = val; }
                            }
                        }
                    }
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    } catch (e) {
        console.error("SGI Decode Error:", e);
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
    }
}

function extractBlock(text, start) { let d = 0, first = text.indexOf("{", start); for (let i = first; i < text.length; i++) { if (text[i] === "{") d++; if (text[i] === "}") d--; if (d === 0) return text.substring(first + 1, i); } return ""; }
function resolve(base, rel) { const b = base.split('/'); b.pop(); const r = rel.replace(/^\.\//, "").split('/'); for (const p of r) { if (p === "..") b.pop(); else if (p !== ".") b.push(p); } return b.join('/'); }
function focusCamera() { let min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity), has = false; processedPaths.forEach(n => { if (!n.isEnabled()) return; n.getChildMeshes().forEach(m => { const b = m.getBoundingInfo().boundingBox; min = BABYLON.Vector3.Minimize(min, b.minimumWorld); max = BABYLON.Vector3.Maximize(max, b.maximumWorld); has = true; }); }); if(has) { camera.setTarget(BABYLON.Vector3.Center(min, max)); camera.radius = BABYLON.Vector3.Distance(min, max) * 1.5; } }
window.onclick = () => document.getElementById("context-menu").style.display = "none";
function closeNotepad() { document.getElementById("notepad").style.display = "none"; }
async function handleReplacement(e) { replacementMap.set(selectedPath, new Uint8Array(await e.target.files[0].arrayBuffer())); startAnalysis(); }