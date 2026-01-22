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
    camera.wheelPrecision = 50;

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


// Inizializza automaticamente solo se il canvas è già presente,
// altrimenti aspetta che la pagina sia carica.
if (document.getElementById("renderCanvas")) initScene();
else window.addEventListener('DOMContentLoaded', initScene);