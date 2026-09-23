import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { calculateMetrics, cellCenterCm } from './calculations.mjs';
import { selectVisibleStitches } from './view-filters.mjs';

// La scène conserve les matériaux, l'éclairage, la caméra et les croix croisées
// du prototype. Ses unités au sol correspondent maintenant à des centimètres.
export class EmbroideryScene {
  constructor(host) {
    this.host = host;
    this.visible = false;
    this.showGrid = true;
    this.showStitches = true;
    this.presentation = 'tilt'; // perspective d'origine conservée
    this.stitchCount = 0;
    this.renderedCountsByThread = {};
    this.lastExtent = null;
    this.focusExtent = 6.5;
    this.focusX = 0;
    this.focusZ = 0;
    this.lastFrameKey = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#efede5');
    this.camera = new THREE.PerspectiveCamera(35, 1, .1, 500);
    this.camera.position.set(8, 8.5, 10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.domElement.className = 'three-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * .48;
    this.scene.add(new THREE.HemisphereLight(0xfff9ed, 0x68705c, 2));
    this.key = new THREE.DirectionalLight(0xfff5df, 3.1);
    this.key.position.set(-4, 10, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -9;
    this.key.shadow.camera.right = 9;
    this.key.shadow.camera.top = 9;
    this.key.shadow.camera.bottom = -9;
    this.key.shadow.bias = -.0003;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xdce9f1, 1.1);
    fill.position.set(7, 5, -5);
    this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#efede5', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.35;
    floor.receiveShadow = true;
    this.floor = floor;
    this.scene.add(floor);
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.setAnimationLoop(() => {
      if (!this.visible) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setVisible(visible) {
    this.visible = visible;
    this.renderer.domElement.hidden = !visible;
    if (visible) this.resize();
  }

  setGridVisible(visible) {
    this.showGrid = visible;
    if (this.gridObject) this.gridObject.visible = visible;
  }

  setStitchesVisible(visible) {
    this.showStitches = visible;
    if (this.stitchGroup) this.stitchGroup.visible = visible && this.presentation !== 'back';
    if (this.backMarkerGroup) this.backMarkerGroup.visible = visible && this.presentation === 'back';
  }

  setPresentation(view) {
    if (!['front', 'tilt', 'back'].includes(view)) throw new RangeError('Vue 3D inconnue.');
    this.presentation = view;
    this.boardGroup.rotation.x = view === 'back' ? Math.PI : 0;
    if (this.backing) this.backing.visible = view !== 'back';
    this.setStitchesVisible(this.showStitches);
    this.resetCamera();
  }

  resetCamera() {
    // Cadrage initial sur le motif et une partie des marges ; la toile entière reste
    // géométriquement exacte et accessible au dézoom, même avec des marges asymétriques.
    const scale = this.focusExtent / 6.5;
    const targetZ = this.presentation === 'back' ? -this.focusZ : this.focusZ;
    if (this.presentation === 'tilt') {
      this.camera.position.set(this.focusX + 8 * scale, 8.5 * scale, targetZ + 10 * scale);
    } else {
      this.camera.position.set(this.focusX + .002, 14 * scale, targetZ + .002);
    }
    this.controls.target.set(this.focusX, 0, targetZ);
    this.controls.minDistance = Math.max(1, this.focusExtent * .35);
    this.controls.maxDistance = Math.max(22, this.lastExtent * 5);
    this.controls.maxPolarAngle = Math.PI * .48;
    this.controls.update();
  }

  // Texture décorative de toile du prototype ; elle ne sert jamais à déduire des points.
  makeFabricTexture(widthCm, heightCm, density) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e6ddc9'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      ctx.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.12)' : 'rgba(117,100,72,.055)';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = 'rgba(129,111,83,.10)'; ctx.lineWidth = .5;
    for (let i = 0; i <= 128; i += 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // Une trame décorative suit la densité ; seule la grille de données détermine les points.
    tex.repeat.set(widthCm * density / 32, heightCm * density / 32);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  clearBoard() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const child of [...this.boardGroup.children]) {
      this.boardGroup.remove(child);
      child.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of mats) if (material) {
          materials.add(material);
          if (material.map) textures.add(material.map);
        }
      });
    }
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }

