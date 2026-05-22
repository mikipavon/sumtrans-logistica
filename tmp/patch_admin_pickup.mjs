import fs from 'fs';

const path = 'src/pages/Shipments.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Icons mapping
const iconTarget = `import { Search, Filter, Plus, MoreVertical, MapPin, Calendar, Truck, User, BarChart2, CheckCircle, Clock, AlertCircle, FileText, Printer, Trash2, ChevronUp, ChevronDown } from 'lucide-react';`;
const iconReplace = `import { Search, Filter, Plus, MoreVertical, MapPin, Calendar, Truck, User, BarChart2, CheckCircle, Clock, AlertCircle, FileText, Printer, Trash2, ChevronUp, ChevronDown, PackagePlus } from 'lucide-react';
import CreatePickupModal from '../components/shipments/CreatePickupModal';`;

content = content.replace(iconTarget, iconReplace);

// 2. State Mapping
const stateTarget = `    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);`;
const stateReplace = `    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);`;

content = content.replace(stateTarget, stateReplace);

// 3. Button
const buttonTarget = `                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-sm shadow-lg shadow-blue-500/20"
                        >
                            <Plus size={18} />
                            Nuevo
                        </button>
                    </div>`;

const buttonReplace = `                        <button
                            onClick={() => setIsPickupModalOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-bold text-sm shadow-lg shadow-amber-500/20"
                        >
                            <PackagePlus size={18} />
                            Recogida
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-sm shadow-lg shadow-blue-500/20"
                        >
                            <Plus size={18} />
                            Nuevo Envío
                        </button>
                    </div>`;

// handle diffs safely
const normC = content.replace(/\r\n/g, '\n');
const normT = buttonTarget.replace(/\r\n/g, '\n');

if (normC.includes(normT)) {
    content = normC.replace(normT, buttonReplace.replace(/\r\n/g, '\n'));
} else {
    console.error("❌ Button target not found");
}

// 4. Modal
const modalTarget = `                onSave={onCreateShipment}
                clients={clients}
                allPoblaciones={allPoblaciones}
                tariffs={tariffs}
            />
        </div>
    );
}`;

const modalReplace = `                onSave={onCreateShipment}
                clients={clients}
                allPoblaciones={allPoblaciones}
                tariffs={tariffs}
            />

            <CreatePickupModal
                isOpen={isPickupModalOpen}
                onClose={() => setIsPickupModalOpen(false)}
                onSave={onCreateShipment}
                clients={clients}
                allPoblaciones={allPoblaciones}
            />
        </div>
    );
}`;

const normC2 = content.replace(/\r\n/g, '\n');
const normT2 = modalTarget.replace(/\r\n/g, '\n');

if (normC2.includes(normT2)) {
    content = normC2.replace(normT2, modalReplace.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, content, 'utf8');
    console.log("✅ Shipment.jsx updated with Quick Pickup modal");
} else {
    console.error("❌ Modal target not found");
}

