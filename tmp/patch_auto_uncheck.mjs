import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const targetChange = `    const handleClientNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, clientName: value, selectedClientBillingType: null }));
        updateSuggestions(value);
    };`;

const replaceChange = `    const handleClientNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, clientName: value, selectedClientBillingType: null }));
        updateSuggestions(value);
        if (keepOrigin) setKeepOrigin(false); // Auto-disable multiple shipment when typing a new sender
    };`;

const targetSelect = `    const selectClient = (client) => {
        setFormData(prev => ({
            ...prev,
            clientName: client.name,`;

const replaceSelect = `    const selectClient = (client) => {
        if (keepOrigin) setKeepOrigin(false); // Auto-disable multiple shipment when selecting a new sender
        setFormData(prev => ({
            ...prev,
            clientName: client.name,`;

let patched = false;
content = content.replace(targetChange, replaceChange);
content = content.replace(targetSelect, replaceSelect);

const normC = content.replace(/\r\n/g, '\n');
const normTc = targetChange.replace(/\r\n/g, '\n');
const normTs = targetSelect.replace(/\r\n/g, '\n');

if (normC.includes(normTc)) {
    content = normC.replace(normTc, replaceChange.replace(/\r\n/g, '\n'));
    patched = true;
}
if (content.includes(normTs)) {
    content = content.replace(normTs, replaceSelect.replace(/\r\n/g, '\n'));
    patched = true;
}

if (patched) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("✅ Auto-uncheck keepOrigin implemented");
} else {
    console.log("❌ Target not found");
}
