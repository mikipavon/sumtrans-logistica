import fs from 'fs';
let c = fs.readFileSync('src/App.jsx', 'utf8');

c = c.replace(
  "const url = URL.createObjectURL(blob);\n                      const [currentView, setCurrentView] = useState('dashboard')\n                      const [currentTab, setCurrentTab] = useState('directorio');\n                      const a = document.createElement('a');",
  "const url = URL.createObjectURL(blob);\n                      const a = document.createElement('a');"
);

// We need to find the correct `const [currentView, setCurrentView] = useState('dashboard')` which is near `function App() {`
c = c.replace(
  "function App() {\n  const [currentView, setCurrentView] = useState('dashboard')",
  "function App() {\n  const [currentView, setCurrentView] = useState('dashboard')\n  const [currentTab, setCurrentTab] = useState('directorio')"
);

fs.writeFileSync('src/App.jsx', c);
console.log('Fixed!');