  update(project, reveal = 100, { filter = 'all', rowRange = null } = {}) {
    const metrics = calculateMetrics(project);
    this.clearBoard();
    const { canvasWidthCm: width, canvasHeightCm: height, motifWidthCm, motifHeightCm } = metrics;
    this.renderer.domElement.dataset.canvasWidthCm = String(width);
    this.renderer.domElement.dataset.canvasHeightCm = String(height);
    const density = project.fabric.stitchesPerCm;
    const cell = 1 / density;
    const originX = -width / 2 + project.fabric.marginsCm.left;
    const originZ = -height / 2 + project.fabric.marginsCm.top;

    const backing = new THREE.Mesh(new THREE.BoxGeometry(width + .30, .22, height + .30),
      new THREE.MeshStandardMaterial({ color: '#b8a98e', roughness: .78 }));
    backing.position.y = -.13;
    backing.castShadow = true; backing.receiveShadow = true;
    this.backing = backing;
    backing.visible = this.presentation !== 'back';
    this.boardGroup.add(backing);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(width, .035, height),
      new THREE.MeshStandardMaterial({ map: this.makeFabricTexture(width, height, density), color: '#f0e8d7', roughness: 1 }));
    cloth.position.y = -.005; cloth.receiveShadow = true;
    this.boardGroup.add(cloth);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#d6c9ae', roughness: .65 });
    for (const [x, z, w, d] of [
      [0, -height / 2 - .08, width + .34, .11], [0, height / 2 + .08, width + .34, .11],
      [-width / 2 - .08, 0, .11, height + .17], [width / 2 + .08, 0, .11, height + .17]
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, .12, d), frameMat);
      rail.position.set(x, -.105, z); rail.castShadow = true;
      this.boardGroup.add(rail);
    }

    const gridPositions = [];
    for (let row = 0; row <= project.heightStitches; row++) {
      const z = originZ + row * cell;
      gridPositions.push(originX, .018, z, originX + motifWidthCm, .018, z);
    }
    for (let col = 0; col <= project.widthStitches; col++) {
      const x = originX + col * cell;
      gridPositions.push(x, .018, originZ, x, .018, originZ + motifHeightCm);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: '#9d927e', transparent: true, opacity: .25 });
    this.gridObject = new THREE.LineSegments(gridGeo, gridMat);
    this.gridObject.visible = this.showGrid;
    this.boardGroup.add(this.gridObject);

    this.stitchGroup = new THREE.Group();
    this.backMarkerGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(cell * .76, .035, cell * .105);
    // Repères ponctuels au verso, une marque par cellule ; jamais un trajet de fil.
    const markerGeo = new THREE.BoxGeometry(cell * .38, .008, cell * .38);
    const colors = new Map(project.palette.map(thread => [thread.threadId, thread.color]));
    const byThread = new Map();
    const visible = selectVisibleStitches(project, { filter, rowRange, reveal });
    this.stitchCount = visible.length;
    this.renderer.domElement.dataset.stitchCount = String(this.stitchCount);
    this.renderer.domElement.dataset.realisationFilter = filter;
    this.renderer.domElement.dataset.rowRange = rowRange ? `${rowRange.start + 1}-${rowRange.end + 1}` : 'all';
    for (const { row, column, threadId } of visible) {
      const pos = cellCenterCm(project, row, column);
      const x = -width / 2 + pos.x, z = -height / 2 + pos.y;
      if (!byThread.has(threadId)) byThread.set(threadId, []);
      byThread.get(threadId).push({ x, z, rot: Math.PI / 4 }, { x, z, rot: -Math.PI / 4 });
    }
    for (const [threadId, items] of byThread) {
      const mesh = new THREE.InstancedMesh(boxGeo,
        new THREE.MeshStandardMaterial({ color: colors.get(threadId), roughness: .58, metalness: .02 }), items.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const dummy = new THREE.Object3D();
      items.forEach((pos, i) => {
        dummy.position.set(pos.x, .045, pos.z);
        dummy.rotation.set(0, pos.rot, 0);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.stitchGroup.add(mesh);
      const markers = new THREE.InstancedMesh(markerGeo,
        new THREE.MeshStandardMaterial({ color: colors.get(threadId), roughness: .86 }), items.length / 2);
      items.forEach((pos, i) => {
        if (i % 2) return;
        dummy.position.set(pos.x, -.049, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); markers.setMatrixAt(i / 2, dummy.matrix);
      });
      markers.instanceMatrix.needsUpdate = true;
      this.backMarkerGroup.add(markers);
    }
    if (!byThread.size) { boxGeo.dispose(); markerGeo.dispose(); }
    this.renderedCountsByThread = Object.fromEntries([...byThread].map(([id, bars]) => [id, bars.length / 2]));
    this.stitchGroup.visible = this.showStitches && this.presentation !== 'back';
    this.backMarkerGroup.visible = this.showStitches && this.presentation === 'back';
    this.boardGroup.add(this.stitchGroup, this.backMarkerGroup);
    this.boardGroup.rotation.x = this.presentation === 'back' ? Math.PI : 0;
    this.boardGroup.rotation.y = 0;
    this.renderer.domElement.dataset.rearRepresentation = 'illustrative-positions';
    const extent = Math.max(width, height);
    this.camera.far = Math.max(100, extent * 12);
    this.camera.updateProjectionMatrix();
    const floorScale = Math.max(1, extent * 3 / 200);
    this.floor.scale.set(floorScale, floorScale, 1);
    const focusX = originX + motifWidthCm / 2, focusZ = originZ + motifHeightCm / 2;
    const frameKey = [width, height, motifWidthCm, motifHeightCm, focusX, focusZ].join(':');
    if (this.lastFrameKey !== frameKey) {
      this.lastFrameKey = frameKey;
      this.lastExtent = extent;
      this.focusX = focusX; this.focusZ = focusZ;
      this.focusExtent = Math.max(motifWidthCm, motifHeightCm) +
        Math.min(4, ((width - motifWidthCm) + (height - motifHeightCm)) / 2);
      const shadowSize = Math.max(9, extent * 1.4);
      this.key.shadow.camera.left = this.key.shadow.camera.bottom = -shadowSize;
      this.key.shadow.camera.right = this.key.shadow.camera.top = shadowSize;
      this.key.shadow.camera.updateProjectionMatrix();
      this.resetCamera();
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.clearBoard();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
