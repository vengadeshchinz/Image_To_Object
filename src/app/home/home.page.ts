import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ImageProcessorService } from '../services/image-processor.service';
import { ModelGeneratorService } from '../services/model-generator.service';
import { StorageService } from '../services/storage.service';
import { SharedDataService } from '../services/shared-data.service';
import {
  ProcessingStatus, ProcessingProgress, ImageUpload,
  MeshData, GenerationSettings, ModelStatistics
} from '../models/mesh-data.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class HomePage implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // Upload state
  uploadedImage: ImageUpload | null = null;
  processingProgress: ProcessingProgress = {
    status: ProcessingStatus.IDLE,
    progress: 0,
    message: ''
  };
  generatedMesh: MeshData | null = null;
  recentProjects: any[] = [];

  // Viewer state
  showViewer = false;
  statistics: ModelStatistics | null = null;
  showWireframe = false;
  showGrid = true;
  autoRotate = true;
  lightingIntensity = 1.0;
  depthIntensity = 1.0;
  maskThreshold = 0.1;
  invertDepth = false;

  // Panel toggles
  isLeftPanelCollapsed = false;
  isRightPanelCollapsed = false;

  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private mesh!: THREE.Mesh;
  private animationId = 0;
  private originalPositions: Float32Array | null = null;
  private resizeListener?: () => void;

  constructor(
    private router: Router,
    private imageProcessor: ImageProcessorService,
    private modelGenerator: ModelGeneratorService,
    private storage: StorageService,
    private sharedData: SharedDataService
  ) {
    this.loadRecentProjects();
  }

  ngOnDestroy() {
    this.disposeViewer();
  }

  // ─── Recent Projects ──────────────────────────────────────────────────────

  loadRecentProjects() {
    this.recentProjects = this.storage.getAllProjects()
      .slice(0, 4); // Show up to 4 recent projects
  }

  async openProject(project: any) {
    if (project.imagePreview) {
      if (this.showViewer) {
        this.disposeViewer();
        this.showViewer = false;
      }

      this.uploadedImage = {
        preview: project.imagePreview,
        file: { name: project.name } as any,
        width: 0,
        height: 0,
        size: 0
      };

      this.processingProgress = {
        status: ProcessingStatus.PROCESSING_IMAGE,
        progress: 10,
        message: 'Loading project...'
      };

      await this.processImage();
    }
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset viewer if re-uploading
    if (this.showViewer) {
      this.disposeViewer();
      this.showViewer = false;
    }

    try {
      this.processingProgress = {
        status: ProcessingStatus.UPLOADING,
        progress: 10,
        message: 'Uploading image...'
      };

      this.uploadedImage = await this.imageProcessor.uploadImage(file);

      this.processingProgress = {
        status: ProcessingStatus.PROCESSING_IMAGE,
        progress: 20,
        message: 'Processing image...'
      };

      await this.processImage();
    } catch (error) {
      console.error('Error processing file:', error);
      this.processingProgress = {
        status: ProcessingStatus.ERROR,
        progress: 0,
        message: 'Failed to process image',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processImage() {
    if (!this.uploadedImage) return;

    try {
      this.processingProgress = {
        status: ProcessingStatus.GENERATING_DEPTH,
        progress: 30,
        message: 'Generating depth map...'
      };

      const imageElement = await this.imageProcessor.loadImage(this.uploadedImage.preview);
      const depthMap = await this.imageProcessor.generateDepthMap(imageElement);

      this.processingProgress = {
        status: ProcessingStatus.CREATING_MESH,
        progress: 60,
        message: 'Creating 3D mesh...'
      };

      const texture = await this.imageProcessor.extractTexture(imageElement);

      const settings: GenerationSettings = {
        depthScale: 0.3,
        smoothing: true,
        subdivisions: 1,
        generateNormals: true
      };

      this.generatedMesh = await this.modelGenerator.generateMeshFromDepth(depthMap, texture, settings);

      this.processingProgress = {
        status: ProcessingStatus.COMPLETE,
        progress: 100,
        message: '3D model ready!'
      };

      // Save project with meshData
      const projectId = this.storage.generateProjectId();
      this.storage.saveProject({
        id: projectId,
        name: this.uploadedImage.file.name,
        timestamp: Date.now(),
        imagePreview: this.uploadedImage.preview,
        meshData: this.generatedMesh
      });
      this.loadRecentProjects();

    } catch (error) {
      console.error('Error processing image:', error);
      this.processingProgress = {
        status: ProcessingStatus.ERROR,
        progress: 0,
        message: 'Failed to create 3D model',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ─── 3D Preview ───────────────────────────────────────────────────────────

  previewModel() {
    if (!this.generatedMesh) return;
    // Tear down any existing Three.js instance first
    this.disposeViewer();
    this.showViewer = false;
    this.statistics = this.modelGenerator.getModelStatistics(this.generatedMesh);
    // Let Angular render, then show canvas and init
    setTimeout(() => {
      this.showViewer = true;
      setTimeout(() => this.initThreeJS(), 100);
    }, 50);
  }

  private initThreeJS() {
    if (!this.generatedMesh || !this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0c);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 1.5);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.1; // Allowed closer zoom
    this.controls.maxDistance = 15;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 2.0;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, this.lightingIntensity);
    dirLight.position.set(5, 5, 5);
    this.scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-5, -5, -5);
    this.scene.add(dirLight2);

    if (this.showGrid) {
      this.scene.add(new THREE.GridHelper(2, 20, 0x444444, 0x222222));
    }

    this.mesh = this.modelGenerator.createMeshObject(this.generatedMesh);
    this.scene.add(this.mesh);

    const positions = this.mesh.geometry.attributes['position'].array as Float32Array;
    this.originalPositions = new Float32Array(positions);

    const box = new THREE.Box3().setFromObject(this.mesh);
    this.mesh.position.sub(box.getCenter(new THREE.Vector3()));

    this.animate();

    this.resizeListener = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeListener);
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private onWindowResize() {
    if (!this.canvasRef || !this.renderer || !this.camera) return;
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private disposeViewer() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); }
    if (this.controls) this.controls.dispose();
    if (this.scene) this.scene.clear();
  }

  // ─── Viewer Controls ──────────────────────────────────────────────────────

  toggleWireframe() {
    this.showWireframe = !this.showWireframe;
    if (this.mesh?.material instanceof THREE.MeshStandardMaterial) {
      this.mesh.material.wireframe = this.showWireframe;
    }
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    const grid = this.scene?.children.find(c => c instanceof THREE.GridHelper);
    if (grid) grid.visible = this.showGrid;
  }

  toggleAutoRotate() {
    if (this.controls) this.controls.autoRotate = this.autoRotate;
  }

  updateLighting() {
    this.scene?.children
      .filter((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight)
      .forEach((l, i) => { if (i === 0) l.intensity = this.lightingIntensity; });
  }

  updateDepth() {
    if (!this.mesh || !this.originalPositions) return;
    const positions = this.mesh.geometry.attributes['position'].array as Float32Array;
    for (let i = 0; i < this.originalPositions.length; i += 3) {
      positions[i + 2] = this.originalPositions[i + 2] * this.depthIntensity;
    }
    this.mesh.geometry.attributes['position'].needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  async updateReconstruction() {
    if (!this.uploadedImage?.preview) return;
    try {
      const imageElement = await this.imageProcessor.loadImage(this.uploadedImage.preview);
      const depthMap = await this.imageProcessor.generateDepthMap(imageElement, this.maskThreshold, this.invertDepth);
      const settings: GenerationSettings = { depthScale: 0.3, smoothing: true, subdivisions: 1, generateNormals: true };
      const texture = this.generatedMesh?.texture;
      if (!texture) return;
      const newMesh = await this.modelGenerator.generateMeshFromDepth(depthMap, texture, settings);
      this.generatedMesh = newMesh;
      this.statistics = this.modelGenerator.getModelStatistics(newMesh);
      if (this.scene) {
        this.scene.remove(this.mesh);
        this.mesh = this.modelGenerator.createMeshObject(newMesh);
        this.scene.add(this.mesh);
        const positions = this.mesh.geometry.attributes['position'].array as Float32Array;
        this.originalPositions = new Float32Array(positions);
        this.updateDepth();
        const box = new THREE.Box3().setFromObject(this.mesh);
        this.mesh.position.sub(box.getCenter(new THREE.Vector3()));
      }
    } catch (e) {
      console.error('Error updating reconstruction:', e);
    }
  }

  resetCamera() {
    this.camera?.position.set(0, 0, 1.5);
    this.controls?.reset();
  }

  goToExport() {
    if (this.generatedMesh) {
      this.sharedData.setMeshData(this.generatedMesh);
      this.sharedData.setOriginalImage(this.uploadedImage?.preview ?? null);
      this.router.navigate(['/pages/export']);
    }
  }

  // ─── Panel Toggles ────────────────────────────────────────────────────────

  toggleLeftPanel() {
    this.isLeftPanelCollapsed = !this.isLeftPanelCollapsed;
    setTimeout(() => this.onWindowResize(), 320);
  }

  toggleRightPanel() {
    this.isRightPanelCollapsed = !this.isRightPanelCollapsed;
    setTimeout(() => this.onWindowResize(), 320);
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  reset() {
    this.disposeViewer();
    this.showViewer = false;
    this.uploadedImage = null;
    this.generatedMesh = null;
    this.statistics = null;
    this.processingProgress = { status: ProcessingStatus.IDLE, progress: 0, message: '' };
  }

  get isProcessing(): boolean {
    return this.processingProgress.status !== ProcessingStatus.IDLE &&
      this.processingProgress.status !== ProcessingStatus.COMPLETE &&
      this.processingProgress.status !== ProcessingStatus.ERROR;
  }

  get isComplete(): boolean {
    return this.processingProgress.status === ProcessingStatus.COMPLETE;
  }

  get hasError(): boolean {
    return this.processingProgress.status === ProcessingStatus.ERROR;
  }
}
