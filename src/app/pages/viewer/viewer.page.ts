import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshData, ModelStatistics, GenerationSettings } from '../../models/mesh-data.model';
import { ModelGeneratorService } from '../../services/model-generator.service';
import { ImageProcessorService } from '../../services/image-processor.service';
import { SharedDataService } from '../../services/shared-data.service';

@Component({
    selector: 'app-viewer',
    templateUrl: './viewer.page.html',
    styleUrls: ['./viewer.page.scss'],
    standalone: true,
    imports: [IonicModule, CommonModule, FormsModule]
})
export class ViewerPage {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    private mesh!: THREE.Mesh;
    private animationId: number = 0;

    meshData: MeshData | null = null;
    statistics: ModelStatistics | null = null;
    showWireframe = false;
    showGrid = true;
    autoRotate = true;
    lightingIntensity = 1.0;
    depthIntensity = 1.0;
    maskThreshold = 0.1;
    invertDepth = false;
    isPanelCollapsed = false;
    isStatsCollapsed = false;
    private originalPositions: Float32Array | null = null;
    originalImageSrc: string | null = null;

    constructor(
        private router: Router,
        private modelGenerator: ModelGeneratorService,
        private imageProcessor: ImageProcessorService,
        private sharedData: SharedDataService
    ) { }

    ionViewWillEnter() {
        // Get mesh data and original image from shared service
        this.meshData = this.sharedData.getMeshData();
        this.originalImageSrc = this.sharedData.getOriginalImage();

        if (this.meshData) {
            this.statistics = this.modelGenerator.getModelStatistics(this.meshData);
        } else {
            // If no mesh data, redirect to home
            this.router.navigate(['/home']);
        }
    }

    ionViewDidEnter() {
        if (this.meshData) {
            // Small delay to ensure layout is finished and dimensions are correct
            setTimeout(() => {
                this.initThreeJS();
            }, 100);
        }
    }

    ionViewWillLeave() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
        }
        if (this.controls) {
            this.controls.dispose();
        }
        if (this.scene) {
            this.scene.clear();
        }
    }

    private initThreeJS() {
        if (!this.meshData || !this.canvasRef) return;

        const canvas = this.canvasRef.nativeElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 0, 1.5);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Controls
        this.controls = new OrbitControls(this.camera, canvas);
        (this.controls as any).domElement = canvas;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 10;
        this.controls.autoRotate = this.autoRotate;
        this.controls.autoRotateSpeed = 2.0;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, this.lightingIntensity);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight2.position.set(-5, -5, -5);
        this.scene.add(directionalLight2);

        // Grid
        if (this.showGrid) {
            const gridHelper = new THREE.GridHelper(2, 20, 0x444444, 0x222222);
            this.scene.add(gridHelper);
        }

        // Add mesh
        this.mesh = this.modelGenerator.createMeshObject(this.meshData);
        this.scene.add(this.mesh);

        // Store original positions for live depth adjustment
        const positions = this.mesh.geometry.attributes['position'].array as Float32Array;
        this.originalPositions = new Float32Array(positions);

        // Center mesh
        const box = new THREE.Box3().setFromObject(this.mesh);
        const center = box.getCenter(new THREE.Vector3());
        this.mesh.position.sub(center);

        // Start animation
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    private onWindowResize() {
        if (!this.canvasRef) return;

        const canvas = this.canvasRef.nativeElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    toggleWireframe() {
        this.showWireframe = !this.showWireframe;
        if (this.mesh && this.mesh.material instanceof THREE.MeshStandardMaterial) {
            this.mesh.material.wireframe = this.showWireframe;
        }
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        const grid = this.scene.children.find(child => child instanceof THREE.GridHelper);
        if (grid) {
            grid.visible = this.showGrid;
        }
    }

    toggleAutoRotate() {
        if (this.controls) {
            this.controls.autoRotate = this.autoRotate;
        }
    }

    togglePanel() {
        this.isPanelCollapsed = !this.isPanelCollapsed;
        // Trigger resize to fix canvas layout
        setTimeout(() => this.onWindowResize(), 300);
    }

    toggleStats() {
        this.isStatsCollapsed = !this.isStatsCollapsed;
    }

    updateLighting() {
        const lights = this.scene.children.filter(child => child instanceof THREE.DirectionalLight);
        lights.forEach((light, index) => {
            if (light instanceof THREE.DirectionalLight && index === 0) {
                light.intensity = this.lightingIntensity;
            }
        });
    }

    updateDepth() {
        if (!this.mesh || !this.originalPositions) return;

        const geometry = this.mesh.geometry;
        const positions = geometry.attributes['position'].array as Float32Array;

        for (let i = 0; i < this.originalPositions.length; i += 3) {
            positions[i + 2] = this.originalPositions[i + 2] * this.depthIntensity;
        }

        geometry.attributes['position'].needsUpdate = true;
        geometry.computeVertexNormals();
    }

    async updateReconstruction() {
        if (!this.originalImageSrc) return;

        try {
            // Load image
            const imageElement = await this.imageProcessor.loadImage(this.originalImageSrc);

            // Generate new depth map with updated settings
            const depthMap = await this.imageProcessor.generateDepthMap(
                imageElement,
                this.maskThreshold,
                this.invertDepth
            );

            // Generate new mesh
            const settings: GenerationSettings = {
                depthScale: 0.3,
                smoothing: true,
                subdivisions: 1,
                generateNormals: true
            };

            const texture = this.meshData?.texture;
            if (!texture) return;

            const newMeshData = await this.modelGenerator.generateMeshFromDepth(depthMap, texture, settings);

            // Clear current scene and re-init with new mesh
            this.meshData = newMeshData;
            this.statistics = this.modelGenerator.getModelStatistics(this.meshData);

            if (this.scene) {
                this.scene.remove(this.mesh);
                this.mesh = this.modelGenerator.createMeshObject(this.meshData);
                this.scene.add(this.mesh);

                // Reset positions and apply depth intensity
                const positions = this.mesh.geometry.attributes['position'].array as Float32Array;
                this.originalPositions = new Float32Array(positions);
                this.updateDepth();

                // Re-center
                const box = new THREE.Box3().setFromObject(this.mesh);
                const center = box.getCenter(new THREE.Vector3());
                this.mesh.position.sub(center);
            }
        } catch (error) {
            console.error('Error updating reconstruction:', error);
        }
    }

    resetCamera() {
        this.camera.position.set(0, 0, 1.5);
        this.controls.reset();
    }

    goToExport() {
        if (this.meshData) {
            this.sharedData.setMeshData(this.meshData);
            this.router.navigate(['/pages/export']);
        }
    }

    goBack() {
        this.router.navigate(['/home']);
    }
}
