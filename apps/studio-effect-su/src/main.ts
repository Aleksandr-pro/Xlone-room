import './styles/app.css';
import { mountApp } from './ui/appShell';

const root = document.getElementById('app');
if (root) {
  mountApp(root);
}
