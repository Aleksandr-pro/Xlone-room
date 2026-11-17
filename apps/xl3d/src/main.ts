import './styles/xl3d.css';
import { mountXL3DApp } from './ui/appShell';

const root = document.getElementById('app');
if (root) {
  mountXL3DApp(root);
}
