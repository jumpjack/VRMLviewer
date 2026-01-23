/*
==========================================================================
BUILD: 1.1.9
DATA: 2026-01-22
DESCRIZIONE: NASA VRML Ultimate Explorer - 3D Scene Module
MODIFICHE:
- Build 1.1.9: Ripristinato sfondo chiaro, griglia e assi visibili.
==========================================================================
*/


let engine, scene, camera, rootNode, ground, axesLines = [];

const initScene = () => {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return;

    engine = new BABYLON.Engine(canvas, true);
    scene = new BABYLON.Scene(engine);

    // SFONDO CHIARO
    scene.clearColor = new BABYLON.Color4(0.9, 0.9, 0.95, 1);

    camera = new BABYLON.ArcRotateCamera("cam", -Math.PI/2, Math.PI/3, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 1.0;

    rootNode = new BABYLON.TransformNode("root", scene);

    // GRIGLIA
    const gridMat = new BABYLON.GridMaterial("gridMat", scene);
    gridMat.opacity = 0.5;
    gridMat.mainColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ground = BABYLON.MeshBuilder.CreateGround("groundGrid", {width: 1000, height: 1000}, scene);
    ground.material = gridMat;
    ground.isPickable = false;

    createThinAxes();

    scene.onPointerObservable.add((info) => {
        if (info.type === BABYLON.PointerEventTypes.POINTERDOUBLETAP) {
            const pick = scene.pick(scene.pointerX, scene.pointerY);
            if (pick.hit) camera.setTarget(pick.pickedPoint);
        }
    });

    engine.runRenderLoop(() => scene.render());
};

function createThinAxes() {
    const size = 100;
    const x = BABYLON.MeshBuilder.CreateLines("axisX", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(size,0,0)], colors: [new BABYLON.Color4(1,0,0,1), new BABYLON.Color4(1,0,0,1)]}, scene);
    const y = BABYLON.MeshBuilder.CreateLines("axisY", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,size,0)], colors: [new BABYLON.Color4(0,1,0,1), new BABYLON.Color4(0,1,0,1)]}, scene);
    const z = BABYLON.MeshBuilder.CreateLines("axisZ", {points: [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,0,size)], colors: [new BABYLON.Color4(0,0,1,1), new BABYLON.Color4(0,0,1,1)]}, scene);
    axesLines = [x, y, z];
}

function focusCamera() {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity), has = false;
    processedPaths.forEach(n => {
        n.getChildMeshes().forEach(m => {
            const b = m.getBoundingInfo().boundingBox;
            min = BABYLON.Vector3.Minimize(min, b.minimumWorld);
            max = BABYLON.Vector3.Maximize(max, b.maximumWorld);
            has = true;
        });
    });
    if(has) {
        const center = BABYLON.Vector3.Center(min, max);
        camera.setTarget(center);
        camera.radius = BABYLON.Vector3.Distance(min, max) * 2;
        console.log(`🎥 Camera puntata su ${center.toString()} con raggio ${camera.radius}`);
    } else {
        console.warn("🎥 Impossibile puntare la camera: nessuna mesh trovata nella scena.");
    }
}

function rotateRoot(axis) {
    const angle = Math.PI / 2;
    if (!rootNode.rotationQuaternion) rootNode.rotationQuaternion = BABYLON.Quaternion.Identity();
    let rot = (axis==='x') ? BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, angle) : (axis==='y') ? BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, angle) : BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, angle);
    rootNode.rotationQuaternion = rot.multiply(rootNode.rotationQuaternion);
}


