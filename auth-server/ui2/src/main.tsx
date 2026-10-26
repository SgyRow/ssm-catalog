import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeI18n } from "./initializeI18n";


async function start_app() {
  await initializeI18n()

  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
}

start_app()
