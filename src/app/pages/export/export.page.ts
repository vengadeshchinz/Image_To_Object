import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { ExportService } from '../../services/export.service';
import { MeshData, ExportOptions, ExportFormat, ExportQuality } from '../../models/mesh-data.model';
import { SharedDataService } from '../../services/shared-data.service';

@Component({
    selector: 'app-export',
    templateUrl: './export.page.html',
    styleUrls: ['./export.page.scss'],
    standalone: true,
    imports: [IonicModule, CommonModule, FormsModule]
})
export class ExportPage implements OnInit {
    meshData: MeshData | null = null;

    exportOptions: ExportOptions = {
        format: ExportFormat.GLTF,
        quality: ExportQuality.HIGH,
        includeTextures: true,
        textureResolution: 2048,
        compress: false,
        fileName: 'model',
        binary: false
    };

    formats = [
        { value: ExportFormat.GLTF, label: 'glTF (.gltf)', icon: 'cube-outline', description: 'Industry standard, best for web' },
        { value: ExportFormat.GLB, label: 'GLB (.glb)', icon: 'cube', description: 'Binary glTF, single file' },
        { value: ExportFormat.BABYLON, label: 'Babylon.js (.babylon)', icon: 'planet-outline', description: 'Native Babylon.js format' },
        { value: ExportFormat.OBJ, label: 'OBJ (.obj)', icon: 'shapes-outline', description: 'Universal format' },
        { value: ExportFormat.STL, label: 'STL (.stl)', icon: 'print-outline', description: 'For 3D printing' },
        { value: ExportFormat.FBX, label: 'FBX (.fbx)', icon: 'game-controller-outline', description: 'For game engines' }
    ];

    qualities = [
        { value: ExportQuality.LOW, label: 'Low', description: 'Smaller file size' },
        { value: ExportQuality.MEDIUM, label: 'Medium', description: 'Balanced' },
        { value: ExportQuality.HIGH, label: 'High', description: 'Best quality' },
        { value: ExportQuality.ULTRA, label: 'Ultra', description: 'Maximum detail' }
    ];

    textureResolutions = [512, 1024, 2048, 4096];

    isExporting = false;
    exportProgress = 0;

    constructor(
        private router: Router,
        private exportService: ExportService,
        private sharedData: SharedDataService
    ) { }

    ngOnInit() {
        // Get mesh data from shared service
        this.meshData = this.sharedData.getMeshData();
        if (!this.meshData) {
            // If no mesh data, redirect to home
            this.router.navigate(['/home']);
        }
    }

    async exportModel() {
        if (!this.meshData) return;

        this.isExporting = true;
        this.exportProgress = 0;

        try {
            // Simulate progress
            const progressInterval = setInterval(() => {
                if (this.exportProgress < 90) {
                    this.exportProgress += 10;
                }
            }, 200);

            await this.exportService.exportMesh(this.meshData, this.exportOptions);

            clearInterval(progressInterval);
            this.exportProgress = 100;

            setTimeout(() => {
                this.isExporting = false;
                this.exportProgress = 0;
            }, 1000);
        } catch (error) {
            console.error('Export error:', error);
            this.isExporting = false;
            this.exportProgress = 0;
            alert('Export failed. Please try again.');
        }
    }

    goBack() {
        // Mesh data is already in shared service
        this.router.navigate(['/pages/viewer']);
    }

    getFormatInfo(format: ExportFormat) {
        return this.formats.find(f => f.value === format);
    }
}
