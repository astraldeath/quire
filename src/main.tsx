import { createRoot } from 'react-dom/client';
import { HostedApp } from './features/server/HostedApp';
import { App } from './App';
import './styles.css';
import { installViewport } from './viewport';
import { DesktopTitlebar } from './features/desktop/DesktopTitlebar';
installViewport();
createRoot(document.getElementById('root')!).render(
  import.meta.env.VITE_HOSTED === 'true' ? (
    <HostedApp />
  ) : (
    <>
      <DesktopTitlebar />
      <App />
    </>
  ),
);
