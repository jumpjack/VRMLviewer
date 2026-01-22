/*
==========================================================================
BUILD: 1.1.1
DATA: 2026-01-22
DESCRIZIONE: NASA VRML Ultimate Explorer - File IO Module
MODIFICHE:
- Build 1.1.0: Separazione modulo Input/Output e ZIP.
- Build 1.1.1: Supporto per caricamento file singoli .wrl e .wrz.
==========================================================================
*/

let zipInstance = null;
let replacementMap = new Map();

async function handleFileUpload() {
    const file = document.getElementById("fileZipLoc").files[0];
    if (!file) return;

    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();

    if (ext === 'zip') {
        // Gestione standard ZIP
        zipInstance = await JSZip.loadAsync(file);
    } else if (ext === 'wrl' || ext === 'wrz') {
        // Gestione file singolo: creiamo uno zip virtuale
        zipInstance = new JSZip();
        zipInstance.file(fileName, file);
    } else {
        alert("Formato non supportato");
        return;
    }

    const dropdown = document.getElementById("rootSelect");
    dropdown.innerHTML = "";

    // Filtriamo i file wrl/wrz presenti (che sia uno o molti nello zip)
    Object.keys(zipInstance.files).filter(f => {
        const low = f.toLowerCase();
        return low.endsWith('.wrl') || low.endsWith('.wrz');
    }).sort().forEach(f => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.innerText = f;
        dropdown.appendChild(opt);
    });

    document.getElementById("root-selection-area").style.display = "block";
    autoDetectVersion();
}

// ... restano identiche le funzioni getZipData, handleReplacement, exportToGLB, exportConfig ...
async function getZipData(path) {
    let entry = zipInstance.file(path) || zipInstance.file(path.toLowerCase());
    if (!entry) {
        const key = Object.keys(zipInstance.files).find(k => k.toLowerCase() === path.toLowerCase());
        if (key) entry = zipInstance.file(key);
    }
    if (!entry) throw "404";
    return await entry.async("uint8array");
}

async function handleReplacement(e) {
    replacementMap.set(selectedPath, new Uint8Array(await e.target.files[0].arrayBuffer()));
    startAnalysis();
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
    const config = {
        axes: {
            x: document.getElementById('mapX').value,
            y: document.getElementById('mapY').value,
            z: document.getElementById('mapZ').value
        },
        replacements: Array.from(replacementMap.keys())
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nasa_config.json"; a.click();
}