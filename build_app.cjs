const fs = require('fs');

const backupPath = 'backup_seguridad/src_2026-02-26_19-04/App.jsx';
const backupContent = fs.readFileSync(backupPath, 'utf8').split('\n');
const settingsStartIdx = backupContent.findIndex(line => line.includes(`currentView === 'settings'`));
let topHalf = backupContent.slice(0, settingsStartIdx).join('\n');

// Replace lucide-react imports
topHalf = topHalf.replace(
  /import \{.*?\} from 'lucide-react'/,
  `import { Download, Upload, Trash2, Database, Settings, Folder, CheckCircle, AlertCircle, Save, Clock, Shield, RotateCcw, X } from 'lucide-react'`
);

// Add supabase import
topHalf = topHalf.replace(
  /import Layout from '\.\/components\/layout\/Layout'/,
  `import Layout from './components/layout/Layout'\nimport { supabase } from './lib/supabase'`
);

// Remove Quotes import
topHalf = topHalf.replace(/import Quotes from '\.\/pages\/Quotes';\r?\n?/, '');

// Remove Quotes usage
topHalf = topHalf.replace(/\s*\{currentView === 'quotes' && <Quotes \/>\}\r?\n?/, '\n');

// We need to inject the states INSIDE function App() {
// So we find `const [isAuthenticated, setIsAuthenticated] = useState(false)` which is the first state in App()
const injectionIdx = topHalf.indexOf('const [isAuthenticated, setIsAuthenticated] = useState(false)');

const statesToInject = `
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

  const handleSelectBackupDir = async () => { alert('Función en reconstrucción'); };
  const executeBackup = async () => { alert('Función en reconstrucción'); };
  const handleCleanupDriverData = async (name) => { alert('Función en reconstrucción'); };
  const handleExportSecretsCSV = () => { alert('Función en reconstrucción'); };
  const handleDeleteSecrets = () => { alert('Función en reconstrucción'); };
  const handleCleanOrphanedFiles = () => { alert('Función en reconstrucción'); };
  const handleConfirmRestore = () => { alert('Función en reconstrucción'); };

  `;

topHalf = topHalf.slice(0, injectionIdx) + statesToInject + topHalf.slice(injectionIdx);

// Now read the original corrupted content from the user
let corruptedJSX = fs.readFileSync('corrupted.jsx', 'utf8');

// I'll manually replace the messy `))}  </div>\n</div>` with proper divs.
corruptedJSX = corruptedJSX.replace(/\}\)\}\s+<\/div>\r?\n<\/div>\r?\n/, '}))}\n              </div>\n            </div>\n          </div>\n');

// Finally, build App.jsx
const finalAppJSX = topHalf + 
  "\n      {currentView === 'settings' && (\n        <div className=\"p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500\">\n          " +
  corruptedJSX;

fs.writeFileSync('src/App.jsx', finalAppJSX);
console.log('Successfully wrote App.jsx!');
