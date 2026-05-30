import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'popup',
    pathMatch: 'full'
  },
  {
    path: 'popup',
    loadComponent: () => import('./popup/popup.component').then(m => m.PopupComponent)
  },
  {
    path: 'options',
    loadComponent: () => import('./options/options.component').then(m => m.OptionsComponent)
  },
  {
    path: '**',
    redirectTo: 'popup'
  }
];