const fs = require('fs');
const backupPath = 'backup_seguridad/src_2026-02-26_19-04/App.jsx';
const corruptedPath = 'src/App.jsx';

const backupContent = fs.readFileSync(backupPath, 'utf8').split('\n');
const corruptedContent = fs.readFileSync(corruptedPath, 'utf8');

// The backup has 401 lines before the settings view.
// Let's find the exact line in backup where settings starts
const settingsStartIdx = backupContent.findIndex(line => line.includes(`currentView === 'settings'`));

// Take everything up to that point
let newApp = backupContent.slice(0, settingsStartIdx).join('\n');

// 1. Update Lucide imports
newApp = newApp.replace(
  /import \{.*?\} from 'lucide-react'/,
  `import { Download, Upload, Trash2, Database, Settings, Folder, CheckCircle, AlertCircle, Save, Clock, Shield, RotateCcw, X } from 'lucide-react'`
);

// 2. Add supabase import
newApp = newApp.replace(
  /import Layout from '\.\/components\/layout\/Layout'/,
  `import Layout from './components/layout/Layout'\nimport { supabase } from './lib/supabase'`
);

// 3. Inject new states and functions before 'if (!isAuthenticated) {'
const injectionPoint = newApp.indexOf('if (!isAuthenticated) {');

const injectionCode = `
  const [driverAlerts, setDriverAlerts] = usePersistentState('driverAlerts', []);
  const [newAlertForm, setNewAlertForm] = useState({ title: '', message: '', icon: '🔔', dayOfWeek: undefined, timeFrom: '', timeTo: '', confirmText: '', targetDriverIds: [] });
  const [editingAlertId, setEditingAlertId] = useState(null);
  const [showNewAlertForm, setShowNewAlertForm] = useState(false);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);
  const [alertHistoryFilter, setAlertHistoryFilter] = useState('all');

  const [backupDirHandle, setBackupDirHandle] = useState(null);
  const [backupStatus, setBackupStatus] = useState('idle');
  const [autoBackupInterval, setAutoBackupInterval] = usePersistentState('autoBackupInterval', '0');
  const [lastBackupTime, setLastBackupTime] = usePersistentState('lastBackupTime', null);

  const [pendingRestoreData, setPendingRestoreData] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreOptions, setRestoreOptions] = useState({
    articles: false, clients: false, tariffs: false, drivers: false, vehicles: false, shipments: false, fuelLogs: false
  });

  const [adminCreds, setAdminCreds] = useState({ user: '', pass: '' });
  const [isGhostModeUnlocked, setIsGhostModeUnlocked] = useState(false);
  const [orphanStartDate, setOrphanStartDate] = useState('');
  const [orphanEndDate, setOrphanEndDate] = useState('');
  
  const [fuelLogs, setFuelLogs] = usePersistentState('fuelLogs', []);
  const [defaultCodFee, setDefaultCodFee] = usePersistentState('defaultCodFee', 0);
  const [familyOrder, setFamilyOrder] = usePersistentState('familyOrder', []);

  const handleSelectBackupDir = async () => { alert('Función en reconstrucción (Seleccionar Carpeta)'); };
  const executeBackup = async () => { alert('Función en reconstrucción (Auto-backup avanzado)'); };
  const handleCleanupDriverData = async (name) => { alert('Función en reconstrucción (Limpiar Miki)'); };
  const handleExportSecretsCSV = () => { alert('Función en reconstrucción (Exportar secretos)'); };
  const handleDeleteSecrets = () => { alert('Función en reconstrucción (Eliminar secretos)'); };
  const handleCleanOrphanedFiles = () => { alert('Función en reconstrucción (Limpiar huérfanos)'); };
  const handleConfirmRestore = () => { alert('Función en reconstrucción (Restaurar copia avanzada)'); };

`;

newApp = newApp.slice(0, injectionPoint) + injectionCode + newApp.slice(injectionPoint);

// 4. Append the settings start tag
newApp += '\n      {currentView === \'settings\' && (\n        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">\n';

// 5. Append the corrupted content (which is the body of settings view and the end of the file)
newApp += corruptedContent;

// 6. Write back to src/App.jsx
fs.writeFileSync('src/App.jsx', newApp);
console.log('App.jsx reconstructed successfully!');