async function exportTiledMarsMap() {
    if (!rootNode) return alert("Modello non caricato.");

    // --- 1. PARAMETRI DI RISOLUZIONE ---
    const tilesPerSide = 8;        // 4x4 = 16 scatti
    const tileSize = 2048;         // Ogni tile è 2048px (corretto da 256)
    const totalRes = tilesPerSide * tileSize;

    // --- 2. SALVATAGGIO STATO E FORCE RESIZE ---
    const oldWidth = engine.getRenderWidth();
    const oldHeight = engine.getRenderHeight();
    const oldClearColor = scene.clearColor.clone();
    const oldPosition = camera.position.clone();
    const oldTarget = camera.target.clone();
    const oldMode = camera.mode;
    const oldAlpha = camera.alpha;
    const oldBeta = camera.beta;

    // Forziamo l'engine a essere un quadrato perfetto grande quanto il tile
    engine.setSize(tileSize, tileSize);

    scene.clearColor = new BABYLON.Color4(0.61, 0.27, 0.15, 1.0); // Rosso Marte
    ground.setEnabled(false);
    if (axesLines.length > 0) axesLines.forEach(l => l.setEnabled(false));

    // --- 3. CALCOLO BOUNDING BOX REALE ---
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

    scene.meshes.forEach(m => {
        if (m.name !== "groundGrid" && m.isEnabled() && m.getBoundingInfo) {
            const b = m.getBoundingInfo().boundingBox;
            min = BABYLON.Vector3.Minimize(min, b.minimumWorld);
            max = BABYLON.Vector3.Maximize(max, b.maximumWorld);
        }
    });

    // Aggiungi un piccolo margine per sicurezza
    const margin = 20;//Math.max((max.x - min.x), (max.z - min.z)) * 0.02;
    min.x -= margin;
    min.z -= margin;
    max.x += margin;
    max.z += margin;

    // Dimensioni esatte del mondo da coprire
    const worldWidth = max.x - min.x;
    const worldDepth = max.z - min.z;
    const stepX = worldWidth / tilesPerSide;
    const stepZ = worldDepth / tilesPerSide;

    // --- 4. PREPARAZIONE CANVAS E CAMERA ---
    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = totalRes;
    masterCanvas.height = totalRes;
    const ctx = masterCanvas.getContext('2d');

    // Configura camera ORTOGRAFICA per vista dall'alto
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

    // Posizione camera sopra il modello (vista dall'alto)
    const cameraHeight = max.y + Math.max(worldWidth, worldDepth) * 2;
    camera.position = new BABYLON.Vector3(
        (min.x + max.x) / 2,
        cameraHeight,
        (min.z + max.z) / 2
    );

    // Punto direttamente verso il basso
    camera.setTarget(new BABYLON.Vector3(
        (min.x + max.x) / 2,
        0,
        (min.z + max.z) / 2
    ));

    // Lock gli angoli per vista dall'alto pura
    camera.alpha = 0;
    camera.beta = Math.PI / 2; // 90 gradi, guarda direttamente verso il basso
    camera.orthoTop = stepZ / 2;
    camera.orthoBottom = -stepZ / 2;
    camera.orthoLeft = -stepX / 2;
    camera.orthoRight = stepX / 2;
    camera.fov = 0.8; // Fisso per ortografica

    console.log("Inizio stitching ad alta precisione...");
    console.log(`World bounds: X[${min.x.toFixed(2)}, ${max.x.toFixed(2)}], Z[${min.z.toFixed(2)}, ${max.z.toFixed(2)}]`);
    console.log(`Step size: X=${stepX.toFixed(2)}, Z=${stepZ.toFixed(2)}`);

    // --- 5. CICLO DI CATTURA ---
    for (let row = 0; row <= tilesPerSide; row++) {
        for (let col = 0; col < tilesPerSide; col++) {
            // Calcolo centro del tile nel mondo 3D
            const centerX = min.x + (col * stepX) ;
            const centerZ = min.z + (row * stepZ) + (stepZ / 2);

            // Posiziona camera sopra il centro del tile
            camera.position = new BABYLON.Vector3(centerX, cameraHeight, centerZ);
            camera.setTarget(new BABYLON.Vector3(centerX, 0, centerZ));

            // IMPORTANTE: Aspetta un frame per aggiornare la camera
            await new Promise(resolve => setTimeout(resolve, 50));

            // Forza il rendering con i nuovi parametri
            scene.render();

            // Cattura screenshot
            const tileData = await new Promise(resolve => {
                BABYLON.Tools.CreateScreenshot(
                    engine,
                    camera,
                    {
                        width: tileSize,
                        height: tileSize,
                        precision: 1.0 // Massima qualità
                    },
                    (data) => resolve(data)
                );
            });

            // Disegno sul canvas master (inverti l'ordine delle righe se necessario)
            const img = await new Promise(resolve => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.src = tileData;
            });

            // Se vuoi che il tile (0,0) sia in alto a sinistra:
            ctx.drawImage(img, (tilesPerSide-col) * tileSize, row * tileSize, tileSize, tileSize);

            // Se vuoi che il tile (0,0) sia in basso a sinistra (come in coordinate 3D):
            // ctx.drawImage(img, col * tileSize, (tilesPerSide - 1 - row) * tileSize, tileSize, tileSize);

            console.log(`Tile [${row}, ${col}] processato. Centro: X=${centerX.toFixed(2)}, Z=${centerZ.toFixed(2)}`);
        }
    }

    // --- 6. DOWNLOAD E RIPRISTINO ---
    const link = document.createElement('a');
    link.download = `Mars_MegaTexture_${totalRes}x${totalRes}.png`;
    link.href = masterCanvas.toDataURL("image/png");
    link.click();

    // Ripristiniamo tutto allo stato originale
    engine.setSize(oldWidth, oldHeight);
    scene.clearColor = oldClearColor;
    camera.mode = oldMode;
    camera.position = oldPosition;
    camera.setTarget(oldTarget);
    camera.alpha = oldAlpha;
    camera.beta = oldBeta;
    ground.setEnabled(true);
    if (axesLines.length > 0) axesLines.forEach(l => l.setEnabled(true));

    console.log("Mappa completata!");
    alert(`Mappa Hires completata! Risoluzione: ${totalRes}x${totalRes}px`);
}
// Inizializza automaticamente solo se il canvas è già presente,
// altrimenti aspetta che la pagina sia carica.
if (document.getElementById("renderCanvas")) initScene();
else window.addEventListener('DOMContentLoaded', initScene);