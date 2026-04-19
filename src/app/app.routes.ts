import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'pages/viewer',
    loadComponent: () => import('./pages/viewer/viewer.page').then(m => m.ViewerPage)
  },
  {
    path: 'pages/export',
    loadComponent: () => import('./pages/export/export.page').then(m => m.ExportPage)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
