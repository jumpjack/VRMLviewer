/*
==========================================================================
BUILD: 1.1.7
DATA: 2026-01-22
MODIFICHE:
- Build 1.1.7: Aggiunto Fallback di Rete. Se un file non è nello ZIP,
               lo cerca via fetch sul server.
==========================================================================
*/

let zipInstance = null;
let replacementMap = new Map();

async function handleFileUpload() {
    const file = document.getElementById("fileZipLoc").files[0];
    if (!file) return;
    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();

    if (ext === 'zip') zipInstance = await JSZip.loadAsync(file);
    else if (ext === 'wrl' || ext === 'wrz') {
        zipInstance = new JSZip();
        zipInstance.file(fileName, file);
    }
    const dropdown = document.getElementById("rootSelect");
    dropdown.innerHTML = "";
    Object.keys(zipInstance.files).filter(f => {
        const low = f.toLowerCase();
        return low.endsWith('.wrl') || low.endsWith('.wrz');
    }).sort().forEach(f => dropdown.appendChild(new Option(f, f)));

    document.getElementById("root-selection-area").style.display = "block";
    autoDetectVersion();
}

async function getZipData(path) {
    // 1. Cerca nella mappa sostituzioni
    if (replacementMap.has(path)) return replacementMap.get(path);

    // 2. Cerca nello ZIP
    if (zipInstance) {
        let entry = zipInstance.file(path) || zipInstance.file(path.toLowerCase());
        if (!entry) {
            const key = Object.keys(zipInstance.files).find(k => k.toLowerCase() === path.toLowerCase());
            if (key) entry = zipInstance.file(key);
        }
        if (entry) return await entry.async("uint8array");
    }

    // 3. FALLBACK DI RETE: Cerca sul server (importante per restauro pagine vecchie)
    console.log(`🌐 File non nello ZIP, provo il fetch: ${path}`);
    try {
        const response = await fetch(path);
        if (response.ok) {
            const ab = await response.arrayBuffer();
            return new Uint8Array(ab);
        }
    } catch (e) {
        console.error(`❌ Fallimento fetch per: ${path}`);
    }

    throw "404 Not Found";
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